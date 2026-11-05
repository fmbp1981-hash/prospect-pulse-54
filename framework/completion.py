#!/usr/bin/env python3
"""Guarded technical completion and evidence-aware dependency eligibility.

This module intentionally has no command-line entry point.  The generic dispatcher
cannot reach guarded lifecycle states; a controlling orchestrator may call
``complete_technical_approval`` only after receiving the explicit human decision.
Local identities remain forgeable process evidence, not authentication.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import adapters
import ci
import runtime
import validate


REVISION_PATTERN = re.compile(r"^[0-9a-f]{40}$")
MAX_DECISION_SKEW = timedelta(minutes=5)


def digest_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def digest_value(value: Any) -> str:
    return digest_bytes(runtime.canonical_bytes(value))


def _git(root: Path, *arguments: str, check: bool = True) -> str:
    forbidden = {"--force", "-f", "reset", "clean"}
    if forbidden.intersection(arguments):
        raise validate.ValidationError("destructive Git operation is forbidden")
    result = subprocess.run(
        ["git", "-C", str(root), *arguments],
        capture_output=True,
        text=True,
        check=False,
    )
    if check and result.returncode:
        raise validate.ValidationError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


def _git_bytes(root: Path, *arguments: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(root), *arguments], capture_output=True, check=False
    )
    if result.returncode:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise validate.ValidationError(detail or "Git object is unavailable")
    return result.stdout


def _relative(context: validate.ValidationContext, path: Path) -> str:
    return path.resolve().relative_to(context.root.resolve()).as_posix()


def evidence_paths(
    context: validate.ValidationContext, task_id: str
) -> tuple[Path, Path]:
    tasks = validate.resolve_contract_path(
        context.root,
        context.project.get("documents", {}).get("tasks"),
        "project documents.tasks",
        expect="directory",
    )
    directory = tasks / "evidence"
    review = validate.resolve_contract_path(
        context.root,
        (directory / f"{task_id}.review.json").relative_to(context.root).as_posix(),
        "versioned review evidence",
        must_exist=False,
    )
    approval = validate.resolve_contract_path(
        context.root,
        (directory / f"{task_id}.approval.json").relative_to(context.root).as_posix(),
        "versioned approval evidence",
        must_exist=False,
    )
    return review, approval


def _load_at(root: Path, revision: str, relative: str) -> dict[str, Any]:
    try:
        value = json.loads(_git_bytes(root, "show", f"{revision}:{relative}"))
    except json.JSONDecodeError as exc:
        raise validate.ValidationError(
            f"{relative} is not valid JSON at revision {revision}"
        ) from exc
    if not isinstance(value, dict):
        raise validate.ValidationError(
            f"{relative} must be an object at revision {revision}"
        )
    return value


def _manifest_digest_at(root: Path, revision: str, relatives: list[str]) -> str:
    digest = hashlib.sha256()
    for relative in sorted(set(relatives)):
        _git_bytes(root, "rev-parse", "--verify", f"{revision}^{{commit}}")
        probe = subprocess.run(
            ["git", "-C", str(root), "cat-file", "-e", f"{revision}:{relative}"],
            capture_output=True,
            check=False,
        )
        content = (
            _git_bytes(root, "show", f"{revision}:{relative}")
            if probe.returncode == 0
            else b"<deleted>"
        )
        name = relative.encode("utf-8")
        digest.update(len(name).to_bytes(8, "big"))
        digest.update(name)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return f"sha256:{digest.hexdigest()}"


def _manifest_digest_worktree(root: Path, relatives: list[str]) -> str:
    digest = hashlib.sha256()
    for relative in sorted(set(relatives)):
        path = validate.resolve_contract_path(
            root, relative, f"evidence input {relative}", expect="file"
        )
        content = path.read_bytes()
        name = relative.encode("utf-8")
        digest.update(len(name).to_bytes(8, "big"))
        digest.update(name)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return f"sha256:{digest.hexdigest()}"


def source_paths(task: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for value in task.get("source", {}).values():
        paths.extend(value if isinstance(value, list) else [value])
    if not paths or any(not isinstance(path, str) for path in paths):
        raise validate.ValidationError("task source paths are malformed")
    return paths


def kernel_paths(context: validate.ValidationContext) -> list[str]:
    return [_relative(context, path) for path in validate.kernel_manifest(context)]


def control_plane_paths(context: validate.ValidationContext) -> list[str]:
    return [
        _relative(context, path) for path in validate.control_plane_manifest(context)
    ]


def changed_files(root: Path, start: str, end: str) -> list[str]:
    output = _git_bytes(
        root, "diff", "--no-renames", "--name-only", "--diff-filter=ACDMRT", "-z", f"{start}..{end}"
    )
    try:
        return sorted(item.decode("utf-8") for item in output.split(b"\0") if item)
    except UnicodeDecodeError as exc:
        raise validate.ValidationError("Git fileset contains invalid UTF-8") from exc


def derive_phase_base(
    context: validate.ValidationContext, task_path: Path, reviewed_revision: str
) -> str:
    relative = _relative(context, task_path)
    commits = _git(
        context.root, "log", "--reverse", "--format=%H", reviewed_revision, "--", relative
    ).splitlines()
    review_ref = f"tasks/evidence/{task_path.stem}.review.json"
    approval_ref = f"tasks/evidence/{task_path.stem}.approval.json"
    for commit in commits:
        candidate = _load_at(context.root, commit, relative)
        if candidate.get("status") != "IN_PROGRESS":
            continue
        create = set(candidate.get("scope", {}).get("create", []))
        if {review_ref, approval_ref} - create:
            continue
        parent_status: str | None = None
        try:
            parent_status = _load_at(context.root, f"{commit}^", relative).get("status")
        except validate.ValidationError:
            pass
        if parent_status != "IN_PROGRESS":
            return commit
    raise validate.ValidationError(
        "could not derive the first committed completion-phase base"
    )


def _require_origin_binding(context: validate.ValidationContext) -> str:
    repository = context.project.get("quality", {}).get("ci", {}).get("repository")
    origin = _git(context.root, "config", "--get", "remote.origin.url")
    accepted_origins = {
        f"https://github.com/{repository}",
        f"https://github.com/{repository}.git",
        f"git@github.com:{repository}",
        f"git@github.com:{repository}.git",
        f"ssh://git@github.com/{repository}",
        f"ssh://git@github.com/{repository}.git",
    }
    if not isinstance(repository, str) or origin not in accepted_origins:
        raise validate.ValidationError(
            "origin remote does not match the configured GitHub repository"
        )
    return repository


def derive_reviewed_revision(
    context: validate.ValidationContext, task: dict[str, Any]
) -> tuple[str, str]:
    if _git(context.root, "status", "--porcelain"):
        raise validate.ValidationError("completion requires a clean authorized worktree")
    branch = _git(context.root, "branch", "--show-current")
    if not branch:
        raise validate.ValidationError("completion requires an authorized branch checkout")
    upstream = _git(
        context.root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"
    )
    if upstream != f"origin/{branch}":
        raise validate.ValidationError(
            "authorized branch must track its matching origin branch"
        )
    _require_origin_binding(context)
    common = Path(
        _git(context.root, "rev-parse", "--path-format=absolute", "--git-common-dir")
    ).resolve()
    source_root = common.parent if common.name == ".git" else None
    expected = (
        source_root.parent / f"{source_root.name}-{task['id']}"
        if source_root is not None
        else None
    )
    if expected is None or context.root.resolve() != expected.resolve():
        raise validate.ValidationError(
            "completion must run in the derived dedicated task worktree"
        )
    revision = _git(context.root, "rev-parse", "HEAD")
    remote = _git(
        context.root, "ls-remote", "--heads", "origin", f"refs/heads/{branch}"
    ).splitlines()
    if len(remote) != 1 or not remote[0].startswith(f"{revision}\t"):
        raise validate.ValidationError(
            "reviewed revision must equal the live remote authorized-branch tip"
        )
    return revision, branch


def _parse_time(value: Any, label: str) -> datetime:
    if not isinstance(value, str):
        raise validate.ValidationError(f"{label} must be an ISO-8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise validate.ValidationError(
            f"{label} must be an ISO-8601 timestamp"
        ) from exc
    if parsed.tzinfo is None:
        raise validate.ValidationError(f"{label} must include a timezone")
    return parsed


def _validate_review(
    context: validate.ValidationContext,
    task: dict[str, Any],
    task_path: Path,
    review: dict[str, Any],
    revision: str,
    branch: str,
) -> tuple[str, list[str], dict[str, str]]:
    schema = validate.load(validate.declared_path(context, "schemas", "review_evidence"))
    errors = validate.validate_schema(review, schema)
    if errors:
        raise validate.ValidationError("invalid review evidence: " + "; ".join(errors))
    phase_base = derive_phase_base(context, task_path, revision)
    reviewed_files = changed_files(context.root, phase_base, revision)
    writable = set(task.get("scope", {}).get("create", [])) | set(
        task.get("scope", {}).get("modify", [])
    )
    unauthorized = sorted(set(reviewed_files) - writable)
    expected = {
        "task": task["id"],
        "task_digest": runtime.task_digest(task),
        "phase_base": phase_base,
        "reviewed_revision": revision,
        "branch": branch,
        "diff_ref": f"{phase_base}..{revision}",
        "executor_identity": task.get("ownership", {}).get("executor"),
        "reviewer_assignment": task.get("ownership", {}).get("reviewer"),
        "fileset_digest": _manifest_digest_at(context.root, revision, reviewed_files),
        "project_digest": _manifest_digest_at(
            context.root, revision, [_relative(context, context.project_path)]
        ),
        "source_digest": _manifest_digest_at(
            context.root, revision, source_paths(task)
        ),
        "kernel_digest": _manifest_digest_at(
            context.root, revision, kernel_paths(context)
        ),
        "control_plane_digest": _manifest_digest_at(
            context.root, revision, control_plane_paths(context)
        ),
    }
    mismatches = [key for key, value in expected.items() if review.get(key) != value]
    if review.get("reviewed_files") != reviewed_files:
        mismatches.append("reviewed_files")
    review_ref, approval_ref = evidence_paths(context, task["id"])
    if set(reviewed_files) & {
        _relative(context, review_ref),
        _relative(context, approval_ref),
    }:
        raise validate.ValidationError(
            "versioned completion evidence must not exist in reviewed revision R"
        )
    for evidence_path in (review_ref, approval_ref):
        try:
            _git_bytes(context.root, "cat-file", "-e", f"{revision}:{_relative(context, evidence_path)}")
        except validate.ValidationError:
            continue
        raise validate.ValidationError(
            "versioned completion evidence must not exist in reviewed revision R"
        )
    if unauthorized:
        raise validate.ValidationError(
            "reviewed revision changes files outside the Task Contract: "
            + ", ".join(unauthorized)
        )
    if mismatches:
        raise validate.ValidationError(
            "review evidence binding mismatch: " + ", ".join(sorted(set(mismatches)))
        )
    if review.get("decision") != "approved":
        raise validate.ValidationError("independent review did not approve R")
    if adapters.same_identity(
        str(review.get("executor_identity")), str(review.get("reviewer_identity"))
    ):
        raise validate.ValidationError("executor and reviewer identities are not independent")
    if adapters.same_identity(
        str(review.get("executor_identity")), str(review.get("reviewer_assignment"))
    ):
        raise validate.ValidationError("executor and reviewer assignments are not independent")
    isolation_errors = adapters.isolated_review_errors(
        review,
        task.get("risk", {}).get("level"),
        review_provider=context.project.get("execution", {}).get("review_provider"),
        enforce_provider=True,
    )
    if isolation_errors:
        raise validate.ValidationError("; ".join(isolation_errors))
    _parse_time(review.get("reviewed_at"), "reviewed_at")
    return phase_base, reviewed_files, expected


def _completion_required_fields(approval: dict[str, Any]) -> list[str]:
    required = {
        "schema_version",
        "phase_base",
        "reviewed_revision",
        "branch",
        "pre_contract_digest",
        "post_contract_digest",
        "fileset_digest",
        "project_digest",
        "source_digest",
        "kernel_digest",
        "control_plane_digest",
        "review_ref",
        "review_digest",
        "human_decision",
        "review_ci",
        "completion_ci",
    }
    return sorted(required - set(approval))


def complete_technical_approval(
    context: validate.ValidationContext,
    task_path: Path,
    review: dict[str, Any],
    reviewed_ci: dict[str, Any],
    human_decision: dict[str, Any],
    token: str | None,
    *,
    transport: ci.Transport = ci.github_transport,
) -> dict[str, Any]:
    """Write guarded completion metadata after every R gate passes.

    This function must be invoked only in response to the explicit post-review human
    decision.  It validates that record structurally but cannot authenticate identity.
    """
    task = validate.load(task_path)
    if not isinstance(task, dict):
        raise validate.ValidationError(f"{task_path}: task must be an object")
    if task.get("status") != "IN_REVIEW":
        raise validate.ValidationError("technical completion requires IN_REVIEW")
    revision, branch = derive_reviewed_revision(context, task)
    phase_base, _, bindings = _validate_review(
        context, task, task_path, review, revision, branch
    )
    if set(human_decision) != {"origin", "reference", "decided_at", "limitations"}:
        raise validate.ValidationError("human decision record has unexpected fields")
    if human_decision.get("origin") != "controlling-session":
        raise validate.ValidationError(
            "human decision must originate in the controlling session"
        )
    if not all(
        isinstance(human_decision.get(field), str) and human_decision[field].strip()
        for field in ("reference", "limitations")
    ):
        raise validate.ValidationError("human decision reference and limitations are required")
    reviewed_at = _parse_time(review.get("reviewed_at"), "reviewed_at")
    decided_at = _parse_time(human_decision.get("decided_at"), "decided_at")
    if decided_at <= reviewed_at:
        raise validate.ValidationError("human decision must occur after independent review")
    if decided_at > datetime.now(timezone.utc) + MAX_DECISION_SKEW:
        raise validate.ValidationError("human decision timestamp is too far in the future")
    if decided_at < datetime.now(timezone.utc) - timedelta(hours=24):
        raise validate.ValidationError("human decision timestamp is stale")
    ci_schema = validate.load(validate.declared_path(context, "schemas", "ci_evidence"))
    ci_errors = validate.validate_schema(reviewed_ci, ci_schema)
    ci_config = context.project.get("quality", {}).get("ci", {})
    if ci_errors:
        raise validate.ValidationError(
            "invalid reviewed-revision CI evidence: " + "; ".join(ci_errors)
        )
    if (
        reviewed_ci.get("decision") != "eligible"
        or reviewed_ci.get("revision") != revision
        or reviewed_ci.get("repository") != ci_config.get("repository")
        or reviewed_ci.get("required_checks") != ci_config.get("required_checks")
    ):
        raise validate.ValidationError("reviewed-revision CI evidence binding mismatch")
    queried_at = _parse_time(reviewed_ci.get("queried_at"), "CI queried_at")
    if queried_at <= reviewed_at or decided_at <= queried_at:
        raise validate.ValidationError(
            "human decision must occur after independent review and reviewed-revision CI"
        )
    live_ci = ci.evaluate(context, revision, token, transport)
    if live_ci.get("decision") != "eligible":
        reasons = live_ci.get("reasons", [])
        raise validate.ValidationError(
            "reviewed revision CI is not eligible: " + "; ".join(reasons)
        )
    updated = dict(task)
    updated["status"] = "APPROVED"
    review_path, approval_path = evidence_paths(context, task["id"])
    review_ref = _relative(context, review_path)
    approval_ref = _relative(context, approval_path)
    declared_create = set(task.get("scope", {}).get("create", []))
    declared_modify = set(task.get("scope", {}).get("modify", []))
    if {review_ref, approval_ref} - declared_create or _relative(
        context, task_path
    ) not in declared_modify:
        raise validate.ValidationError(
            "completion metadata paths are not authorized by the Task Contract"
        )
    approval = {
        "task": task["id"],
        "gate": "technical_completion",
        "decision": "approved",
        "actor": "controlling-session-human-process-evidence",
        "timestamp": human_decision["decided_at"],
        "evidence": [review_ref, "live-github-ci-for-reviewed-revision"],
        "schema_version": "1.0.0",
        "phase_base": phase_base,
        "reviewed_revision": revision,
        "branch": branch,
        "pre_contract_digest": runtime.task_digest(task),
        "post_contract_digest": runtime.task_digest(updated),
        "fileset_digest": bindings["fileset_digest"],
        "project_digest": bindings["project_digest"],
        "source_digest": bindings["source_digest"],
        "kernel_digest": bindings["kernel_digest"],
        "control_plane_digest": bindings["control_plane_digest"],
        "review_ref": review_ref,
        "review_digest": digest_value(review),
        "human_decision": human_decision,
        "review_ci": {
            "provider": reviewed_ci["provider"],
            "repository": reviewed_ci["repository"],
            "revision": reviewed_ci["revision"],
            "required_checks": reviewed_ci["required_checks"],
            "decision": reviewed_ci["decision"],
            "queried_at": reviewed_ci["queried_at"],
        },
        "completion_ci": live_ci,
    }
    schema = validate.load(validate.declared_path(context, "schemas", "approval"))
    errors = validate.validate_schema(approval, schema)
    if errors or _completion_required_fields(approval):
        raise validate.ValidationError(
            "invalid approval evidence: " + "; ".join(errors + _completion_required_fields(approval))
        )
    review_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        runtime.atomic_json(review_path, review)
        runtime.atomic_json(approval_path, approval)
        runtime._complete_technical_approval(
            context,
            task_path,
            reason="versioned review, explicit human decision and live exact-R CI passed",
        )
    except BaseException:
        review_path.unlink(missing_ok=True)
        approval_path.unlink(missing_ok=True)
        raise
    return approval


def _derive_status_revision(
    context: validate.ValidationContext, approval_relative: str
) -> str:
    result = _git(
        context.root,
        "log",
        "-1",
        "--format=%H",
        "--diff-filter=A",
        "--",
        approval_relative,
    )
    if not REVISION_PATTERN.fullmatch(result):
        raise validate.ValidationError("approval evidence has no committed status revision A")
    return result


def dependency_eligibility(
    context: validate.ValidationContext,
    task: dict[str, Any],
    token: str | None,
    *,
    transport: ci.Transport = ci.github_transport,
) -> list[str]:
    """Return explicit blocking reasons for a dependency-satisfying task."""
    reasons: list[str] = []
    task_id = task.get("id")
    if task.get("status") != "APPROVED":
        return [
            f"dependency {task_id!r} state {task.get('status')!r} has no implemented evidence authority"
        ]
    review_path, approval_path = evidence_paths(context, str(task_id))
    try:
        review = validate.load(review_path)
        approval = validate.load(approval_path)
    except (OSError, validate.ValidationError) as exc:
        return [f"dependency {task_id!r} completion evidence unavailable: {exc}"]
    if not isinstance(review, dict) or not isinstance(approval, dict):
        return [f"dependency {task_id!r} completion evidence must be objects"]
    review_schema = validate.load(
        validate.declared_path(context, "schemas", "review_evidence")
    )
    approval_schema = validate.load(validate.declared_path(context, "schemas", "approval"))
    reasons.extend(validate.validate_schema(review, review_schema))
    reasons.extend(validate.validate_schema(approval, approval_schema))
    missing = _completion_required_fields(approval)
    if missing:
        reasons.append("completion approval fields missing: " + ", ".join(missing))
    if reasons:
        return reasons
    task_path = validate.resolve_contract_path(
        context.root,
        (
            validate.resolve_contract_path(
                context.root,
                context.project.get("documents", {}).get("tasks"),
                "project documents.tasks",
                expect="directory",
            )
            / f"{task_id}.yaml"
        ).relative_to(context.root).as_posix(),
        "dependency task",
        expect="file",
    )
    review_relative = _relative(context, review_path)
    approval_relative = _relative(context, approval_path)
    task_relative = _relative(context, task_path)
    revision = approval["reviewed_revision"]
    try:
        if approval.get("decision") != "approved" or approval.get("gate") != "technical_completion":
            reasons.append("approval decision is not technical completion approved")
        if review.get("decision") != "approved":
            reasons.append("independent review is not approved")
        if review.get("task") != task_id or approval.get("task") != task_id:
            reasons.append("completion evidence task identity mismatch")
        if approval.get("review_ref") != review_relative:
            reasons.append("approval review_ref does not bind the versioned review evidence")
        if adapters.same_identity(
            str(review.get("executor_identity")), str(review.get("reviewer_identity"))
        ) or adapters.same_identity(
            str(review.get("executor_identity")), str(review.get("reviewer_assignment"))
        ):
            reasons.append("reviewer is not independent from executor")
        reasons.extend(
            adapters.isolated_review_errors(review, task.get("risk", {}).get("level"))
        )
        human = approval.get("human_decision", {})
        if human.get("origin") != "controlling-session":
            reasons.append("human decision is not from the controlling session")
        reviewed_at = _parse_time(review.get("reviewed_at"), "reviewed_at")
        review_ci_at = _parse_time(
            approval["review_ci"].get("queried_at"), "review CI queried_at"
        )
        decided_at = _parse_time(human.get("decided_at"), "human decision decided_at")
        if not reviewed_at < review_ci_at < decided_at:
            reasons.append("review, CI and human decision ordering is invalid")
        if decided_at > datetime.now(timezone.utc) + MAX_DECISION_SKEW:
            reasons.append("human decision timestamp is too far in the future")
        status_revision = _derive_status_revision(context, approval_relative)
        _git(context.root, "merge-base", "--is-ancestor", revision, status_revision)
        _git(context.root, "merge-base", "--is-ancestor", status_revision, "HEAD")
        parents = _git(
            context.root, "rev-list", "--parents", "-n", "1", status_revision
        ).split()
        if len(parents) != 2 or parents[1] != revision:
            reasons.append("status revision A must be a direct child of reviewed revision R")
        completion_diff = changed_files(context.root, revision, status_revision)
        permitted = sorted([task_relative, review_relative, approval_relative])
        if completion_diff != permitted:
            reasons.append("R-to-A diff is not confined to completion metadata")
        if _load_at(context.root, status_revision, approval_relative) != approval:
            reasons.append("approval evidence differs from committed status revision A")
        task_at_r = _load_at(context.root, revision, task_relative)
        task_at_a = _load_at(context.root, status_revision, task_relative)
        if task_at_a != task:
            reasons.append("current task differs from committed status revision A")
        if runtime.task_digest(task_at_r) != approval["pre_contract_digest"]:
            reasons.append("pre-completion task digest drift")
        if runtime.task_digest(task) != approval["post_contract_digest"]:
            reasons.append("post-completion task digest drift")
        if digest_value(review) != approval["review_digest"]:
            reasons.append("review evidence digest drift")
        if review.get("task_digest") != approval["pre_contract_digest"]:
            reasons.append("review task digest does not bind the pre-completion contract")
        if review.get("reviewed_revision") != revision:
            reasons.append("review and approval revisions differ")
        if review.get("branch") != approval["branch"]:
            reasons.append("review and approval branches differ")
        if review.get("phase_base") != approval["phase_base"]:
            reasons.append("review and approval phase bases differ")
        if not set(review.get("reviewed_files", [])).issubset(
            set(task.get("scope", {}).get("create", []))
            | set(task.get("scope", {}).get("modify", []))
        ):
            reasons.append("reviewed files exceed the Task Contract fileset")
        _git(context.root, "merge-base", "--is-ancestor", approval["phase_base"], revision)
        if changed_files(context.root, approval["phase_base"], revision) != review.get(
            "reviewed_files"
        ):
            reasons.append("reviewed files are not the derived phase-base-to-R fileset")
        for key in ("project_digest", "source_digest", "kernel_digest", "control_plane_digest"):
            if review.get(key) != approval.get(key):
                reasons.append(f"review and approval {key} values differ")
        if review.get("fileset_digest") != approval["fileset_digest"]:
            reasons.append("review and approval fileset digests differ")
        if review.get("control_plane_digest") != approval["control_plane_digest"]:
            reasons.append("review and approval control-plane digests differ")
        if _manifest_digest_at(
            context.root, revision, review.get("reviewed_files", [])
        ) != approval["fileset_digest"]:
            reasons.append("reviewed fileset content drift")
        if _manifest_digest_worktree(
            context.root, [_relative(context, context.project_path)]
        ) != approval["project_digest"]:
            reasons.append("project binding drift")
        if _manifest_digest_worktree(
            context.root, source_paths(task)
        ) != approval["source_digest"]:
            reasons.append("declared task source drift")
        if _manifest_digest_worktree(
            context.root, kernel_paths(context)
        ) != approval["kernel_digest"]:
            reasons.append("normative kernel or policy drift")
        if _manifest_digest_worktree(
            context.root, control_plane_paths(context)
        ) != approval["control_plane_digest"]:
            reasons.append("control-plane implementation drift")
        ci_config = context.project.get("quality", {}).get("ci", {})
        completion_ci = approval.get("completion_ci", {})
        if (
            completion_ci.get("revision") != revision
            or completion_ci.get("decision") != "eligible"
            or completion_ci.get("repository") != ci_config.get("repository")
            or completion_ci.get("required_checks") != ci_config.get("required_checks")
        ):
            reasons.append("completion-time live CI evidence is invalid")
        completion_ci_at = _parse_time(
            completion_ci.get("queried_at"), "completion CI queried_at"
        )
        if completion_ci_at < decided_at or completion_ci_at > datetime.now(timezone.utc) + MAX_DECISION_SKEW:
            reasons.append("completion CI and human decision ordering is invalid")
        recorded_ci = approval["review_ci"]
        if (
            recorded_ci.get("repository") != ci_config.get("repository")
            or recorded_ci.get("required_checks") != ci_config.get("required_checks")
            or recorded_ci.get("revision") != revision
            or recorded_ci.get("decision") != "eligible"
        ):
            reasons.append("recorded reviewed-revision CI binding drift")
        _require_origin_binding(context)
        branch = approval["branch"]
        remote = _git(
            context.root,
            "ls-remote",
            "--heads",
            "origin",
            f"refs/heads/{branch}",
        ).splitlines()
        if len(remote) != 1:
            reasons.append("authorized remote branch is unavailable")
        else:
            remote_tip = remote[0].split("\t", 1)[0]
            _git(context.root, "merge-base", "--is-ancestor", status_revision, remote_tip)
        for label, candidate in (("R", revision), ("A", status_revision)):
            live = ci.evaluate(context, candidate, token, transport)
            if live.get("decision") != "eligible":
                reasons.append(
                    f"live exact-{label} CI is not eligible: "
                    + "; ".join(live.get("reasons", []))
                )
    except (OSError, validate.ValidationError) as exc:
        reasons.append(str(exc))
    return reasons


def dependency_token() -> str | None:
    return os.environ.get("GITHUB_TOKEN")
