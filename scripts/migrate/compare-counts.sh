#!/usr/bin/env bash
#
# compare-counts.sh — verify row counts match between old RDS and new Aurora.
#
# Runs SELECT count(*) against a configurable list of tables on both DBs and
# prints a diff. Non-zero exit if any table count differs.
#
# Usage:
#   OLD_DATABASE_URL='postgresql://...' NEW_DATABASE_URL='postgresql://...' \
#     ./scripts/migrate/compare-counts.sh
#
# Or for the new side, read from SSM:
#   OLD_DATABASE_URL='postgresql://...' ENV=dev \
#     ./scripts/migrate/compare-counts.sh
#
# Override the table list with CHECK_TABLES env (space-separated).
#
set -euo pipefail

# Default tables — most user-visible / business-critical. Override with CHECK_TABLES env.
DEFAULT_TABLES=(
  "User"
  "Profile"
  "Job"
  "Company"
  "Application"
  "Subscription"
  "Payment"
  "Resume"
  "AiRun"
  "Notification"
  "Message"
  "SavedSearch"
)

read -r -a TABLES <<< "${CHECK_TABLES:-${DEFAULT_TABLES[*]}}"

if [[ -z "${OLD_DATABASE_URL:-}" ]]; then
  echo "ERROR: OLD_DATABASE_URL not set." >&2
  exit 2
fi

if [[ -z "${NEW_DATABASE_URL:-}" ]]; then
  if [[ -n "${ENV:-}" ]]; then
    NEW_DATABASE_URL="$(aws ssm get-parameter \
      --name "/afritalent/${ENV}/DATABASE_URL" \
      --with-decryption \
      --query 'Parameter.Value' \
      --output text)"
  else
    echo "ERROR: NEW_DATABASE_URL not set and ENV not provided." >&2
    exit 2
  fi
fi

count_one() {
  local url="$1"
  local table="$2"
  # -t tuples-only, -A unaligned, -X no .psqlrc
  psql "${url}" -tAX -c "SELECT count(*) FROM \"${table}\";" 2>/dev/null || echo "ERR"
}

printf "%-30s %15s %15s %s\n" "TABLE" "OLD" "NEW" "STATUS"
printf "%-30s %15s %15s %s\n" "------------------------------" "---------------" "---------------" "------"

mismatched=0
for tbl in "${TABLES[@]}"; do
  old=$(count_one "${OLD_DATABASE_URL}" "${tbl}")
  new=$(count_one "${NEW_DATABASE_URL}" "${tbl}")
  if [[ "${old}" == "ERR" || "${new}" == "ERR" ]]; then
    printf "%-30s %15s %15s %s\n" "${tbl}" "${old}" "${new}" "SKIP (table missing?)"
    continue
  fi
  if [[ "${old}" == "${new}" ]]; then
    printf "%-30s %15s %15s %s\n" "${tbl}" "${old}" "${new}" "OK"
  else
    printf "%-30s %15s %15s %s\n" "${tbl}" "${old}" "${new}" "MISMATCH"
    mismatched=$((mismatched + 1))
  fi
done

echo
if [[ "${mismatched}" -eq 0 ]]; then
  echo "[$(date -u +%FT%TZ)] All checked tables match."
  exit 0
else
  echo "[$(date -u +%FT%TZ)] ${mismatched} table(s) MISMATCH — investigate before cutover."
  exit 1
fi
