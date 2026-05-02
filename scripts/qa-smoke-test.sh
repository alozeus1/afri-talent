#!/usr/bin/env bash
set -euo pipefail

APP_BASE_URL="${APP_BASE_URL:-http://localhost:3000}"
API_BASE_URL="${API_BASE_URL:-http://localhost:4000}"

status=0

check_url() {
  local label="$1"
  local url="$2"
  echo "==> $label: $url"
  if curl -fsSI --max-time 10 "$url" >/dev/null; then
    echo "PASS: $label"
  else
    status=1
    echo "FAIL: $label"
  fi
}

check_json() {
  local label="$1"
  local url="$2"
  echo "==> $label: $url"
  if curl -fsS --max-time 10 "$url" >/dev/null; then
    echo "PASS: $label"
  else
    status=1
    echo "FAIL: $label"
  fi
}

check_json "backend health" "$API_BASE_URL/health"
check_json "backend api health" "$API_BASE_URL/api/health"
check_url "frontend home" "$APP_BASE_URL/en"
check_url "login page" "$APP_BASE_URL/en/login"
check_url "jobs page" "$APP_BASE_URL/en/jobs"
check_url "companies page" "$APP_BASE_URL/en/companies"

exit "$status"
