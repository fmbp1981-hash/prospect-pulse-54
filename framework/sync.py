#!/usr/bin/env python3
"""Install or verify a pinned IntelliX kernel snapshot in a client project."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

import validate


def atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def load_target_manifest(target_root: Path) -> dict:
    manifest_path = validate.resolve_contract_path(
        target_root, "intellix.yaml", "target project manifest", expect="file"
    )
    manifest = validate.load(manifest_path)
    if not isinstance(manifest, dict):
        raise validate.ValidationError(f"{manifest_path}: project manifest must be an object")
    return manifest


def managed_files(source: validate.ValidationContext) -> list[Path]:
    files = validate.kernel_manifest(source) + validate.control_plane_manifest(source)
    return sorted(
        set(files),
        key=lambda path: path.relative_to(source.root).as_posix(),
    )


def install_snapshot(source_root: Path, target_root: Path) -> Path:
    source_root = validate.resolve_root(source_root)
    target_root = target_root.resolve(strict=True)
    if not target_root.is_dir():
        raise validate.ValidationError(f"target root is not a directory: {target_root}")
    source = validate.build_context(source_root)
    target_manifest = load_target_manifest(target_root)
    source_relative = source.framework_path.relative_to(source.root).as_posix()
    target_binding = target_manifest.get("framework", {})
    if target_binding.get("source") != source_relative:
        raise validate.ValidationError(
            "target framework.source must match the distributed kernel layout "
            f"{source_relative!r}"
        )
    lock_value = target_binding.get("lock")
    if not isinstance(lock_value, str):
        raise validate.ValidationError("target intellix.yaml: framework.lock is required")

    for source_path in managed_files(source):
        relative = source_path.relative_to(source.root).as_posix()
        destination = validate.resolve_contract_path(
            target_root,
            relative,
            f"snapshot destination {relative}",
            must_exist=False,
        )
        if source_path.resolve() == destination.resolve():
            continue
        atomic_write(destination, source_path.read_bytes())

    target = validate.build_context(target_root)
    lock_path = validate.resolve_contract_path(
        target_root,
        lock_value,
        "framework.lock destination",
        must_exist=False,
    )
    lock_content = json.dumps(
        validate.build_lock_document(target), indent=2, sort_keys=True
    ).encode("utf-8") + b"\n"
    atomic_write(lock_path, lock_content)
    return lock_path


def check_snapshot(target_root: Path) -> list[str]:
    context = validate.build_context(target_root)
    errors = validate.validate_framework(context)
    errors.extend(validate.validate_project(context=context))
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--target-root", required=True, type=Path)
    parser.add_argument(
        "--check", action="store_true", help="verify the target without writing"
    )
    args = parser.parse_args()
    try:
        source_root = validate.resolve_root(args.source_root)
        target_root = args.target_root.resolve(strict=True)
        if not target_root.is_dir():
            raise validate.ValidationError(
                f"target root is not a directory: {target_root}"
            )
        if not args.check:
            lock_path = install_snapshot(source_root, target_root)
            print(f"SYNCED: {lock_path}")
        errors = check_snapshot(target_root)
    except (OSError, validate.ValidationError) as exc:
        errors = [str(exc)]
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"FAILED: {len(errors)} distribution error(s)")
        return 1
    print("OK: pinned IntelliX kernel snapshot is valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
