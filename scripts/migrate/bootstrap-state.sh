#!/usr/bin/env bash
#
# bootstrap-state.sh — one-time setup of the Terraform remote state backend
# in the new AWS account.
#
# Reads creds from .env at the repo root (NEVER prints them). Creates:
#   1. S3 bucket  afritalent-${ACCT}-tfstate  (versioned, KMS-encrypted, public-access-blocked)
#   2. DynamoDB table afritalent-${ACCT}-tflocks  (PAY_PER_REQUEST)
#
# Idempotent: if the bucket / table already exist, the script reports and exits 0.
#
# Usage:
#   ./scripts/migrate/bootstrap-state.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ ! -f "${REPO_ROOT}/.env" ]]; then
  echo "ERROR: ${REPO_ROOT}/.env not found." >&2
  exit 2
fi

# Load creds; never echo
set -a
# shellcheck disable=SC1091
source "${REPO_ROOT}/.env"
set +a

REGION="${AWS_REGION:-us-east-1}"

ACCT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")"
if [[ -z "${ACCT}" || "${ACCT}" == "None" ]]; then
  echo "ERROR: aws sts get-caller-identity failed. Check .env credentials." >&2
  exit 1
fi

BUCKET="afritalent-${ACCT}-tfstate"
TABLE="afritalent-${ACCT}-tflocks"

echo "[$(date -u +%FT%TZ)] Account=${ACCT} Region=${REGION}"
echo "[$(date -u +%FT%TZ)] Target bucket: ${BUCKET}"
echo "[$(date -u +%FT%TZ)] Target table:  ${TABLE}"
echo

# ── S3 bucket ────────────────────────────────────────────────────────────────
if aws s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  echo "  EXISTS  s3://${BUCKET}"
else
  echo "  CREATE  s3://${BUCKET}"
  if [[ "${REGION}" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}" >/dev/null
  else
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}" \
      --create-bucket-configuration "LocationConstraint=${REGION}" >/dev/null
  fi
fi

aws s3api put-bucket-versioning \
  --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled >/dev/null
echo "  OK      versioning"

aws s3api put-bucket-encryption \
  --bucket "${BUCKET}" \
  --server-side-encryption-configuration '{
    "Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"},"BucketKeyEnabled":true}]
  }' >/dev/null
echo "  OK      encryption"

aws s3api put-public-access-block \
  --bucket "${BUCKET}" \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" >/dev/null
echo "  OK      public-access-block"

# ── DynamoDB lock table ──────────────────────────────────────────────────────
if aws dynamodb describe-table --table-name "${TABLE}" --region "${REGION}" >/dev/null 2>&1; then
  echo "  EXISTS  dynamodb://${TABLE}"
else
  echo "  CREATE  dynamodb://${TABLE}"
  aws dynamodb create-table \
    --table-name "${TABLE}" \
    --attribute-definitions "AttributeName=LockID,AttributeType=S" \
    --key-schema "AttributeName=LockID,KeyType=HASH" \
    --billing-mode PAY_PER_REQUEST \
    --region "${REGION}" >/dev/null
  aws dynamodb wait table-exists --table-name "${TABLE}" --region "${REGION}"
  echo "  OK      table created and active"
fi

# Clear creds before exit
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

echo
echo "[$(date -u +%FT%TZ)] Bootstrap complete."
echo
echo "Next:"
echo "  cd infra/terraform/accounts/dev-new"
echo "  set -a; source ../../../../.env; set +a"
echo "  terraform init \\"
echo "    -backend-config=\"bucket=${BUCKET}\" \\"
echo "    -backend-config=\"dynamodb_table=${TABLE}\" \\"
echo "    -backend-config=\"key=dev-new/terraform.tfstate\" \\"
echo "    -backend-config=\"region=${REGION}\" \\"
echo "    -backend-config=\"encrypt=true\""
echo "  terraform validate"
echo "  terraform plan -out=tfplan"
