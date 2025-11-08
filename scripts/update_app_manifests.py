#!/usr/bin/env python3
"""
Update image tags inside the external app-manifests repository.

The script searches YAML/JSON files for homelab-map images and replaces the tag with
the provided version while keeping the registry/namespace portion untouched.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys
from typing import Dict


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-path",
        required=True,
        type=pathlib.Path,
        help="Path to the cloned app-manifests repository",
    )
    parser.add_argument(
        "--version",
        required=True,
        help="Full image tag (e.g., v1.2.3) that should replace the existing tag",
    )
    parser.add_argument(
        "--registry",
        required=True,
        help="Registry/namespace prefix that appears before the image name",
    )
    parser.add_argument(
        "--services",
        nargs="+",
        default=["agent", "aggregator", "frontend"],
        help="Service suffixes to update (default: agent aggregator frontend)",
    )
    return parser.parse_args()


def iter_target_files(repo_path: pathlib.Path):
    allowed_suffixes = {".yml", ".yaml", ".json"}
    for path in repo_path.rglob("*"):
        if path.is_file() and path.suffix.lower() in allowed_suffixes:
            yield path


def update_files(
    repo_path: pathlib.Path, version: str, services, registry: str
) -> Dict[str, int]:
    registry = registry.strip().rstrip("/")
    if registry:
        escaped_registry = re.escape(registry)
        pattern_template = (
            rf"((?:{escaped_registry}/)?(?:[\w.\-]+/)*{{image}}:)([A-Za-z0-9._-]+)"
        )
    else:
        pattern_template = r"((?:[\w.\-]+/)*{image}:)([A-Za-z0-9._-]+)"
    replacements: Dict[str, int] = {svc: 0 for svc in services}

    for file_path in iter_target_files(repo_path):
        original = file_path.read_text()
        updated = original

        for svc in services:
            image = f"homelab-map-{svc}"
            pattern = re.compile(pattern_template.format(image=re.escape(image)))

            def _replace(match: re.Match) -> str:
                replacements[svc] += 1
                prefix = match.group(1)
                current_tag = match.group(2)
                if current_tag == version:
                    return match.group(0)
                return f"{prefix}{version}"

            updated = pattern.sub(_replace, updated)

        if updated != original:
            file_path.write_text(updated)

    return replacements


def main() -> None:
    args = parse_args()
    repo_path: pathlib.Path = args.repo_path.resolve()
    if not repo_path.exists():
        sys.exit(f"Repo path {repo_path} does not exist")

    replacement_counts = update_files(repo_path, args.version, args.services, args.registry)
    missing = [svc for svc, count in replacement_counts.items() if count == 0]
    if missing:
        sys.exit(
            "Failed to update tags for: "
            + ", ".join(f"homelab-map-{svc}" for svc in missing)
        )


if __name__ == "__main__":
    main()
