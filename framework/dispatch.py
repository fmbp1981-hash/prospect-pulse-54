#!/usr/bin/env python3
"""Thin deterministic dispatcher for validated IntelliX Task Contracts."""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path
from typing import Any

import runtime
import validate
import adapters
import completion
import worktrees


class DispatchBlocked(validate.ValidationError):
    """A deterministic dispatch precondition was not met."""


def installed_adapters(permitted: list[str]) -> set[str]:
    return {adapter for adapter in permitted if shutil.which(adapter)}


same_adapter_identity = adapters.same_identity


def adapter_for_identity(identity: str | None, permitted: set[str]) -> str | None:
    """Map a named reviewer identity such as codex-independent to its adapter.

    Adapter ownership is a vendor question, not an independence question, so
    isolated identities such as claude-isolated map to the claude adapter.
    """
    owner = validate.identity_vendor(identity)
    return owner if owner in permitted else None


def resolve_executor(
    task: dict[str, Any],
    project: dict[str, Any],
    available: set[str],
    current_adapter: str | None = None,
) -> tuple[str, str]:
    execution = project.get("execution", {})
    permitted = set(execution.get("permitted_adapters", []))
    explicit = task.get("ownership", {}).get("executor")
    if explicit:
        if explicit not in permitted:
            raise DispatchBlocked(f"explicit executor {explicit!r} is not permitted")
        if explicit not in available:
            raise DispatchBlocked(f"explicit executor {explicit!r} is not installed")
        return explicit, "task-explicit"

    default = execution.get("default_executor")
    if default and default in permitted and default in available:
        return default, "project-default"

    if execution.get("allow_current_adapter_fallback") and current_adapter:
        if current_adapter in permitted and current_adapter in available:
            return current_adapter, "current-adapter-fallback"
    raise DispatchBlocked("no installed permitted executor could be resolved")


def dependency_errors(
    context: validate.ValidationContext,
    task: dict[str, Any],
    tasks: dict[str, dict[str, Any]],
    satisfying_states: set[str],
) -> list[str]:
    errors: list[str] = []
    for dependency in task.get("dependencies", []):
        candidate = tasks.get(dependency)
        if candidate is None:
            errors.append(f"unknown dependency {dependency!r}")
        elif candidate.get("status") not in satisfying_states:
            errors.append(
                f"dependency {dependency!r} is {candidate.get('status')!r}, not satisfied"
            )
        else:
            errors.extend(
                f"dependency {dependency!r} evidence is not satisfied: {reason}"
                for reason in completion.dependency_eligibility(
                    context, candidate, completion.dependency_token()
                )
            )
    return errors


def load_tasks(directory: Path) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for path in sorted(directory.glob("TASK-*.yaml")):
        value = validate.load(path)
        if isinstance(value, dict) and isinstance(value.get("id"), str):
            result[value["id"]] = value
    return result


