#!/usr/bin/env python3
"""
Identify which service directories changed between two git refs so the CI pipeline
can skip rebuilding unaffected images.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from typing import Iterable, List, Sequence, Set

EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
DEFAULT_SERVICES = ("agent", "aggregator", "frontend")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base",
        default="",
        help="Base git ref/sha to diff from (defaults to the parent of --head).",
    )
    parser.add_argument(
        "--head",
        default="HEAD",
        help="Head git ref/sha to diff against (defaults to HEAD).",
    )
    parser.add_argument(
        "--services",
        nargs="+",
        default=list(DEFAULT_SERVICES),
        help="Ordered list of services to evaluate (default: agent aggregator frontend).",
    )
    parser.add_argument(
        "--force-all",
        action="store_true",
        help="Return every service regardless of diff contents.",
    )
    parser.add_argument(
        "--output",
        choices=("json", "csv", "newline"),
        default="json",
        help="Output format (default: json).",
    )
    return parser.parse_args()


def rev_parse(ref: str) -> str | None:
    if ref == EMPTY_TREE:
        return ref
    result = subprocess.run(
        ["git", "rev-parse", "--verify", ref], capture_output=True, text=True
    )
    if result.returncode == 0:
        return result.stdout.strip()
    return None


def normalize_ref(ref: str | None) -> str | None:
    if not ref:
        return None
    ref = ref.strip()
    if not ref:
        return None
    if set(ref) == {"0"}:
        return EMPTY_TREE
    return rev_parse(ref)


def ensure_head(ref: str | None) -> str:
    resolved = normalize_ref(ref) or rev_parse("HEAD")
    if not resolved:
        sys.exit("Unable to resolve head reference for diffing")
    return resolved


def ensure_base(base: str | None, head: str) -> str:
    resolved = normalize_ref(base)
    if resolved:
        return resolved
    parent = rev_parse(f"{head}^")
    if parent:
        return parent
    return EMPTY_TREE


def list_changed_files(base: str, head: str) -> List[str]:
    diff_range = f"{base}..{head}"
    result = subprocess.run(
        ["git", "diff", "--name-only", "--relative", diff_range],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        stderr = result.stderr.strip() or "git diff failed"
        sys.exit(stderr)
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def services_from_paths(paths: Iterable[str], services: Sequence[str]) -> List[str]:
    ordered_unique = []
    seen: Set[str] = set()
    service_set = set(services)
    for path in paths:
        prefix = path.split("/", 1)[0]
        if prefix in service_set and prefix not in seen:
            seen.add(prefix)
            ordered_unique.append(prefix)
    return ordered_unique


def format_output(services: Sequence[str], fmt: str) -> str:
    if fmt == "json":
        return json.dumps(list(services))
    if fmt == "csv":
        return ",".join(services)
    return "\n".join(services)


def main() -> None:
    args = parse_args()
    services = []
    seen: Set[str] = set()
    for svc in args.services:
        if svc not in seen:
            services.append(svc)
            seen.add(svc)

    if args.force_all:
        output = format_output(services, args.output)
        print(output)
        return

    head = ensure_head(args.head)
    base = ensure_base(args.base, head)
    changed_files = list_changed_files(base, head)
    selected = services_from_paths(changed_files, services)
    output = format_output(selected, args.output)
    print(output)


if __name__ == "__main__":
    main()
