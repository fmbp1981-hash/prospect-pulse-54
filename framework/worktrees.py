#!/usr/bin/env python3
"""Fail-closed worktree setup and exclusive fileset reservations."""

from __future__ import annotations

import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import adapters
import runtime
import validate

ACTIVE_STATES = {"reserving", "reserved"}


def git(root: Path, *arguments: str) -> str:
    forbidden = {"--force", "-f", "reset", "clean"}
    if forbidden.intersection(arguments):
        raise validate.ValidationError("destructive Git operation is forbidden")
    result = subprocess.run(
        ["git", "-C", str(root), *arguments], capture_output=True, text=True, check=False
    )
    if result.returncode:
        raise validate.ValidationError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


def reservation_path(context: validate.ValidationContext, task_id: str) -> Path:
    return adapters.artifact_path(context, "reservations", task_id)


def active_reservations(context: validate.ValidationContext) -> list[dict[str, Any]]:
    directory = reservation_path(context, "TASK-000").parent
    if not directory.exists():
        return []
    records: list[dict[str, Any]] = []
    schema = validate.load(validate.declared_path(context, "schemas", "reservation"))
    for path in sorted(directory.glob("TASK-*.json")):
        value = validate.load(path)
        if not isinstance(value, dict):
            raise validate.ValidationError(f"{path}: reservation must be an object")
        errors = validate.validate_schema(value, schema)
        if errors:
            raise validate.ValidationError(
                f"{path}: invalid reservation: " + "; ".join(errors)
            )
        if value.get("state") in ACTIVE_STATES:
            records.append(value)
    return records


def active_reservation(
    context: validate.ValidationContext, task_id: str
) -> dict[str, Any] | None:
    return next(
        (record for record in active_reservations(context) if record.get("task_id") == task_id),
        None,
    )


def reserve(
    context: validate.ValidationContext,
    task: dict[str, Any],
    worktree_path: Path,
    branch: str,
    base_commit: str,
    owner: str,
) -> Path:
    writable = task.get("scope", {}).get("create", []) + task.get("scope", {}).get("modify", [])
    for existing in active_reservations(context):
        if existing.get("task_id") == task["id"]:
            raise validate.ValidationError(f"task {task['id']} already has an active reservation")
        if any(
            validate.patterns_overlap(left, right)
            for left in writable
            for right in existing.get("writable_globs", [])
        ):
            raise validate.ValidationError(
                f"fileset reservation collision with {existing.get('task_id')}"
            )
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "schema_version": "1.0.0",
        "task_id": task["id"],
        "task_digest": runtime.task_digest(task),
        "repository": str(context.root),
        "worktree_path": str(worktree_path),
        "branch": branch,
        "base_commit": base_commit,
        "writable_globs": writable,
        "owner": owner,
        "state": "reserving",
        "created_at": now,
        "updated_at": now,
        "reason": None,
    }
    path = reservation_path(context, task["id"])
    adapters.write_validated(context, "reservation", path, record)
    return path


def update_reservation(
    context: validate.ValidationContext, path: Path, state: str, reason: str | None = None
) -> dict[str, Any]:
    record = validate.load(path)
    if not isinstance(record, dict):
        raise validate.ValidationError(f"{path}: reservation must be an object")
    record["state"] = state
    record["reason"] = reason
    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    adapters.write_validated(context, "reservation", path, record)
    return record


def require_clean(root: Path) -> None:
    if git(root, "status", "--porcelain"):
        raise validate.ValidationError(f"worktree is dirty: {root}")


def prepare(
    context: validate.ValidationContext,
    task: dict[str, Any],
    owner: str,
    destination: Path | None = None,
) -> dict[str, Any]:
    if task.get("risk", {}).get("level") not in {"medium", "high", "critical"}:
        raise validate.ValidationError("dedicated worktree is only mandatory from medium risk")
    require_clean(context.root)
    branch = git(context.root, "branch", "--show-current")
    if not branch:
        raise validate.ValidationError("source checkout must own the authorized branch")
    base_commit = git(context.root, "rev-parse", "HEAD")
    expected_destination = context.root.parent / f"{context.root.name}-{task['id']}"
    destination = destination or expected_destination
    if destination.resolve(strict=False) != expected_destination.resolve(strict=False):
        raise validate.ValidationError(
            f"worktree destination must be derived from project and task: {expected_destination}"
        )
    if destination.exists():
        raise validate.ValidationError(f"worktree destination already exists: {destination}")
    reservation = reserve(context, task, destination, branch, base_commit, owner)
    git(context.root, "switch", "--detach", base_commit)
    try:
        git(context.root, "worktree", "add", str(destination), branch)
    except BaseException:
        git(context.root, "switch", branch)
        reservation.unlink(missing_ok=True)
        raise
    return update_reservation(context, reservation, "reserved")


def release(context: validate.ValidationContext, task_id: str) -> dict[str, Any]:
    path = reservation_path(context, task_id)
    record = validate.load(path)
    if not isinstance(record, dict) or record.get("state") != "reserved":
        raise validate.ValidationError(f"{task_id}: no reserved worktree")
    destination = Path(record["worktree_path"])
    expected = context.root.parent / f"{context.root.name}-{task_id}"
    if destination.resolve(strict=False) != expected.resolve(strict=False):
        raise validate.ValidationError(f"{task_id}: reservation worktree path drift")
    require_clean(destination)
    git(context.root, "worktree", "remove", str(destination))
    git(context.root, "switch", record["branch"])
    return update_reservation(context, path, "released")
