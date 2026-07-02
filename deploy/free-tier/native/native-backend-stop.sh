#!/usr/bin/env bash
# Stop the natively-run AfriTalent backend.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/backend.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "no pid file — backend not running (or started outside these scripts)"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  for _ in $(seq 1 15); do
    kill -0 "$PID" 2>/dev/null || break
    sleep 1
  done
  kill -0 "$PID" 2>/dev/null && kill -9 "$PID" || true
  echo "backend stopped (pid $PID)"
else
  echo "pid $PID not running — cleaning up"
fi
rm -f "$PID_FILE"
