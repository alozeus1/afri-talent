#!/usr/bin/env bash
#
# smoke-test.sh — synthetic canary for the AfriTalent stack.
#
# Hits health, login, and orchestrator endpoints against any base URL (raw ALB,
# CloudFront, or prod domain). Exits non-zero on the first failure.
#
# Usage:
#   ./scripts/migrate/smoke-test.sh https://example.com
#
# Optional auth path (set both to enable login + orchestrator checks):
#   SMOKE_EMAIL=test@x.io SMOKE_PASSWORD=secret \
#     ./scripts/migrate/smoke-test.sh https://example.com
#
# Optional MOCK_AI orchestrator check (requires auth):
#   SMOKE_TEST_ORCHESTRATOR=1 SMOKE_EMAIL=... SMOKE_PASSWORD=... \
#     ./scripts/migrate/smoke-test.sh https://example.com
#
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-}}"
if [[ -z "${BASE_URL}" ]]; then
  echo "ERROR: base URL required" >&2
  echo "Usage: $0 <base-url>" >&2
  exit 2
fi
BASE_URL="${BASE_URL%/}" # strip trailing slash

TIMEOUT="${SMOKE_TIMEOUT:-10}"
START_TS=$(date -u +%s)

pass=0
fail=0
failures=()

ok()   { printf "  \033[32mPASS\033[0m %s\n" "$1"; pass=$((pass + 1)); }
bad()  { printf "  \033[31mFAIL\033[0m %s — %s\n" "$1" "$2"; fail=$((fail + 1)); failures+=("$1: $2"); }
info() { printf "  \033[33mINFO\033[0m %s\n" "$1"; }

check_status() {
  local label="$1" url="$2" expected="$3"
  local actual
  actual=$(curl -fsS -o /dev/null -w "%{http_code}" -m "${TIMEOUT}" "${url}" 2>/dev/null || echo "000")
  if [[ "${actual}" == "${expected}" ]]; then
    ok "${label} (${actual})"
  else
    bad "${label}" "expected ${expected}, got ${actual} from ${url}"
  fi
}

check_json_field() {
  local label="$1" url="$2" jq_filter="$3" expected="$4"
  local body
  body=$(curl -fsS -m "${TIMEOUT}" "${url}" 2>/dev/null || echo "")
  if [[ -z "${body}" ]]; then
    bad "${label}" "empty response from ${url}"
    return
  fi
  local actual
  actual=$(echo "${body}" | jq -r "${jq_filter}" 2>/dev/null || echo "JQERR")
  if [[ "${actual}" == "${expected}" ]]; then
    ok "${label}"
  else
    bad "${label}" "expected ${expected}, got '${actual}'"
  fi
}

echo "[$(date -u +%FT%TZ)] Smoke test against ${BASE_URL}"
echo

# ── Anonymous health checks ──────────────────────────────────────────────────
echo "Health endpoints:"
check_status "GET /health"        "${BASE_URL}/health"        "200"
check_status "GET /api/health"    "${BASE_URL}/api/health"    "200"

# ── TLS + basic frontend reachability ────────────────────────────────────────
echo
echo "Frontend:"
check_status "GET /"              "${BASE_URL}/"              "200"

# ── Optional auth flow ───────────────────────────────────────────────────────
if [[ -n "${SMOKE_EMAIL:-}" && -n "${SMOKE_PASSWORD:-}" ]]; then
  echo
  echo "Auth flow:"
  login_body=$(curl -fsS -m "${TIMEOUT}" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg e "${SMOKE_EMAIL}" --arg p "${SMOKE_PASSWORD}" '{email:$e,password:$p}')" \
    "${BASE_URL}/api/auth/login" 2>/dev/null || echo "")
  if [[ -z "${login_body}" ]]; then
    bad "POST /api/auth/login" "empty/failed response"
    TOKEN=""
  else
    TOKEN=$(echo "${login_body}" | jq -r '.token // .accessToken // empty' 2>/dev/null || echo "")
    if [[ -n "${TOKEN}" && "${TOKEN}" != "null" ]]; then
      ok "POST /api/auth/login (got token)"
    else
      bad "POST /api/auth/login" "no token in response"
    fi
  fi

  if [[ -n "${TOKEN}" && "${SMOKE_TEST_ORCHESTRATOR:-0}" == "1" ]]; then
    echo
    echo "Orchestrator (MOCK_AI=1 expected server-side):"
    orch_status=$(curl -fsS -o /dev/null -w "%{http_code}" -m 30 \
      -X POST \
      -H "Authorization: Bearer ${TOKEN}" \
      -H 'Content-Type: application/json' \
      -d '{"input":"smoke-test","mode":"mock"}' \
      "${BASE_URL}/api/orchestrator/run" 2>/dev/null || echo "000")
    if [[ "${orch_status}" == "200" || "${orch_status}" == "202" ]]; then
      ok "POST /api/orchestrator/run (${orch_status})"
    else
      bad "POST /api/orchestrator/run" "got ${orch_status}"
    fi
  fi
else
  info "auth flow skipped (set SMOKE_EMAIL + SMOKE_PASSWORD to enable)"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
END_TS=$(date -u +%s)
echo
echo "[$(date -u +%FT%TZ)] Done in $((END_TS - START_TS))s — pass=${pass} fail=${fail}"

if [[ "${fail}" -gt 0 ]]; then
  echo
  echo "Failures:"
  for f in "${failures[@]}"; do
    echo "  - ${f}"
  done
  exit 1
fi
