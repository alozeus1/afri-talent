#!/usr/bin/env bash
#
# restore-new-aurora.sh — pg_restore a dump into the new Aurora Serverless v2
# cluster (via RDS Proxy endpoint).
#
# Usage:
#   NEW_DATABASE_URL='postgresql://user:pass@proxy:5432/db' \
#     ./scripts/migrate/restore-new-aurora.sh out/afritalent-XXXXX.dump
#
# Or read NEW_DATABASE_URL from SSM (the recommended path post-Phase 2):
#   ENV=dev ./scripts/migrate/restore-new-aurora.sh out/afritalent-XXXXX.dump
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DUMP_FILE="${1:-}"
if [[ -z "${DUMP_FILE}" ]]; then
  echo "ERROR: dump file path required as first argument." >&2
  echo "Usage: $0 <dump-file>" >&2
  exit 2
fi
if [[ ! -f "${DUMP_FILE}" ]]; then
  echo "ERROR: dump file not found: ${DUMP_FILE}" >&2
  exit 2
fi

# Resolve target connection string
if [[ -z "${NEW_DATABASE_URL:-}" ]]; then
  if [[ -n "${ENV:-}" ]]; then
    echo "[$(date -u +%FT%TZ)] Resolving DATABASE_URL from SSM (/afritalent/${ENV}/DATABASE_URL)"
    NEW_DATABASE_URL="$(aws ssm get-parameter \
      --name "/afritalent/${ENV}/DATABASE_URL" \
      --with-decryption \
      --query 'Parameter.Value' \
      --output text)"
  else
    echo "ERROR: NEW_DATABASE_URL not set and ENV not provided." >&2
    echo "Either:" >&2
    echo "  NEW_DATABASE_URL='postgresql://...' $0 ${DUMP_FILE}" >&2
    echo "  ENV=dev $0 ${DUMP_FILE}" >&2
    exit 2
  fi
fi

# Detect parallelism — pg_restore -j N where N ≤ vCPUs available
PARALLEL_JOBS="${PARALLEL_JOBS:-4}"

echo "[$(date -u +%FT%TZ)] Starting pg_restore"
echo "[$(date -u +%FT%TZ)] Dump:    ${DUMP_FILE}"
echo "[$(date -u +%FT%TZ)] Target:  $(echo "${NEW_DATABASE_URL}" | sed -E 's#://[^@]+@#://***@#')"
echo "[$(date -u +%FT%TZ)] Jobs:    ${PARALLEL_JOBS}"

# --no-owner / --no-acl   ownership and grants are managed by Terraform/IAM
# --clean --if-exists     drop pre-existing objects before restore (safe on empty DB; required for re-runs)
# --exit-on-error         fail fast on any error
# --jobs                  parallel table data restore
pg_restore \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --exit-on-error \
  --jobs="${PARALLEL_JOBS}" \
  --verbose \
  --dbname="${NEW_DATABASE_URL}" \
  "${DUMP_FILE}"

echo "[$(date -u +%FT%TZ)] Restore complete."
echo
echo "Next:"
echo "  1. ./scripts/migrate/compare-counts.sh"
echo "  2. (cd backend && DATABASE_URL='${NEW_DATABASE_URL}' npx prisma migrate deploy)"
