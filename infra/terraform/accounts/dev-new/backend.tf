# Remote state for the new-account dev environment.
#
# Bucket and lock table are bootstrapped manually (one-time) BEFORE the first
# `terraform init` against this stack — see scripts/migrate/bootstrap-state.sh.
#
# Bucket:        afritalent-108188564905-tfstate
# Lock table:    afritalent-108188564905-tflocks
# Region:        us-east-1
# Encryption:    SSE-KMS (account default key)
# Versioning:    enabled
#
# Caller passes -backend-config flags during init to keep this file
# free of account-specific values:
#
#   terraform init \
#     -backend-config="bucket=afritalent-108188564905-tfstate" \
#     -backend-config="dynamodb_table=afritalent-108188564905-tflocks" \
#     -backend-config="key=dev-new/terraform.tfstate" \
#     -backend-config="region=us-east-1" \
#     -backend-config="encrypt=true"

terraform {
  backend "s3" {}
}
