#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

status=0

run_check() {
  local name="$1"
  shift
  echo "==> $name"
  if "$@"; then
    echo "PASS: $name"
  else
    status=1
    echo "FAIL: $name"
  fi
}

if [ -f backend/package.json ] && [ -d backend/node_modules ]; then
  run_check "backend lint" bash -lc "cd backend && npm run lint"
  run_check "backend typecheck" bash -lc "cd backend && npm run typecheck"
else
  echo "SKIP: backend checks require backend/node_modules"
fi

if [ -f frontend/package.json ] && [ -d frontend/node_modules ]; then
  run_check "frontend lint" bash -lc "cd frontend && npm run lint"
  run_check "frontend typecheck" bash -lc "cd frontend && npx tsc --noEmit"
else
  echo "SKIP: frontend checks require frontend/node_modules"
fi

if [ "${RUN_TERRAFORM_CHECKS:-0}" = "1" ] && [ -d infra/terraform ]; then
  if command -v terraform >/dev/null 2>&1; then
    run_check "terraform fmt" bash -lc "cd infra/terraform && terraform fmt -check -recursive"
    run_check "terraform validate without backend" bash -lc "cd infra/terraform && terraform init -backend=false >/tmp/afritalent-terraform-init.log && terraform validate"
  else
    echo "SKIP: terraform not installed"
  fi
elif [ -d infra/terraform ]; then
  echo "SKIP: terraform checks require RUN_TERRAFORM_CHECKS=1"
fi

exit "$status"
