#!/usr/bin/env bash
# Weekly blog pipeline trigger — replaces the AWS EventBridge + Lambda pair
# in the free-tier deployment. Install on the VM's crontab (Mondays 09:00 UTC):
#
#   crontab -e
#   0 9 * * 1 /home/ubuntu/afri-talent/deploy/free-tier/blog-weekly-cron.sh >> /var/log/afritalent-blog-cron.log 2>&1
#
# Requires BLOG_TRIGGER_ADMIN_TOKEN in the .env next to this script
# (an admin user's JWT — POST /api/auth/login with the admin account).

set -euo pipefail
cd "$(dirname "$0")"

# shellcheck disable=SC1091
source .env 2>/dev/null || { echo "missing .env"; exit 1; }

if [ -z "${BLOG_TRIGGER_ADMIN_TOKEN:-}" ]; then
  echo "$(date -u +%FT%TZ) BLOG_TRIGGER_ADMIN_TOKEN not set — skipping"
  exit 0
fi

API_BASE="http://localhost"
if [ "${API_DOMAIN:-localhost}" != "localhost" ]; then
  API_BASE="https://${API_DOMAIN}"
fi

# CSRF double-submit: /api/auth/me seeds the CSRF cookie and returns the
# matching token; the POST must echo it as X-CSRF-Token alongside the cookie.
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

CSRF_TOKEN="$(curl -fsS -c "$COOKIE_JAR" --max-time 15 \
  -H "Authorization: Bearer ${BLOG_TRIGGER_ADMIN_TOKEN}" \
  "${API_BASE}/api/auth/me" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)"

if [ -z "$CSRF_TOKEN" ]; then
  echo "$(date -u +%FT%TZ) could not obtain CSRF token (expired admin token?) — aborting"
  exit 1
fi

echo "$(date -u +%FT%TZ) triggering weekly blog pipeline via ${API_BASE}"
curl -fsS -X POST "${API_BASE}/api/admin/blog/trigger" \
  -b "$COOKIE_JAR" \
  -H "Authorization: Bearer ${BLOG_TRIGGER_ADMIN_TOKEN}" \
  -H "X-CSRF-Token: ${CSRF_TOKEN}" \
  -H "Content-Type: application/json" \
  --max-time 30
echo ""
echo "$(date -u +%FT%TZ) trigger accepted — draft will appear at /admin/blog"
