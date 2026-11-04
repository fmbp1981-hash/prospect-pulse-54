#!/usr/bin/env python3
"""Durable, fail-closed lifecycle records for IntelliX Task Contracts."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import copy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import validate


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def task_digest(task: dict[str, Any]) -> str:
    return f"sha256:{hashlib.sha256(canonical_bytes(task)).hexdigest()}"


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def record_path(context: validate.ValidationContext, task_id: str) -> Path:
    directory = validate.resolve_contract_path(
        context.root,
        context.project.get("runtime", {}).get("records_path"),
        "runtime.records_path",
        must_exist=False,
    )
    return validate.resolve_contract_path(
        context.root,
        str((directory / f"{task_id}.json").relative_to(context.root)),
        "runtime task record",
        must_exist=False,
    )


def load_record(path: Path, task: dict[str, Any]) -> dict[str, Any]:
    if path.exists():
        value = validate.load(path)
        if not isinstance(value, dict):
            raise validate.ValidationError(f"{path}: runtime record must be an object")
        if value.get("task_id") != task.get("id"):
            raise validate.ValidationError(f"{path}: runtime task identity drift")
        if value.get("state") != task.get("status"):
            raise validate.ValidationError(f"{path}: runtime state drift")
        if value.get("task_digest") != task_digest(task):
            raise validate.ValidationError(f"{path}: runtime task digest drift")
        return value
    return {
        "schema_version": "1.0.0",
        "task_id": task["id"],
        "task_digest": task_digest(task),
        "state": task["status"],
        "events": [],
    }


def permitted_transition(
    context: validate.ValidationContext, current: str, target: str
) -> bool:
    configured = context.framework.get("runtime", {}).get("transitions", {})
    return target in configured.get(current, [])


def runtime_state_registry(
    context: validate.ValidationContext, name: str
) -> set[str]:
    runtime_policy = context.framework.get("runtime")
    configured = runtime_policy.get(name) if isinstance(runtime_policy, dict) else None
    lifecycle = context.framework.get("task_lifecycle")
    if (
        not isinstance(configured, list)
        or not configured
        or any(not isinstance(state, str) or not state for state in configured)
        or len(configured) != len(set(configured))
        or not isinstance(lifecycle, list)
        or any(state not in lifecycle for state in configured)
    ):
        raise validate.ValidationError(
            f"runtime.{name} must be a unique non-empty array of known lifecycle states"
        )
    return set(configured)


def guarded_transition_states(context: validate.ValidationContext) -> set[str]:
    return runtime_state_registry(context, "guarded_transition_states")


def dependency_satisfying_states(context: validate.ValidationContext) -> set[str]:
    satisfying = runtime_state_registry(context, "dependency_satisfying_states")
    guarded = guarded_transition_states(context)
    if not satisfying.issubset(guarded):
        raise validate.ValidationError(
            "runtime.dependency_satisfying_states must be a subset of "
            "runtime.guarded_transition_states"
        )
    return satisfying


def _record_transition(
    context: validate.ValidationContext,
    task_path: Path,
    target: str,
    *,
    reason: str,
    actor: str = "intellix-control-plane",
    selected_adapter: str | None = None,
    resolution: str | None = None,
    outcome: str = "transitioned",
    unblock_condition: str | None = None,
    allow_guarded: bool = False,
) -> dict[str, Any]:
    task = validate.load(task_path)
    if not isinstance(task, dict):
        raise validate.ValidationError(f"{task_path}: task must be an object")
    current = task.get("status")
    if target in guarded_transition_states(context) and not allow_guarded:
        raise validate.ValidationError(
            f"guarded task transition requires a dedicated completion path: "
            f"{current} -> {target}"
        )
    if not permitted_transition(context, current, target):
        raise validate.ValidationError(f"illegal task transition: {current} -> {target}")

    record_file = record_path(context, task["id"])
    record = load_record(record_file, task)
    previous_record = copy.deepcopy(record)
    record_existed = record_file.exists()
    event = {
        "sequence": len(record.get("events", [])) + 1,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "from": current,
        "to": target,
        "outcome": outcome,
        "reason": reason,
        "actor": actor,
        "decision_context": {
            "domain_role": task.get("ownership", {}).get("domain_role"),
            "risk_level": task.get("risk", {}).get("level"),
            "dependencies": task.get("dependencies", []),
            "writable_files": (
                task.get("scope", {}).get("create", [])
                + task.get("scope", {}).get("modify", [])
            ),
            "gates": task.get("gates", []),
        },
        "selected_adapter": selected_adapter,
        "resolution": resolution,
        "unblock_condition": unblock_condition,
    }
    updated_task = dict(task)
    updated_task["status"] = target
    record["events"].append(event)
    record["state"] = target
    record["task_digest"] = task_digest(updated_task)

    runtime_schema = validate.declared_path(context, "schemas", "runtime")
    schema = validate.load(runtime_schema)
    errors = validate.validate_schema(record, schema)
    if errors:
        raise validate.ValidationError("invalid runtime record: " + "; ".join(errors))

    atomic_json(record_file, record)
    try:
        atomic_json(task_path, updated_task)
    except BaseException:
        # Do not leave a durable APPROVED event when the task write failed.
        if record_existed:
            atomic_json(record_file, previous_record)
        else:
            record_file.unlink(missing_ok=True)
        raise
    return event


def transition(
    context: validate.ValidationContext,
    task_path: Path,
    target: str,
    *,
    reason: str,
    actor: str = "intellix-control-plane",
    selected_adapter: str | None = None,
    resolution: str | None = None,
    outcome: str = "transitioned",
    unblock_condition: str | None = None,
) -> dict[str, Any]:
    """Apply only an unguarded lifecycle transition.

    Guarded states deliberately remain unreachable through this generic API.
    """
    return _record_transition(
        context,
        task_path,
        target,
        reason=reason,
        actor=actor,
        selected_adapter=selected_adapter,
        resolution=resolution,
        outcome=outcome,
        unblock_condition=unblock_condition,
    )


def _complete_technical_approval(
    context: validate.ValidationContext,
    task_path: Path,
    *,
    reason: str,
) -> dict[str, Any]:
    """Internal sink used only after completion.py validates all approval gates."""
    task = validate.load(task_path)
    if not isinstance(task, dict) or task.get("status") != "IN_REVIEW":
        current = task.get("status") if isinstance(task, dict) else None
        raise validate.ValidationError(
            f"guarded technical approval requires IN_REVIEW, got {current!r}"
        )
    if "APPROVED" not in dependency_satisfying_states(context):
        raise validate.ValidationError(
            "APPROVED must remain a guarded dependency-satisfying state"
        )
    tasks = validate.resolve_contract_path(
        context.root,
        context.project.get("documents", {}).get("tasks"),
        "project documents.tasks",
        expect="directory",
    )
    evidence_dir = tasks / "evidence"
    for suffix in ("review.json", "approval.json"):
        evidence = evidence_dir / f"{task['id']}.{suffix}"
        if not evidence.is_file():
            raise validate.ValidationError(
                "guarded technical approval requires versioned review and approval evidence"
            )
    return _record_transition(
        context,
        task_path,
        "APPROVED",
        reason=reason,
        actor="intellix-guarded-completion",
        resolution="versioned-review-human-decision-and-exact-revision-ci",
        allow_guarded=True,
    )


def block(
    context: validate.ValidationContext,
    task_path: Path,
    reason: str,
    *,
    unblock_condition: str,
    selected_adapter: str | None = None,
    resolution: str | None = None,
) -> dict[str, Any]:
    return transition(
        context,
        task_path,
        "BLOCKED",
        reason=reason,
        outcome="blocked",
        unblock_condition=unblock_condition,
        selected_adapter=selected_adapter,
        resolution=resolution,
    )
