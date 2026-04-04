---
name: afritalent-operator
description: Use this skill when working on AfriTalent delivery, staging operations, CI/CD, AWS App Runner deployments, Terraform changes, or project continuity tasks that require fast orientation to the repo and live environment.
---

# Afritalent Operator

## Overview

This skill gives Codex a compact operating model for AfriTalent. Use it for release engineering, staging recovery, infrastructure changes, delivery hardening, operational handoff, and roadmap execution where project-specific context matters more than generic coding guidance.

## When To Use This Skill

- deployment and staging repair
- GitHub Actions and CI/CD changes
- Terraform and App Runner reconciliation
- operational handoff and transfer-of-knowledge docs
- pre-prod readiness reviews
- roadmap work for retrieval, matching, and agentic platform features

## Operating Workflow

### 1. Load Context Fast

Read these files in order:

1. `AGENT_BOOTSTRAP.md`
2. `STAGING_RUNBOOK.md`
3. `AGENTS.md`
4. `docs/ops/CICD_OPERATING_MODEL.md`

Then load only the specific code or Terraform modules required by the task.

### 2. Confirm The Active Runtime

Do not assume historical docs are still accurate. Verify current runtime and deployment path from:

- `STAGING_RUNBOOK.md`
- `.github/workflows/deploy-apprunner.yml`
- `infra/terraform/envs/staging/terraform.tfvars`

As of April 3, 2026, the active shared non-prod path is AWS App Runner plus ECR plus RDS, not Railway.

### 3. Respect Project Rules

- Treat `STAGING_RUNBOOK.md` as the source of truth for live environment state
- Update `STAGING_RUNBOOK.md` after any material live change
- Do not revert unrelated changes in `backend/dist/*`
- Do not revert unrelated changes in `infra/terraform/modules/apprunner/*`
- Keep infra, deploy, and handoff changes well documented in the same session

### 4. Validate Before Shipping

Use these commands when applicable:

```bash
cd backend && npm run lint && npm run typecheck && npm test && npm run build
cd frontend && npm run lint && npx tsc --noEmit && npm run test:unit:ci && npm run build
cd infra/terraform && terraform fmt -check -recursive && terraform init -backend=false && terraform validate
```

For delivery changes, also validate:

- GitHub Actions syntax
- Gitleaks
- Checkov
- TFLint

### 5. Keep The Pre-Prod Gap List Visible

These are the current cleanup targets:

- staging Stripe secret is missing
- broader Terraform reconciliation is still incomplete outside the targeted App Runner recovery work
- semantic retrieval exists, but still needs staged rollout validation and a stronger embedding provider for production-quality retrieval

## Product Direction Notes

AfriTalent is strongest today in:

- trust and risk signaling
- ATS depth
- employer onboarding
- candidate AI workflow

It still needs work in:

- semantic search
- recruiter workflow depth
- market intelligence
- durable data moat

Priority background agents to build next:

- `job-discovery-agent`
- `match-ranking-agent`
- `application-pack-agent`
- `recruiter-copilot-agent`
- `trust-risk-agent`
- `mobility-readiness-agent`

## References

- `references/read-order.md`
- `references/next-agent-roadmap.md`
