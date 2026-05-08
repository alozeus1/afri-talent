#!/usr/bin/env bash
#
# inject-secrets.sh — push secret values from a local sourced file into SSM
# Parameter Store (SecureString) in the target AWS account.
#
# Usage:
#   ENV=dev ./scripts/migrate/inject-secrets.sh                # interactive
#   ENV=dev SECRETS_FILE=.env.migrate ./scripts/migrate/inject-secrets.sh  # batch
#   ENV=dev ./scripts/migrate/inject-secrets.sh --verify       # check only
#
# Pre-req: aws CLI authenticated against the NEW account, region us-east-1.
#
# The full canonical list of parameters lives in docs/migration/SECRETS.md.
# Only secrets are injected here — non-secret config (NODE_ENV, FRONTEND_URL,
# etc.) is set in the ECS task definition or Lambda environment.
#
set -euo pipefail

ENV="${ENV:?ENV is required (dev|staging|prod)}"
REGION="${AWS_REGION:-us-east-1}"
PREFIX="/afritalent/${ENV}"
KMS_ALIAS="${KMS_ALIAS:-alias/afritalent-${ENV}-ssm}"

VERIFY_ONLY=0
if [[ "${1:-}" == "--verify" ]]; then
  VERIFY_ONLY=1
fi

# Required parameter keys.  DATABASE_URL is auto-written by Terraform from
# Aurora outputs and is intentionally excluded here.
REQUIRED_KEYS=(
  JWT_SECRET
  SESSION_SECRET
  ANTHROPIC_API_KEY
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_CATALOG_JSON
  FLUTTERWAVE_PUBLIC_KEY
  FLUTTERWAVE_SECRET_KEY
  FLUTTERWAVE_SECRET_HASH
  FLUTTERWAVE_PLAN_CATALOG_JSON
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
)

OPTIONAL_KEYS=(
  FLUTTERWAVE_PAYMENT_OPTIONS
  APPLE_CLIENT_ID
  ADZUNA_APP_ID
  ADZUNA_API_KEY
  APIFY_TOKEN
  APIFY_JOB_TASKS_JSON
  GREENHOUSE_BOARD_TOKENS
  LEVER_SITE_TOKENS
  WORKABLE_COMPANY_TOKENS
  COMPANY_CAREER_SOURCES_JSON
  REDIS_URL
  SENTRY_DSN
  ADMIN_BOOTSTRAP_EMAIL
  ADMIN_BOOTSTRAP_PASSWORD
  AI_FAST_MODEL
  AI_QUALITY_MODEL
  OPENAI_API_KEY
  OPENAI_EMBEDDING_ENDPOINT
)

BLOG_KEYS=(
  blog/NEWS_API_KEY
  blog/UNSPLASH_ACCESS_KEY
  blog/PEXELS_API_KEY
  blog/BLOG_ADMIN_NOTIFICATION_EMAIL
)

verify() {
  local missing=0
  echo "[$(date -u +%FT%TZ)] Verifying parameters under ${PREFIX} in region ${REGION}"
  for key in "${REQUIRED_KEYS[@]}" DATABASE_URL; do
    local path="${PREFIX}/${key}"
    if aws ssm get-parameter --name "${path}" --region "${REGION}" --with-decryption \
         --query 'Parameter.Value' --output text >/dev/null 2>&1; then
      echo "  OK   ${path}"
    else
      echo "  MISS ${path}"
      missing=$((missing + 1))
    fi
  done
  if [[ "${missing}" -gt 0 ]]; then
    echo "[$(date -u +%FT%TZ)] ${missing} required parameter(s) missing."
    exit 1
  fi
  echo "[$(date -u +%FT%TZ)] All required parameters present."
}

if [[ "${VERIFY_ONLY}" -eq 1 ]]; then
  verify
  exit 0
fi

# Load values from SECRETS_FILE if provided, else prompt.
if [[ -n "${SECRETS_FILE:-}" ]]; then
  if [[ ! -f "${SECRETS_FILE}" ]]; then
    echo "ERROR: SECRETS_FILE not found: ${SECRETS_FILE}" >&2
    exit 2
  fi
  echo "[$(date -u +%FT%TZ)] Sourcing values from ${SECRETS_FILE}"
  # shellcheck disable=SC1090
  set -a; source "${SECRETS_FILE}"; set +a
fi

put_param() {
  local key="$1"   # e.g. JWT_SECRET or blog/NEWS_API_KEY
  local value="$2"
  local path="${PREFIX}/${key}"
  if [[ -z "${value}" ]]; then
    echo "  SKIP ${path} (empty value)"
    return 0
  fi
  aws ssm put-parameter \
    --name "${path}" \
    --type SecureString \
    --key-id "${KMS_ALIAS}" \
    --value "${value}" \
    --overwrite \
    --region "${REGION}" \
    >/dev/null
  echo "  PUT  ${path}"
}

prompt_value() {
  local key="$1"
  local var_name
  # Convert blog/NEWS_API_KEY → NEWS_API_KEY for env var lookup
  var_name="$(basename "${key}")"
  local existing="${!var_name:-}"
  if [[ -n "${existing}" ]]; then
    echo "${existing}"
    return
  fi
  read -r -s -p "  enter ${key} (empty to skip): " val
  echo ""
  echo "${val}"
}

echo "[$(date -u +%FT%TZ)] Injecting parameters under ${PREFIX} (region ${REGION})"
echo

echo "Required:"
for key in "${REQUIRED_KEYS[@]}"; do
  val="$(prompt_value "${key}")"
  put_param "${key}" "${val}"
done

echo
echo "Optional (press Enter to skip):"
for key in "${OPTIONAL_KEYS[@]}"; do
  val="$(prompt_value "${key}")"
  put_param "${key}" "${val}"
done

echo
echo "Blog pipeline:"
for key in "${BLOG_KEYS[@]}"; do
  val="$(prompt_value "${key}")"
  put_param "${key}" "${val}"
done

echo
echo "[$(date -u +%FT%TZ)] Done. Run with --verify to confirm."
