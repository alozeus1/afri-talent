# Remote state for the production stack (Wave 8 §9.1 — promote the Fargate
# stack to a new dedicated AWS account `afritalent-prod`).
#
# Bucket + lock table are bootstrapped manually in the NEW prod account BEFORE
# the first `terraform init` against this stack — see
# `docs/runbooks/iac-cutover.md` §"Pre-cutover: state backend bootstrap".
#
# Bucket:        afritalent-<PROD_ACCOUNT_ID>-tfstate
# Lock table:    afritalent-<PROD_ACCOUNT_ID>-tflocks
# Region:        us-east-1
# Encryption:    SSE-KMS (account default key)
# Versioning:    enabled
#
# Caller passes -backend-config flags during init to keep account-specific
# values out of the file:
#
#   terraform init \
#     -backend-config="bucket=afritalent-${PROD_ACCOUNT_ID}-tfstate" \
#     -backend-config="dynamodb_table=afritalent-${PROD_ACCOUNT_ID}-tflocks" \
#     -backend-config="key=afritalent-prod/terraform.tfstate" \
#     -backend-config="region=us-east-1" \
#     -backend-config="encrypt=true"
#
# `.github/workflows/deploy.yml` already constructs these flags using
# `vars.AWS_ACCOUNT_ID`. To deploy this stack the founder swaps
# `vars.AWS_ACCOUNT_ID` to the new prod account id (and uses a new
# `vars.OIDC_ROLE_NAME` if the role name differs).

terraform {
  backend "s3" {}
}
