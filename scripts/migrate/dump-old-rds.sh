#!/usr/bin/env bash
#
# dump-old-rds.sh — pg_dump the old (App Runner) RDS instance to a local file.
#
# Usage:
#   OLD_DATABASE_URL='postgresql://user:pass@host:5432/db' \
#     ./scripts/migrate/dump-old-rds.sh [output_file]
#
# If output_file is omitted, defaults to: out/afritalent-<UTC-timestamp>.dump
# Output format is custom (-Fc) — required for pg_restore parallelism.
#
# Pre-reqs:
#   - postgresql-client v15+ installed locally (matching Aurora PG major version)
#   - Network reachability to the old RDS instance (VPN, bastion, or temporary
#     publicly_accessible flag — revert after dumping)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ -z "${OLD_DATABASE_URL:-}" ]]; then
  echo "ERROR: OLD_DATABASE_URL is not set." >&2
  echo "Example: OLD_DATABASE_URL='postgresql://user:pass@host:5432/db' $0" >&2
  exit 2
fi

OUT_DIR="${REPO_ROOT}/out"
mkdir -p "${OUT_DIR}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${1:-${OUT_DIR}/afritalent-${TS}.dump}"

echo "[$(date -u +%FT%TZ)] Starting pg_dump → ${OUT_FILE}"
echo "[$(date -u +%FT%TZ)] Source: $(echo "${OLD_DATABASE_URL}" | sed -E 's#://[^@]+@#://***@#')"

# -Fc       custom format (compressed, restorable in parallel)
# --no-owner / --no-acl  drop ownership/grants — they don't apply on Aurora
# --verbose write progress to stderr
# --serializable-deferrable  consistent snapshot
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --verbose \
  --serializable-deferrable \
  --file="${OUT_FILE}" \
  "${OLD_DATABASE_URL}"

SIZE="$(du -h "${OUT_FILE}" | cut -f1)"
echo "[$(date -u +%FT%TZ)] Dump complete: ${OUT_FILE} (${SIZE})"
echo
echo "Next: ./scripts/migrate/restore-new-aurora.sh ${OUT_FILE}"
