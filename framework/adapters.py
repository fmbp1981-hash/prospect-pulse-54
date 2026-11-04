#!/usr/bin/env python3
"""Bounded adapter handoff and resumable checkpoint artifacts."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import runtime
import validate


ISOLATION_EVIDENCE_PREFIX = "isolation:"
PANEL_EVIDENCE_PREFIX = "panel:"
PANEL_RISK_LEVELS = {"high", "critical"}


def same_identity(left: str | None, right: str | None) -> bool:
    if not left or not right:
        return False
    if left == right:
        return True
    if validate.is_isolated_identity(left) != validate.is_isolated_identity(right):
        # A fresh isolated reviewer session is independent from the executor
        # session even when both run on the same vendor (ADR-0007).
        return False
    return validate.identity_vendor(left) == validate.identity_vendor(right)


def _has_entry(evidence: list[str], prefix: str) -> bool:
    return any(item.startswith(prefix) and item[len(prefix):].strip() for item in evidence)


def isolated_review_errors(
    review: dict[str, Any],
    risk_level: str | None,
    review_provider: str | None = None,
    enforce_provider: bool = False,
) -> list[str]:
    """Enforce the anti-bias protocol for same-vendor isolated review (ADR-0007).

    The reviewer that actually ran must match the assigned reviewer in vendor
    and isolation, so a same-vendor isolated identity cannot be substituted for
    a cross-vendor assignment. The 'isolation:' and 'panel:' entries are
    executor-recorded self-attestations; the kernel only checks that they exist
    and are not empty.
    """
    executor = str(review.get("executor_identity") or "")
    assignment = str(review.get("reviewer_assignment") or "")
    identity = str(review.get("reviewer_identity") or "")
    vendor = validate.identity_vendor
    is_isolated = validate.is_isolated_identity
    errors: list[str] = []
    if is_isolated(executor):
        errors.append(validate.ISOLATED_EXECUTOR_ERROR)
    if vendor(identity) != vendor(assignment) or is_isolated(identity) != is_isolated(
        assignment
    ):
        errors.append(
            "reviewer identity does not match the reviewer assignment in vendor or isolation"
        )
    if not any(is_isolated(item) for item in (identity, assignment)):
        return errors
    for item in dict.fromkeys(
        error
        for reviewer in (assignment, identity)
        for error in validate.isolated_reviewer_errors(
            reviewer, review_provider, enforce_provider
        )
    ):
        errors.append(item)
    evidence = [str(item) for item in review.get("evidence", [])]
    if not _has_entry(evidence, ISOLATION_EVIDENCE_PREFIX):
        errors.append(
            "same-vendor isolated review requires a non-empty 'isolation:' evidence entry"
        )
    if risk_level in PANEL_RISK_LEVELS and not _has_entry(evidence, PANEL_EVIDENCE_PREFIX):
        errors.append(
            "high or critical same-vendor isolated review requires a non-empty "
            "'panel:' evidence entry"
        )
    return errors


def artifact_path(
    context: validate.ValidationContext, category: str, task_id: str
) -> Path:
    base = runtime.record_path(context, task_id).parent
    relative = (base / category / f"{task_id}.json").relative_to(context.root)
    return validate.resolve_contract_path(
        context.root, relative.as_posix(), f"runtime {category} artifact", must_exist=False
    )


def write_validated(
    context: validate.ValidationContext,
    schema_name: str,
    path: Path,
    value: dict[str, Any],
) -> Path:
    schema = validate.load(validate.declared_path(context, "schemas", schema_name))
    errors = validate.validate_schema(value, schema)
    if errors:
        raise validate.ValidationError("invalid artifact: " + "; ".join(errors))
    runtime.atomic_json(path, value)
    return path


def write_checkpoint(
    context: validate.ValidationContext, value: dict[str, Any]
) -> Path:
    return write_validated(
        context,
        "checkpoint",
        artifact_path(context, "checkpoints", value["task"]),
        value,
    )


def write_handoff(context: validate.ValidationContext, value: dict[str, Any]) -> Path:
    if same_identity(value.get("from_identity"), value.get("to_identity")):
        raise validate.ValidationError("executor and reviewer identities are not independent")
    if value.get("access") != "read-only":
        raise validate.ValidationError("reviewer handoff must be read-only")
    return write_validated(
        context,
        "handoff",
        artifact_path(context, "handoffs", value["task"]),
        value,
    )
