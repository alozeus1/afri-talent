#!/usr/bin/env bash
# Start the AfriTalent backend natively (no Docker) — for hosts where Docker
# is impractical (e.g. Oracle Always Free ARM images). Requires Node 20+ and
# a completed `npm ci && npx prisma generate && npm run build` in backend/.
#
# Env comes from deploy/free-tier/.env (same file the compose path uses).

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$DEPLOY_DIR/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
PID_FILE="$SCRIPT_DIR/backend.pid"
LOG_FILE="${BACKEND_LOG_FILE:-$SCRIPT_DIR/backend.log}"
# Allow a locally-installed Node (e.g. /home/ubuntu/node/bin) to take priority
export PATH="${NODE_BIN_DIR:-$HOME/node/bin}:$PATH"

[ -f "$DEPLOY_DIR/.env" ] || { echo "missing $DEPLOY_DIR/.env (copy .env.example)"; exit 1; }
set -a; # shellcheck disable=SC1091
source "$DEPLOY_DIR/.env"; set +a

case "${DATABASE_URL:-}" in
  ""|*USER:PASSWORD*)
    echo "Set a real DATABASE_URL in $DEPLOY_DIR/.env before starting the backend"
    exit 1
    ;;
esac

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "backend already running (pid $(cat "$PID_FILE"))"
  exit 0
fi

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-4000}"

cd "$BACKEND_DIR"
[ -d dist ] || { echo "backend not built — run: npm ci && npx prisma generate && npm run build"; exit 1; }

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Starting backend on :$PORT (logs: $LOG_FILE)"
nohup node --import ./dist/instrument.js dist/server.js >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
sleep 3
if curl -fsS "http://localhost:$PORT/health" > /dev/null 2>&1; then
  echo "backend healthy (pid $(cat "$PID_FILE"))"
else
  echo "backend started (pid $(cat "$PID_FILE")) — health not ready yet; check: tail -f $LOG_FILE"
fi