def dispatch(
    root: Path,
    task_argument: Path,
    *,
    available: set[str] | None = None,
    current_adapter: str | None = None,
    target_state: str = "IN_PROGRESS",
    reason: str = "validated dispatch",
    owner: str = "intellix-control-plane",
    worktree_destination: Path | None = None,
) -> dict[str, Any]:
    resolved_root = validate.resolve_root(root)
    context = validate.build_context(resolved_root)
    task_path = validate.resolve_cli_path(resolved_root, task_argument, "--task", "file")
    task = validate.load(task_path)
    if not isinstance(task, dict):
        raise DispatchBlocked("task must be an object")
    try:
        guarded_states = runtime.guarded_transition_states(context)
    except validate.ValidationError as exc:
        raise DispatchBlocked(str(exc)) from exc
    if target_state in guarded_states:
        raise DispatchBlocked(
            f"guarded task transition requires a dedicated completion path: "
            f"{task.get('status')} -> {target_state}"
        )
    try:
        satisfying_states = runtime.dependency_satisfying_states(context)
    except validate.ValidationError as exc:
        raise DispatchBlocked(str(exc)) from exc
    existing_reservation = worktrees.active_reservation(context, task.get("id", ""))
    if existing_reservation:
        raise DispatchBlocked(
            f"task {task.get('id')} is reserved; rerun with --root "
            f"{existing_reservation.get('worktree_path')}"
        )

    project_errors = validate.validate_project(context=context)
    tasks_directory = validate.resolve_contract_path(
        resolved_root,
        context.project.get("documents", {}).get("tasks"),
        "project documents.tasks",
        expect="directory",
    )
    contract_errors = validate.validate_tasks(tasks_directory, context)
    dependencies = (
        dependency_errors(
            context, task, load_tasks(tasks_directory), satisfying_states
        )
        if target_state == "IN_PROGRESS" and task.get("status") == "READY"
        else []
    )
    errors = project_errors + contract_errors + dependencies
    transition_context = context
    transition_path = task_path
    try:
        if errors:
            raise DispatchBlocked("; ".join(errors))
        available_adapters = (
            available
            if available is not None
            else installed_adapters(
                context.project.get("execution", {}).get("permitted_adapters", [])
            )
        )
        adapter, resolution = resolve_executor(
            task,
            context.project,
            available_adapters,
            current_adapter,
        )
        reviewer = task.get("ownership", {}).get("reviewer")
        if same_adapter_identity(adapter, reviewer):
            raise DispatchBlocked(
                f"executor {adapter!r} is not independent from reviewer {reviewer!r}"
            )
        permitted = set(
            context.project.get("execution", {}).get("permitted_adapters", [])
        )
        reviewer_adapter = adapter_for_identity(reviewer, permitted)
        if (
            adapter == "claude"
            and reviewer_adapter == "codex"
            and reviewer_adapter not in available_adapters
        ):
            raise DispatchBlocked(
                f"reviewer adapter {reviewer_adapter!r} is not installed"
            )
        if (
            target_state == "IN_PROGRESS"
            and task.get("status") == "READY"
            and task.get("risk", {}).get("level") in {"medium", "high", "critical"}
        ):
            reservation = worktrees.prepare(
                context, task, owner, destination=worktree_destination
            )
            isolated_root = Path(reservation["worktree_path"])
            transition_context = validate.build_context(isolated_root)
            transition_path = isolated_root / task_path.relative_to(resolved_root)
        return runtime.transition(
            transition_context,
            transition_path,
            target_state,
            reason=reason,
            selected_adapter=adapter,
            resolution=resolution,
        )
    except (DispatchBlocked, validate.ValidationError) as exc:
        current_task = validate.load(transition_path)
        current = current_task.get("status") if isinstance(current_task, dict) else None
        if runtime.permitted_transition(transition_context, current, "BLOCKED"):
            runtime.block(
                transition_context,
                transition_path,
                str(exc),
                unblock_condition="Correct the failed dispatch precondition and revalidate",
            )
        raise DispatchBlocked(str(exc)) from exc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--task", required=True, type=Path)
    parser.add_argument("--current-adapter")
    parser.add_argument("--available-adapter", action="append", default=None)
    parser.add_argument("--target-state", default="IN_PROGRESS")
    parser.add_argument("--reason", default="validated dispatch")
    parser.add_argument("--owner", default="intellix-control-plane")
    parser.add_argument("--worktree-destination", type=Path)
    args = parser.parse_args()
    try:
        event = dispatch(
            args.root,
            args.task,
            available=set(args.available_adapter) if args.available_adapter else None,
            current_adapter=args.current_adapter,
            target_state=args.target_state,
            reason=args.reason,
            owner=args.owner,
            worktree_destination=args.worktree_destination,
        )
    except (OSError, validate.ValidationError) as exc:
        print(f"BLOCKED: {exc}")
        return 1
    print(
        f"DISPATCHED: {event['from']} -> {event['to']} "
        f"via {event.get('selected_adapter')} ({event.get('resolution')})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
