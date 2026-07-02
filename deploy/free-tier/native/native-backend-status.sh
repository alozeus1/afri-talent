#!/usr/bin/env bash
# Status of the natively-run AfriTalent backend: process + health endpoint.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$SCRIPT_DIR/backend.pid"
PORT="${PORT:-4000}"
[ -f "$DEPLOY_DIR/.env" ] && PORT="$(grep -E '^PORT=' "$DEPLOY_DIR/.env" | cut -d= -f2 | tr -d '"' || true)"
PORT="${PORT:-4000}"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "process: RUNNING (pid $(cat "$PID_FILE"))"
else
  echo "process: NOT RUNNING"
fi

echo -n "health:  "
curl -fsS --max-time 5 "http://localhost:$PORT/health" 2>/dev/null || echo "unreachable on :$PORT"
echo ""
