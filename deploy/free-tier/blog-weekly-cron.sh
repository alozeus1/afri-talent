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

echo "$(date -u +%FT%TZ) triggering weekly blog pipeline via ${API_BASE}"
curl -fsS -X POST "${API_BASE}/api/admin/blog/trigger" \
  -H "Authorization: Bearer ${BLOG_TRIGGER_ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  --max-time 30
echo ""
echo "$(date -u +%FT%TZ) trigger accepted — draft will appear at /admin/blog"
