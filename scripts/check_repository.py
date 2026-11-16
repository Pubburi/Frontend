#!/usr/bin/env python3
"""Check working-tree files or staged blobs without printing secret values."""

import argparse
import os
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--staged", action="store_true", help="check changed paths and blob bytes in the Git index")
args = parser.parse_args()
if args.staged:
    files_command = ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMRT", "-z"]
else:
    files_command = ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"]
names = os.fsdecode(subprocess.check_output(files_command, cwd=root)).split("\0")
blocked_dirs = {
    ".venv", "node_modules", "target", "dist", "__pycache__", ".cache", ".pubburi",
    "reports", "playwright-report", "test-results",
}
patterns = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{40,}\b"),
    re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
]
errors = []
for name in sorted(set(filter(None, names))):
    if any(pattern.search(name) for pattern in patterns):
        errors.append("credential pattern detected in filename (path hidden)")
        continue
    path = pathlib.PurePosixPath(name)
    file = root / name
    if not args.staged and not file.is_file():
        continue
    secret_env = path.name == ".env" or (
        path.name.startswith(".env.") and path.name != ".env.example"
    )
    if (
        secret_env
        or set(path.parts) & blocked_dirs
        or path.suffix in {".pem", ".key", ".p12", ".jks", ".keystore"}
    ):
        errors.append(f"{name}: local secret or generated artifact must not be tracked")
        continue
    try:
        if args.staged:
            content = subprocess.check_output(
                ["git", "cat-file", "blob", f":0:{name}"], cwd=root, stderr=subprocess.DEVNULL,
            ).decode("utf-8")
        else:
            content = file.read_text(encoding="utf-8")
    except subprocess.CalledProcessError:
        errors.append(f"{name}: could not read staged blob")
        continue
    except UnicodeDecodeError:
        continue
    for line, value in enumerate(content.splitlines(), 1):
        if any(pattern.search(value) for pattern in patterns):
            errors.append(f"{name}:{line}: credential pattern detected (value hidden)")
if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)
print("Repository checks passed.")
