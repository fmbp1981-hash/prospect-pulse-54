#!/usr/bin/env python3
"""Fail-closed GitHub CI evidence for an exact repository revision."""

from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import runtime
import validate

Transport = Callable[[urllib.request.Request], tuple[int, dict[str, str], bytes]]
REVISION_PATTERN = re.compile(r"^[0-9a-f]{40}$")


class EvidenceIndeterminate(validate.ValidationError):
    """The provider could not return authoritative, parseable evidence."""


def verified_tls_context() -> ssl.SSLContext:
    paths = ssl.get_default_verify_paths()
    if paths.cafile or paths.capath:
        return ssl.create_default_context()
    for candidate in (
        "/etc/ssl/cert.pem",
        "/etc/ssl/certs/ca-certificates.crt",
        "/etc/pki/tls/certs/ca-bundle.crt",
    ):
        if Path(candidate).is_file():
            return ssl.create_default_context(cafile=candidate)
    return ssl.create_default_context()


def github_transport(request: urllib.request.Request) -> tuple[int, dict[str, str], bytes]:
    try:
        with urllib.request.urlopen(
            request, timeout=15, context=verified_tls_context()
        ) as response:
            return response.status, dict(response.headers.items()), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers.items()), exc.read()
    except (OSError, urllib.error.URLError) as exc:
        raise EvidenceIndeterminate(f"GitHub request failed: {type(exc).__name__}") from exc


def _request(
    repository: str,
    revision: str,
    token: str,
    page: int,
    transport: Transport,
) -> dict[str, Any]:
    encoded_repository = "/".join(
        urllib.parse.quote(part, safe="") for part in repository.split("/")
    )
    url = (
        f"https://api.github.com/repos/{encoded_repository}/commits/{revision}/check-runs"
        f"?filter=latest&per_page=100&page={page}"
    )
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "intellix-ci-evidence/1.0",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method="GET",
    )
    try:
        status, _, body = transport(request)
    except EvidenceIndeterminate:
        raise
    except (OSError, urllib.error.URLError) as exc:
        raise EvidenceIndeterminate(
            f"GitHub request failed: {type(exc).__name__}"
        ) from exc
    if status != 200:
        raise EvidenceIndeterminate(f"GitHub returned HTTP {status}")
    try:
        value = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise EvidenceIndeterminate("GitHub returned malformed JSON") from exc
    if not isinstance(value, dict) or not isinstance(value.get("check_runs"), list):
        raise EvidenceIndeterminate("GitHub response is missing check_runs")
    return value


def query_check_runs(
    repository: str,
    revision: str,
    token: str,
    transport: Transport = github_transport,
) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    total: int | None = None
    for page in range(1, 101):
        response = _request(repository, revision, token, page, transport)
        reported_total = response.get("total_count")
        if not isinstance(reported_total, int) or reported_total < 0:
            raise EvidenceIndeterminate("GitHub response has invalid total_count")
        if total is None:
            total = reported_total
        elif total != reported_total:
            raise EvidenceIndeterminate("GitHub pagination total_count changed")
        page_checks = response["check_runs"]
        if any(not isinstance(check, dict) for check in page_checks):
            raise EvidenceIndeterminate("GitHub response contains an invalid check run")
        checks.extend(page_checks)
        if len(checks) >= total:
            if len(checks) != total:
                raise EvidenceIndeterminate("GitHub returned an inconsistent check count")
            return checks
        if not page_checks:
            raise EvidenceIndeterminate("GitHub pagination ended before total_count")
    raise EvidenceIndeterminate("GitHub check pagination exceeded the safety limit")


def _normalize_check(check: dict[str, Any]) -> dict[str, Any]:
    normalized = {
        "name": check.get("name"),
        "head_sha": check.get("head_sha"),
        "status": check.get("status"),
        "conclusion": check.get("conclusion"),
        "details_url": check.get("details_url"),
        "completed_at": check.get("completed_at"),
    }
    valid_optional_strings = all(
        normalized[field] is None or isinstance(normalized[field], str)
        for field in ("conclusion", "details_url", "completed_at")
    )
    if not (
        isinstance(normalized["name"], str)
        and REVISION_PATTERN.fullmatch(str(normalized["head_sha"]))
        and isinstance(normalized["status"], str)
        and valid_optional_strings
    ):
        raise EvidenceIndeterminate("GitHub response contains malformed check fields")
    return normalized


def evaluate(
    context: validate.ValidationContext,
    revision: str,
    token: str | None,
    transport: Transport = github_transport,
) -> dict[str, Any]:
    ci_config = context.project.get("quality", {}).get("ci", {})
    repository = ci_config.get("repository")
    required = ci_config.get("required_checks")
    evidence: dict[str, Any] = {
        "schema_version": "1.0.0",
        "provider": "github",
        "source": "github-api",
        "repository": repository,
        "revision": revision,
        "required_checks": required,
        "observed_checks": [],
        "decision": "indeterminate",
        "reasons": [],
        "queried_at": datetime.now(timezone.utc).isoformat(),
    }
    if not isinstance(revision, str) or not REVISION_PATTERN.fullmatch(revision):
        evidence["reasons"] = ["revision must be a full lowercase 40-character commit SHA"]
        return evidence
    if (
        ci_config.get("provider") != "github"
        or not isinstance(repository, str)
        or not isinstance(required, list)
        or not required
        or any(not isinstance(name, str) or not name.strip() for name in required)
        or len(required) != len(set(required))
    ):
        evidence["reasons"] = ["project GitHub CI configuration is invalid"]
        return evidence
    if not token:
        evidence["reasons"] = ["GitHub credential is unavailable"]
        return evidence
    try:
        checks = query_check_runs(repository, revision, token, transport)
        observed = [_normalize_check(check) for check in checks]
    except EvidenceIndeterminate as exc:
        evidence["reasons"] = [str(exc)]
        return evidence

    evidence["observed_checks"] = observed
    reasons: list[str] = []
    for name in required:
        candidates = [check for check in observed if check["name"] == name]
        if not candidates:
            reasons.append(f"required check {name!r} is missing")
            continue
        exact = [check for check in candidates if check["head_sha"] == revision]
        if not exact:
            reasons.append(f"required check {name!r} is stale or belongs to another revision")
            continue
        if not any(
            check["status"] == "completed"
            and check["conclusion"] == "success"
            and isinstance(check["completed_at"], str)
            and bool(check["completed_at"])
            for check in exact
        ):
            reasons.append(f"required check {name!r} is incomplete, indeterminate or failed")
    evidence["decision"] = "blocked" if reasons else "eligible"
    evidence["reasons"] = reasons
    return evidence


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--token-env", default="GITHUB_TOKEN")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        root = validate.resolve_root(args.root)
        context = validate.build_context(root)
        project_errors = validate.validate_project(context=context)
        if project_errors:
            raise validate.ValidationError("; ".join(project_errors))
        evidence = evaluate(context, args.revision, os.environ.get(args.token_env))
        schema = validate.load(validate.declared_path(context, "schemas", "ci_evidence"))
        errors = validate.validate_schema(evidence, schema)
        if errors:
            raise validate.ValidationError("invalid CI evidence: " + "; ".join(errors))
        if args.output:
            output = validate.resolve_contract_path(
                root, args.output.as_posix(), "--output", must_exist=False
            )
            runtime.atomic_json(output, evidence)
        print(json.dumps(evidence, indent=2, sort_keys=True))
        return 0 if evidence["decision"] == "eligible" else 1
    except (OSError, validate.ValidationError) as exc:
        print(f"BLOCKED: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
