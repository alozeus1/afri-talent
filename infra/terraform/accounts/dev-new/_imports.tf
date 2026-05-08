# Temporary import declarations for resources that pre-existed in 108188564905
# before the new-account stack ran for the first time. After the next successful
# `terraform apply`, this file can be deleted (Terraform records imports in
# state and the import blocks become no-ops).

import {
  to = module.ecr.aws_ecr_repository.this["frontend"]
  id = "afritalent-dev-frontend"
}

import {
  to = module.ecr.aws_ecr_repository.this["backend"]
  id = "afritalent-dev-backend"
}

# Note: the legacy github-deploy IAM policy (created by the previous admin-scoped
# CI role) was deleted on 2026-05-08 along with its parent role
# `afritalent-dev-github-actions`. Terraform now creates the policy fresh.
