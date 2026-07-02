#!/usr/bin/env bash
# Weekly blog pipeline trigger for the native (no-Docker) deployment.
# Crontab (Mondays 09:00 UTC):
#   0 9 * * 1 /home/ubuntu/afri-talent/deploy/free-tier/native/native-blog-weekly-cron.sh >> $HOME/afritalent-blog.log 2>&1
#
# Hits the local backend directly, so no domain/TLS is needed.
# Requires BLOG_TRIGGER_ADMIN_TOKEN in deploy/free-tier/.env.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
set -a; # shellcheck disable=SC1091
source "$DEPLOY_DIR/.env" 2>/dev/null || { echo "missing .env"; exit 1; }
set +a

if [ -z "${BLOG_TRIGGER_ADMIN_TOKEN:-}" ]; then
  echo "$(date -u +%FT%TZ) BLOG_TRIGGER_ADMIN_TOKEN not set — skipping"
  exit 0
fi

PORT="${PORT:-4000}"
BASE="http://localhost:${PORT}"

# CSRF double-submit: /api/auth/me seeds the CSRF cookie and returns the
# matching token; the POST must echo it as X-CSRF-Token alongside the cookie.
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

CSRF_TOKEN="$(curl -fsS -c "$COOKIE_JAR" --max-time 15 \
  -H "Authorization: Bearer ${BLOG_TRIGGER_ADMIN_TOKEN}" \
  "${BASE}/api/auth/me" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)"

if [ -z "$CSRF_TOKEN" ]; then
  echo "$(date -u +%FT%TZ) could not obtain CSRF token (expired admin token?) — aborting"
  exit 1
fi

echo "$(date -u +%FT%TZ) triggering weekly blog pipeline on ${BASE}"
curl -fsS -X POST "${BASE}/api/admin/blog/trigger" \
  -b "$COOKIE_JAR" \
  -H "Authorization: Bearer ${BLOG_TRIGGER_ADMIN_TOKEN}" \
  -H "X-CSRF-Token: ${CSRF_TOKEN}" \
  -H "Content-Type: application/json" \
  --max-time 30
echo ""
echo "$(date -u +%FT%TZ) trigger accepted — draft will appear at /admin/blog"
