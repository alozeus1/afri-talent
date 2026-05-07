# DevOps Deployment Safety Review

- Problem: Deployment automation is powerful and must remain safe for staging
  and production promotion.
- Expected behavior: CI/CD gates protect production, Terraform plans are review
  artifacts, App Runner deployment health is verified, and rollback steps are
  documented.
- Affected area: `.github/workflows`, `infra/terraform`, `STAGING_RUNBOOK.md`,
  `docs/devops-runbook.md`.
- Assigned agent: DevOps Engineer Agent with Code Reviewer Agent.
- Risk level: High.
- Acceptance criteria: Review identifies production gates, staging deploy
  triggers, Terraform apply paths, migration behavior, and rollback gaps.
- Test plan: Workflow inspection, actionlint, Terraform validate where safe.
- Human approval requirement: Required before workflow changes that deploy, apply
  infrastructure, modify IAM, or change secrets.
