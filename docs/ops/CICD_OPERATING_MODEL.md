# AfriTalent CI/CD Operating Model

Last updated: April 3, 2026

## Purpose

This document describes the target delivery model for AfriTalent so future changes land safely, are validated consistently, and deploy to staging through a repeatable GitHub Actions and AWS path.

## Branch Strategy

- `feature/*`: short-lived implementation branches
- `develop`: staging integration branch and automatic staging deploy source
- `main`: production promotion branch

Recommended flow:

1. Branch from `develop`
2. Open a pull request back into `develop`
3. Merge only after CI, security, and Terraform checks pass
4. Let the merge to `develop` deploy staging automatically
5. Promote to `main` only after staging validation
6. Use manual `workflow_dispatch` plus environment approval for production deploys

## GitHub Workflows

### `ci.yml`

Runs application quality gates:

- workflow lint via `actionlint`
- backend lint
- backend typecheck
- backend tests
- backend build
- frontend lint
- frontend typecheck
- frontend unit tests
- frontend build
- Lighthouse mobile check
- Playwright end-to-end tests

### `security.yml`

Runs repository security checks:

- Gitleaks secret scanning
- dependency review on pull requests

### `terraform.yml`

Runs infrastructure checks:

- `terraform fmt -check -recursive`
- `terraform init -backend=false`
- `terraform validate`
- `tflint`
- `checkov`
- staging `terraform plan` when AWS OIDC variables are available and the PR is from the same repository
- always reports `Terraform Validate` and `Checkov` so required branch-protection checks do not disappear on commits that only touch app or docs files
- no-ops cleanly when a revision contains no `infra/terraform/**` changes

Current note:

- `.checkov.yml` intentionally skips a set of known legacy and non-prod AWS controls so the pipeline can enforce a stable baseline today while the deeper infrastructure hardening backlog is completed in follow-on work
- `CKV_AWS_2` is currently skipped because the dormant ECS rollback module retains an HTTP ALB listener; the live shared environment runs on App Runner, not that ALB path
- `infra/terraform/.tflint.hcl` disables `terraform_unused_declarations` for the root stack because a small set of ECS rollback inputs are intentionally retained while App Runner is the live delivery path

### `deploy-apprunner.yml`

Runs deployment automation:

- bootstraps Terraform backend if needed
- applies base AWS infrastructure
- hydrates runtime secrets into Secrets Manager
- builds amd64 backend and frontend images
- pushes images to ECR
- applies full Terraform stack
- deploys App Runner services
- runs post-deploy health checks

## Required Repository Controls

- `CODEOWNERS` routes review responsibility
- `dependabot.yml` keeps npm, Terraform, Docker, and Actions dependencies moving
- PR template keeps validation and rollback notes explicit
- branch protection should require the delivery checks that matter most

## Recommended Required Checks

Protect at least `main`, and preferably `develop` once the team is ready:

- `Workflow Lint`
- `Backend Lint`
- `Backend Typecheck`
- `Backend Tests`
- `Backend Build`
- `Frontend Lint`
- `Frontend Typecheck`
- `Frontend Unit Tests`
- `Frontend Build`
- `Gitleaks Scan`
- `Terraform Validate`
- `Checkov`

Keep Lighthouse and Playwright as strong signals, but they can remain non-blocking if the team needs faster iteration at first.

## GitHub Repository Configuration

Recommended settings:

- branch protection on `main`
- branch protection on `develop` after workflow names stabilize
- delete head branches automatically after merge
- staging and production environments configured in GitHub
- production environment protected with reviewer approval

## AWS Delivery Expectations

- GitHub Actions authenticates to AWS through OIDC
- Terraform remains the source of truth for managed infrastructure
- App Runner should always consume images from the ECR repos managed in Terraform
- health checks must validate both backend and frontend URLs after deployment

## Current Known Friction

- staging Stripe secret is missing
- full local Terraform reconciliation is still blocked from the `admin` IAM user by an explicit deny on `ec2:DescribeInstances`
- the semantic retrieval foundation is in the repo, but it still needs staged indexing and a stronger production-grade embedding provider

## End-To-End Validation Checklist

Before merging delivery changes:

1. Run backend lint, typecheck, tests, and build
2. Verify a clean Postgres database can apply all Prisma migrations and complete `prisma db seed`
3. Run frontend lint, typecheck, unit tests, and build
4. Run Terraform fmt, init without backend, validate, TFLint, and Checkov
5. Run Gitleaks locally or verify it in Actions
6. Confirm the deploy workflow syntax with `actionlint`
7. After merge to `develop`, confirm GitHub Actions completed and staging health endpoints return success
