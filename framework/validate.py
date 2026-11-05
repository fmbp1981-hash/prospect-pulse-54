#!/usr/bin/env python3
"""Dependency-free validator for IntelliX framework artifacts.

The canonical .yaml files intentionally use the JSON subset of YAML, allowing
validation in CI and fresh worktrees without bootstrapping a package manager.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path, PureWindowsPath
from typing import Any

CODE_ROOT = Path(__file__).resolve().parents[1]
# Backwards-compatible names for importers. They identify code, never a client root.
ROOT = CODE_ROOT
FRAMEWORK = CODE_ROOT / "framework"
FILESET_OWNING_STATES = {
    "READY_FOR_ARCH_REVIEW", "READY", "IN_PROGRESS", "BLOCKED",
    "IN_REVIEW", "CHANGES_REQUESTED",
}
GLOB_MARKERS = "*?["
VENDOR_DEFAULTS = {"architect", "executor", "reviewer", "ci_arbiter"}
GOVERNANCE_PROFILES = {"micro", "standard", "regulated"}
ISOLATED_REVIEW_PROVIDER = "claude-isolated"
ISOLATED_REVIEW_VENDOR = "claude"
ISOLATED_IDENTITY_PATTERN = re.compile(r"^[a-z][a-z0-9]*-isolated(?:-[a-z0-9]+)*$")
# Terminal contracts keep their historical reviewer assignment valid after a
# review_provider rollback (ADR-0007).
REVIEW_PROVIDER_ENFORCED_STATES = FILESET_OWNING_STATES | {"DRAFT"}
ISOLATED_EXECUTOR_ERROR = "executor must not be an isolated reviewer identity"


def identity_vendor(identity: str | None) -> str | None:
    if not identity:
        return None
    return identity.split("-", 1)[0]


def is_isolated_identity(identity: str | None) -> bool:
    """An isolated identity is a fresh, read-only reviewer session (ADR-0007).

    Only the strict ``<vendor>-isolated[-<session>]`` form qualifies, so case,
    delimiter or empty-segment variants are never treated as isolated.
    """
    return bool(identity) and bool(ISOLATED_IDENTITY_PATTERN.fullmatch(identity))


def isolated_reviewer_errors(
    reviewer: str | None, review_provider: str | None, enforce_provider: bool
) -> list[str]:
    """Single policy for who may act as an isolated reviewer (ADR-0007)."""
    if not is_isolated_identity(reviewer):
        return []
    errors: list[str] = []
    if identity_vendor(reviewer) != ISOLATED_REVIEW_VENDOR:
        errors.append(
            f"isolated reviewer {reviewer!r} must use the {ISOLATED_REVIEW_VENDOR!r} vendor"
        )
    if enforce_provider and review_provider != ISOLATED_REVIEW_PROVIDER:
        errors.append(
            f"isolated reviewer {reviewer!r} requires "
            f"execution.review_provider {ISOLATED_REVIEW_PROVIDER!r}"
        )
    return errors


class ValidationError(Exception):
    """A fail-closed validation or project-root bootstrap error."""


@dataclass(frozen=True)
class ValidationContext:
    root: Path
    project_path: Path
    project: dict[str, Any]
    framework_path: Path
    framework_dir: Path
    framework: dict[str, Any]


def load(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValidationError(f"{path}: file not found") from exc
    except OSError as exc:
        raise ValidationError(f"{path}: cannot be read ({exc})") from exc
    except json.JSONDecodeError as exc:
        raise ValidationError(
            f"{path}:{exc.lineno}:{exc.colno}: expected JSON-compatible YAML ({exc.msg})"
        ) from exc


def type_matches(value: Any, expected: str) -> bool:
    return {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "boolean": isinstance(value, bool),
        "null": value is None,
    }.get(expected, True)


def validate_schema(value: Any, schema: dict[str, Any], at: str = "$") -> list[str]:
    errors: list[str] = []
    expected = schema.get("type")
    if expected:
        options = expected if isinstance(expected, list) else [expected]
        if not any(type_matches(value, option) for option in options):
            return [f"{at}: expected {' or '.join(options)}, got {type(value).__name__}"]
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{at}: {value!r} is not one of {schema['enum']}")
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{at}: string is shorter than {schema['minLength']}")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{at}: {value!r} does not match {schema['pattern']}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{at}: must be >= {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{at}: must be <= {schema['maximum']}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{at}: requires at least {schema['minItems']} items")
        if schema.get("uniqueItems"):
            encoded = [json.dumps(item, sort_keys=True) for item in value]
            if len(encoded) != len(set(encoded)):
                errors.append(f"{at}: items must be unique")
        item_schema = schema.get("items")
        if item_schema:
            for index, item in enumerate(value):
                errors.extend(validate_schema(item, item_schema, f"{at}[{index}]"))
    if isinstance(value, dict):
        required = schema.get("required", [])
        for key in required:
            if key not in value:
                errors.append(f"{at}: missing required property {key!r}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in properties:
                    errors.append(f"{at}: unexpected property {key!r}")
        for key, child in value.items():
            if key in properties:
                errors.extend(validate_schema(child, properties[key], f"{at}.{key}"))
    return errors


def validate_file(path: Path, schema_path: Path) -> tuple[Any, list[str]]:
    value = load(path)
    schema = load(schema_path)
    return value, [f"{path}: {error}" for error in validate_schema(value, schema)]


def is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def resolve_root(argument: Path | None) -> Path:
    if argument is None:
        current = Path.cwd().resolve()
        if current != CODE_ROOT:
            raise ValidationError(
                f"--root is required outside the validator repository root; cwd is {current}"
            )
        return CODE_ROOT
    candidate = argument if argument.is_absolute() else Path.cwd() / argument
    try:
        resolved = candidate.resolve(strict=True)
    except FileNotFoundError as exc:
        raise ValidationError(f"project root does not exist: {candidate}") from exc
    if not resolved.is_dir():
        raise ValidationError(f"project root is not a directory: {resolved}")
    return resolved


def _relative_parts(value: str, label: str) -> tuple[str, ...]:
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{label}: path must be a non-empty relative string")
    if "\x00" in value:
        raise ValidationError(f"{label}: NUL bytes are forbidden in paths")
    candidate = Path(value)
    if candidate.is_absolute() or PureWindowsPath(value).is_absolute():
        raise ValidationError(f"{label}: absolute paths are forbidden: {value}")
    if ".." in candidate.parts or ".." in PureWindowsPath(value).parts:
        raise ValidationError(f"{label}: path traversal is forbidden: {value}")
    return candidate.parts


def resolve_contract_path(
    root: Path,
    value: str,
    label: str,
    *,
    must_exist: bool = True,
    expect: str | None = None,
    allow_glob: bool = False,
) -> Path:
    parts = _relative_parts(value, label)
    if allow_glob:
        prefix: list[str] = []
        for part in parts:
            if any(marker in part for marker in GLOB_MARKERS):
                break
            prefix.append(part)
        candidate = root.joinpath(*prefix)
        probe = candidate
        while not probe.exists() and probe != root:
            probe = probe.parent
        resolved = probe.resolve(strict=True)
        if not is_within(resolved, root):
            raise ValidationError(f"{label}: path escapes project root: {value}")
        return candidate

    candidate = root.joinpath(*parts)
    if must_exist and not candidate.exists():
        raise ValidationError(f"{label}: required source is missing: {value}")
    try:
        resolved = candidate.resolve(strict=must_exist)
    except (FileNotFoundError, RuntimeError) as exc:
        raise ValidationError(f"{label}: required source is missing: {value}") from exc
    if not is_within(resolved, root):
        raise ValidationError(f"{label}: path escapes project root: {value}")
    if expect == "file" and not resolved.is_file():
        raise ValidationError(f"{label}: expected a file: {value}")
    if expect == "directory" and not resolved.is_dir():
        raise ValidationError(f"{label}: expected a directory: {value}")
    return resolved


def resolve_cli_path(root: Path, value: Path, label: str, expect: str) -> Path:
    candidate = value if value.is_absolute() else root / value
    try:
        resolved = candidate.resolve(strict=True)
    except FileNotFoundError as exc:
        raise ValidationError(f"{label}: path does not exist: {value}") from exc
    if not is_within(resolved, root):
        raise ValidationError(f"{label}: path escapes project root: {value}")
    if expect == "file" and not resolved.is_file():
        raise ValidationError(f"{label}: expected a file: {value}")
    if expect == "directory" and not resolved.is_dir():
        raise ValidationError(f"{label}: expected a directory: {value}")
    return resolved


def build_context(root: Path, project_name: str = "intellix.yaml") -> ValidationContext:
    root = root.resolve(strict=True)
    project_path = resolve_contract_path(root, project_name, "project manifest", expect="file")
    project = load(project_path)
    if not isinstance(project, dict):
        raise ValidationError(f"{project_path}: project manifest must be an object")
    source = project.get("framework", {}).get("source")
    if not isinstance(source, str):
        raise ValidationError(f"{project_path}: framework.source is required")
    framework_path = resolve_contract_path(root, source, "framework.source", expect="file")
    framework = load(framework_path)
    if not isinstance(framework, dict):
        raise ValidationError(f"{framework_path}: framework must be an object")
    return ValidationContext(
        root=root,
        project_path=project_path,
        project=project,
        framework_path=framework_path,
        framework_dir=framework_path.parent,
        framework=framework,
    )


def declared_path(context: ValidationContext, category: str, name: str) -> Path:
    value = context.framework.get(category, {}).get(name)
    if not isinstance(value, str):
        raise ValidationError(f"framework.yaml: missing {category}.{name}")
    return resolve_contract_path(
        context.root, value, f"framework.{category}.{name}", expect="file"
    )


def kernel_manifest(context: ValidationContext) -> list[Path]:
    """Return the sorted normative kernel files used for snapshot integrity."""
    paths = {context.framework_path}
    for category in ("policies", "schemas"):
        for name, relative in context.framework.get(category, {}).items():
            paths.add(resolve_contract_path(
                context.root,
                relative,
                f"framework.{category}.{name}",
                expect="file",
            ))
    roles_value = context.framework.get("roles_directory")
    roles_directory = resolve_contract_path(
        context.root,
        roles_value,
        "framework.roles_directory",
        expect="directory",
    )
    role_candidates = sorted(roles_directory.glob("*.yaml"))
    if not role_candidates:
        raise ValidationError(f"{roles_directory}: no roles registered")
    for candidate in role_candidates:
        relative = candidate.relative_to(context.root).as_posix()
        paths.add(resolve_contract_path(
            context.root, relative, f"framework role {relative}", expect="file"
        ))
    return sorted(paths, key=lambda path: path.relative_to(context.root).as_posix())


def kernel_digest(context: ValidationContext) -> tuple[str, list[str]]:
    """Hash unambiguous relative-path/byte pairs for the normative kernel."""
    digest = hashlib.sha256()
    relative_paths: list[str] = []
    for path in kernel_manifest(context):
        relative = path.relative_to(context.root).as_posix()
        relative_bytes = relative.encode("utf-8")
        content = path.read_bytes()
        digest.update(len(relative_bytes).to_bytes(8, "big"))
        digest.update(relative_bytes)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
        relative_paths.append(relative)
    return f"sha256:{digest.hexdigest()}", relative_paths


def control_plane_manifest(context: ValidationContext) -> list[Path]:
    """Return versioned operational files distributed with the kernel."""
    configured = context.framework.get("control_plane", {}).get("files", [])
    if not isinstance(configured, list) or not configured:
        raise ValidationError("framework.control_plane.files must be a non-empty array")
    paths: set[Path] = set()
    for index, relative in enumerate(configured):
        paths.add(resolve_contract_path(
            context.root,
            relative,
            f"framework.control_plane.files[{index}]",
            expect="file",
        ))
    return sorted(paths, key=lambda path: path.relative_to(context.root).as_posix())


def manifest_digest(root: Path, paths: list[Path]) -> tuple[str, list[str]]:
    digest = hashlib.sha256()
    relative_paths: list[str] = []
    for path in paths:
        relative = path.relative_to(root).as_posix()
        relative_bytes = relative.encode("utf-8")
        content = path.read_bytes()
        digest.update(len(relative_bytes).to_bytes(8, "big"))
        digest.update(relative_bytes)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
        relative_paths.append(relative)
    return f"sha256:{digest.hexdigest()}", relative_paths


def build_lock_document(context: ValidationContext) -> dict[str, Any]:
    digest, files = kernel_digest(context)
    control_digest, control_files = manifest_digest(
        context.root, control_plane_manifest(context)
    )
    return {
        "schema_version": "1.0.0",
        "kernel": {
            "version": context.framework.get("framework_version"),
            "source": context.framework_path.relative_to(context.root).as_posix(),
            "digest": digest,
            "files": files,
        },
        "control_plane": {
            "version": context.framework.get("control_plane", {}).get("version"),
            "digest": control_digest,
            "files": control_files,
        },
        "sync_direction": "repository_to_installation",
    }


def validate_lock(context: ValidationContext) -> list[str]:
    errors: list[str] = []
    lock_value = context.project.get("framework", {}).get("lock")
    if not isinstance(lock_value, str):
        return [f"{context.project_path}: framework.lock is required"]
    try:
        lock_path = resolve_contract_path(
            context.root, lock_value, "framework.lock", expect="file"
        )
        lock_schema = declared_path(context, "schemas", "lock")
        lock, lock_errors = validate_file(lock_path, lock_schema)
        errors.extend(lock_errors)
        if not isinstance(lock, dict):
            return errors
        expected = build_lock_document(context)
        actual_kernel = lock.get("kernel", {})
        expected_kernel = expected["kernel"]
        for key in ("version", "source", "digest", "files"):
            if actual_kernel.get(key) != expected_kernel[key]:
                errors.append(
                    f"{lock_path}: kernel.{key} drift; expected "
                    f"{expected_kernel[key]!r}, got {actual_kernel.get(key)!r}"
                )
        actual_control = lock.get("control_plane", {})
        expected_control = expected["control_plane"]
        for key in ("version", "digest", "files"):
            if actual_control.get(key) != expected_control[key]:
                errors.append(
                    f"{lock_path}: control_plane.{key} drift; expected "
                    f"{expected_control[key]!r}, got {actual_control.get(key)!r}"
                )
        if lock.get("sync_direction") != expected["sync_direction"]:
            errors.append(
                f"{lock_path}: sync_direction must be "
                f"{expected['sync_direction']!r}"
            )
    except (OSError, ValidationError) as exc:
        errors.append(str(exc))
    return errors


def patterns_overlap(left: str, right: str) -> bool:
    return left == right or fnmatch.fnmatch(left, right) or fnmatch.fnmatch(right, left)


def registered_roles(context: ValidationContext) -> tuple[set[str], list[str]]:
    errors: list[str] = []
    role_schema = declared_path(context, "schemas", "role")
    roles_value = context.framework.get("roles_directory")
    if not isinstance(roles_value, str):
        return set(), ["framework.yaml: roles_directory is required"]
    try:
        roles_directory = resolve_contract_path(
            context.root, roles_value, "framework.roles_directory", expect="directory"
        )
    except ValidationError as exc:
        return set(), [str(exc)]
    role_candidates = sorted(roles_directory.glob("*.yaml"))
    if not role_candidates:
        errors.append(f"{roles_directory}: no roles registered")
    seen: set[str] = set()
    for candidate in role_candidates:
        relative = candidate.relative_to(context.root).as_posix()
        try:
            role_path = resolve_contract_path(
                context.root, relative, f"framework role {relative}", expect="file"
            )
        except ValidationError as exc:
            errors.append(str(exc))
            continue
        role, role_errors = validate_file(role_path, role_schema)
        errors.extend(role_errors)
        role_id = role.get("id") if isinstance(role, dict) else None
        if role_id in seen:
            errors.append(f"{role_path}: duplicate role id {role_id!r}")
        if role_id:
            seen.add(role_id)
    return seen, errors


def semantic_task_errors(
    task: dict[str, Any],
    path: Path,
    context: ValidationContext,
    role_ids: set[str] | None = None,
) -> list[str]:
    errors: list[str] = []
    prefix = str(path)
    expected_name = f"{task.get('id')}.yaml"
    if path.name != expected_name:
        errors.append(f"{prefix}: task id requires filename {expected_name!r}")

    for source_name, source in task.get("source", {}).items():
        values = source if isinstance(source, list) else [source]
        for index, value in enumerate(values):
            label = f"{prefix}: source.{source_name}"
            if isinstance(source, list):
                label += f"[{index}]"
            try:
                resolve_contract_path(context.root, value, label, expect="file")
            except ValidationError as exc:
                errors.append(str(exc))

    scope = task.get("scope", {})
    writable = scope.get("create", []) + scope.get("modify", [])
    forbidden = scope.get("forbidden", [])
    for group, values in scope.items():
        for index, value in enumerate(values):
            try:
                resolve_contract_path(
                    context.root,
                    value,
                    f"{prefix}: scope.{group}[{index}]",
                    must_exist=False,
                    allow_glob=True,
                )
            except ValidationError as exc:
                errors.append(str(exc))
    for allowed in writable:
        for denied in forbidden:
            if patterns_overlap(allowed, denied):
                errors.append(f"{prefix}: writable path {allowed!r} overlaps forbidden {denied!r}")

    ownership = task.get("ownership", {})
    executor = ownership.get("executor")
    reviewer = ownership.get("reviewer")
    if executor == reviewer:
        errors.append(f"{prefix}: executor and reviewer must be independent")
    if is_isolated_identity(executor):
        errors.append(f"{prefix}: {ISOLATED_EXECUTOR_ERROR}")
    errors.extend(
        f"{prefix}: {item}"
        for item in isolated_reviewer_errors(
            reviewer,
            context.project.get("execution", {}).get("review_provider"),
            enforce_provider=task.get("status") in REVIEW_PROVIDER_ENFORCED_STATES,
        )
    )
    if role_ids is None:
        role_ids, role_errors = registered_roles(context)
        errors.extend(role_errors)
    domain_role = ownership.get("domain_role")
    if domain_role and domain_role not in role_ids:
        errors.append(f"{prefix}: unknown domain role {domain_role!r}")
    if not ownership.get("executor"):
        execution = context.project.get("execution", {})
        if not execution.get("default_executor") and not execution.get(
            "allow_current_adapter_fallback"
        ):
            errors.append(
                f"{prefix}: task without executor requires a project default or explicit fallback policy"
            )

    risk = task.get("risk", {}).get("level")
    risk_required = set(context.framework.get("risk_gates", {}).get(risk, []))
    governance_profile = context.project.get("project", {}).get("governance_profile")
    profile_required = set(
        context.framework.get("governance_profiles", {})
        .get(governance_profile, {})
        .get("minimum_gates", [])
    )
    actual = set(task.get("gates", []))
    missing = sorted(risk_required - actual)
    if missing:
        errors.append(f"{prefix}: risk {risk!r} requires gates {missing}")
    missing = sorted(profile_required - actual)
    if missing:
        errors.append(
            f"{prefix}: governance profile {governance_profile!r} requires gates {missing}"
        )
    if risk in {"high", "critical"} and not task.get("rollback"):
        errors.append(f"{prefix}: risk {risk!r} requires a rollback plan")
    return errors


def validate_framework(context: ValidationContext | None = None) -> list[str]:
    context = context or build_context(CODE_ROOT)
    errors: list[str] = []
    canonical = context.framework
    if not canonical.get("normative"):
        errors.append(f"{context.framework_path}: canonical source must be normative")
    if "plugin_version" in canonical:
        errors.append(f"{context.framework_path}: plugin_version is not a kernel fact")
    vendor_defaults = sorted(VENDOR_DEFAULTS.intersection(canonical.get("defaults", {})))
    if vendor_defaults:
        errors.append(
            f"{context.framework_path}: vendor-specific defaults are forbidden: {vendor_defaults}"
        )
    for category in ("policies", "schemas"):
        for name, relative in canonical.get(category, {}).items():
            try:
                resolve_contract_path(
                    context.root,
                    relative,
                    f"framework.{category}.{name}",
                    expect="file",
                )
            except ValidationError as exc:
                errors.append(str(exc))
    try:
        control_plane_manifest(context)
    except ValidationError as exc:
        errors.append(str(exc))
    control_version = canonical.get("control_plane", {}).get("version")
    if not isinstance(control_version, str) or not control_version:
        errors.append(f"{context.framework_path}: control_plane.version is required")
    profiles = canonical.get("governance_profiles")
    if not isinstance(profiles, dict):
        errors.append(f"{context.framework_path}: governance_profiles must be an object")
    else:
        configured_profiles = set(profiles)
        if configured_profiles != GOVERNANCE_PROFILES:
            errors.append(
                f"{context.framework_path}: governance_profiles must define exactly "
                f"{sorted(GOVERNANCE_PROFILES)}"
            )
        for profile, definition in profiles.items():
            gates = definition.get("minimum_gates") if isinstance(definition, dict) else None
            if (
                not isinstance(definition, dict)
                or set(definition) != {"minimum_gates"}
                or not isinstance(gates, list)
                or not gates
                or any(not isinstance(gate, str) or not gate for gate in gates)
                or len(gates) != len(set(gates))
            ):
                errors.append(
                    f"{context.framework_path}: governance profile {profile!r} "
                    "must contain one unique non-empty minimum_gates array"
                )
    runtime_policy = canonical.get("runtime", {})
    if not isinstance(runtime_policy, dict):
        errors.append(f"{context.framework_path}: runtime must be an object")
        runtime_policy = {}
    transitions = runtime_policy.get("transitions", {})
    lifecycle = set(canonical.get("task_lifecycle", []))
    registries: dict[str, set[str]] = {}
    for registry_name in (
        "dependency_satisfying_states",
        "guarded_transition_states",
    ):
        states = runtime_policy.get(registry_name)
        if (
            not isinstance(states, list)
            or not states
            or any(not isinstance(state, str) or not state for state in states)
            or len(states) != len(set(states))
        ):
            errors.append(
                f"{context.framework_path}: runtime.{registry_name} must be a "
                "unique non-empty array of lifecycle states"
            )
            registries[registry_name] = set()
            continue
        registries[registry_name] = set(states)
        for state in states:
            if state not in lifecycle:
                errors.append(
                    f"{context.framework_path}: runtime.{registry_name} contains "
                    f"unknown lifecycle state {state!r}"
                )
    if not registries.get("dependency_satisfying_states", set()).issubset(
        registries.get("guarded_transition_states", set())
    ):
        errors.append(
            f"{context.framework_path}: runtime.dependency_satisfying_states must "
            "be a subset of runtime.guarded_transition_states"
        )
    if not isinstance(transitions, dict):
        errors.append(f"{context.framework_path}: runtime.transitions must be an object")
        transitions = {}
    for source, targets in transitions.items():
        if source not in lifecycle:
            errors.append(f"{context.framework_path}: unknown transition source {source!r}")
        if not isinstance(targets, list):
            errors.append(
                f"{context.framework_path}: transition targets for {source!r} must be an array"
            )
            continue
        for target in targets:
            if target not in lifecycle:
                errors.append(f"{context.framework_path}: unknown transition target {target!r}")
    try:
        _, role_errors = registered_roles(context)
        errors.extend(role_errors)
    except ValidationError as exc:
        errors.append(str(exc))
    return errors


def validate_project(
    path: Path | None = None, context: ValidationContext | None = None
) -> list[str]:
    context = context or build_context(CODE_ROOT)
    path = path or context.project_path
    project_schema = declared_path(context, "schemas", "project")
    project, errors = validate_file(path, project_schema)
    if not isinstance(project, dict):
        return errors

    configured_version = project.get("framework", {}).get("version")
    kernel_version = context.framework.get("framework_version")
    if configured_version != kernel_version:
        errors.append(
            f"{path}: framework.version {configured_version!r} does not match "
            f"kernel framework_version {kernel_version!r}"
        )
    governance_profile = project.get("project", {}).get("governance_profile")
    if governance_profile not in context.framework.get("governance_profiles", {}):
        errors.append(
            f"{path}: project.governance_profile {governance_profile!r} "
            "is not registered by the framework"
        )
    source = project.get("framework", {}).get("source")
    try:
        resolved_source = resolve_contract_path(
            context.root, source, f"{path}: framework.source", expect="file"
        )
        if resolved_source != context.framework_path:
            errors.append(f"{path}: framework.source changed during validation")
    except ValidationError as exc:
        errors.append(str(exc))

    errors.extend(validate_lock(context))

    execution = project.get("execution", {})
    permitted = execution.get("permitted_adapters", [])
    default = execution.get("default_executor")
    if default is not None and default not in permitted:
        errors.append(
            f"{path}: execution.default_executor {default!r} is not permitted"
        )
    runtime_path = project.get("runtime", {}).get("records_path")
    try:
        resolve_contract_path(
            context.root,
            runtime_path,
            f"{path}: runtime.records_path",
            must_exist=False,
        )
    except ValidationError as exc:
        errors.append(str(exc))

    for name, relative in project.get("documents", {}).items():
        expect = "directory" if name in {"tasks", "adrs"} else "file"
        try:
            resolve_contract_path(
                context.root, relative, f"{path}: documents.{name}", expect=expect
            )
        except ValidationError as exc:
            errors.append(str(exc))
    for index, repository in enumerate(project.get("repositories", [])):
        try:
            resolve_contract_path(
                context.root,
                repository.get("path"),
                f"{path}: repositories[{index}].path",
                expect="directory",
            )
        except ValidationError as exc:
            errors.append(str(exc))
    return errors


def validate_task(
    path: Path,
    context: ValidationContext | None = None,
    role_ids: set[str] | None = None,
) -> tuple[dict[str, Any], list[str]]:
    context = context or build_context(CODE_ROOT)
    task_schema = declared_path(context, "schemas", "task")
    task, errors = validate_file(path, task_schema)
    if isinstance(task, dict):
        errors.extend(semantic_task_errors(task, path, context, role_ids))
        return task, errors
    return {}, errors


def validate_tasks(
    directory: Path, context: ValidationContext | None = None
) -> list[str]:
    context = context or build_context(CODE_ROOT)
    errors: list[str] = []
    role_ids, role_errors = registered_roles(context)
    errors.extend(role_errors)
    active: list[tuple[Path, dict[str, Any]]] = []
    tasks: dict[str, tuple[Path, dict[str, Any]]] = {}
    for path in sorted(directory.glob("TASK-*.yaml")):
        task, task_errors = validate_task(path, context, role_ids)
        errors.extend(task_errors)
        task_id = task.get("id")
        if task_id in tasks:
            errors.append(f"{path}: duplicate task id {task_id!r}")
        elif task_id:
            tasks[task_id] = (path, task)
        if task.get("status") in FILESET_OWNING_STATES:
            active.append((path, task))

    for path, task in tasks.values():
        for dependency in task.get("dependencies", []):
            if dependency not in tasks:
                errors.append(f"{path}: unknown dependency {dependency!r}")

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(task_id: str, chain: list[str]) -> None:
        if task_id in visiting:
            cycle = chain[chain.index(task_id):] + [task_id]
            errors.append(f"task dependency cycle: {' -> '.join(cycle)}")
            return
        if task_id in visited or task_id not in tasks:
            return
        visiting.add(task_id)
        for dependency in tasks[task_id][1].get("dependencies", []):
            visit(dependency, chain + [dependency])
        visiting.remove(task_id)
        visited.add(task_id)

    for task_id in tasks:
        visit(task_id, [task_id])

    for index, (left_path, left) in enumerate(active):
        left_paths = left.get("scope", {}).get("create", []) + left.get("scope", {}).get("modify", [])
        for right_path, right in active[index + 1:]:
            right_paths = right.get("scope", {}).get("create", []) + right.get("scope", {}).get("modify", [])
            collisions = sorted({
                (a, b) for a in left_paths for b in right_paths if patterns_overlap(a, b)
            })
            if collisions:
                errors.append(
                    f"fileset collision: {left_path.name} vs {right_path.name}: {collisions}"
                )
    return errors


def validate_completion_evidence(
    directory: Path, context: ValidationContext
) -> list[str]:
    """Validate versioned completion records that are portable across checkouts."""
    evidence = directory / "evidence"
    if not evidence.exists():
        return []
    errors: list[str] = []
    review_schema = declared_path(context, "schemas", "review_evidence")
    approval_schema = declared_path(context, "schemas", "approval")
    seen: dict[str, set[str]] = {}
    completion_fields = {
        "schema_version", "phase_base", "reviewed_revision", "branch",
        "pre_contract_digest", "post_contract_digest", "fileset_digest",
        "project_digest", "source_digest", "kernel_digest", "control_plane_digest", "review_ref",
        "review_digest", "human_decision", "review_ci", "completion_ci",
    }
    for path in sorted(evidence.glob("*.json")):
        match = re.fullmatch(r"(TASK-[0-9]{3,})\.(review|approval)\.json", path.name)
        if not match:
            errors.append(f"{path}: unrecognized completion evidence filename")
            continue
        task_id, kind = match.groups()
        value, file_errors = validate_file(
            path, review_schema if kind == "review" else approval_schema
        )
        errors.extend(file_errors)
        if isinstance(value, dict) and value.get("task") != task_id:
            errors.append(f"{path}: task identity does not match filename")
        if kind == "approval" and isinstance(value, dict):
            missing = sorted(completion_fields - set(value))
            if missing:
                errors.append(
                    f"{path}: completion approval fields missing {missing}"
                )
        seen.setdefault(task_id, set()).add(kind)
    for task_id, kinds in seen.items():
        if kinds != {"review", "approval"}:
            errors.append(
                f"{evidence}: {task_id} requires paired review and approval evidence"
            )
        task_path = directory / f"{task_id}.yaml"
        try:
            task = load(task_path)
            if not isinstance(task, dict) or task.get("status") != "APPROVED":
                errors.append(
                    f"{task_path}: versioned completion evidence requires APPROVED status"
                )
        except ValidationError as exc:
            errors.append(str(exc))
    return errors


def _scalar_from_adapter(text: str, key: str) -> str | None:
    match = re.search(rf"(?m)^{re.escape(key)}:\s*([^#\n]+?)\s*$", text)
    if not match:
        return None
    return match.group(1).strip().strip("\"'")


def validate_authority(context: ValidationContext) -> list[str]:
    """Validate the optional repository adapter's one-way installation contract."""
    adapter = context.root / "global-config/metodologia.yaml"
    if not adapter.exists():
        return []
    try:
        text = adapter.read_text(encoding="utf-8")
    except OSError as exc:
        return [f"{adapter}: cannot be read ({exc})"]
    expected = {
        "framework_source": str(context.framework_path.relative_to(context.root)),
        "framework_version": str(context.framework.get("framework_version")),
        "sync_direction": "repository_to_installation",
    }
    errors: list[str] = []
    for key, value in expected.items():
        actual = _scalar_from_adapter(text, key)
        if actual != value:
            errors.append(f"{adapter}: {key} must be {value!r}, got {actual!r}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, help="explicit client project root")
    parser.add_argument("--framework", action="store_true")
    parser.add_argument("--project", type=Path)
    parser.add_argument("--task", type=Path)
    parser.add_argument("--tasks-dir", type=Path)
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()
    if not any((args.framework, args.project, args.task, args.tasks_dir, args.all)):
        parser.error("select --framework, --project, --task, --tasks-dir or --all")
    errors: list[str] = []
    try:
        root = resolve_root(args.root)
        context = build_context(root)
        if args.framework or args.all:
            errors.extend(validate_framework(context))
        if args.project:
            project_path = resolve_cli_path(root, args.project, "--project", "file")
            errors.extend(validate_project(project_path, context))
        if args.task:
            task_path = resolve_cli_path(root, args.task, "--task", "file")
            _, task_errors = validate_task(task_path, context)
            errors.extend(task_errors)
        if args.tasks_dir:
            tasks_directory = resolve_cli_path(root, args.tasks_dir, "--tasks-dir", "directory")
            errors.extend(validate_tasks(tasks_directory, context))
        if args.all:
            errors.extend(validate_project(context.project_path, context))
            tasks_value = context.project.get("documents", {}).get("tasks")
            tasks_directory = resolve_contract_path(
                root, tasks_value, "project documents.tasks", expect="directory"
            )
            errors.extend(validate_tasks(tasks_directory, context))
            errors.extend(validate_completion_evidence(tasks_directory, context))
            errors.extend(validate_authority(context))
    except ValidationError as exc:
        errors.append(str(exc))
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"FAILED: {len(errors)} validation error(s)")
        return 1
    print("OK: IntelliX framework artifacts are valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
