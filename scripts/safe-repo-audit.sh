#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Branch"
git status --short --branch

echo
echo "==> Tracked agent/docs structure"
for path in AGENTS.md CLAUDE.md CODEX.md docs tickets tests scripts .github/workflows .github/ISSUE_TEMPLATE; do
  if [ -e "$path" ]; then
    echo "present: $path"
  else
    echo "missing: $path"
  fi
done

echo
echo "==> Workflows"
find .github/workflows -maxdepth 1 -type f -name '*.yml' -o -name '*.yaml' 2>/dev/null | sort

echo
echo "==> E2E tests"
find frontend/e2e -maxdepth 1 -type f -name '*.spec.ts' 2>/dev/null | sort
