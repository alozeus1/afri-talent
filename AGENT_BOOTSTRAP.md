# AfriTalent Agent Bootstrap

Last updated: April 3, 2026

This is the first file a new Codex session should read before touching the repo.
It is the fast path to understanding the product, the live environment, the delivery model, the major known gaps, and the docs that matter.

## Read Order

1. Read this file
2. Read `STAGING_RUNBOOK.md` for live AWS state and last-known deployment details
3. Read `AGENTS.md` for repo conventions and deployment handoff rules
4. Read `docs/ops/CICD_OPERATING_MODEL.md` for the CI/CD and GitHub model
5. Read the latest standing review in `docs/reviews/`
6. Read the latest execution plan in `docs/plans/`

## Product Snapshot

- Product: AfriTalent
- Core value: connect African talent to global opportunities with stronger trust, employer workflow, and AI assistance than generic job boards
- Backend: Express + Prisma + PostgreSQL
- Frontend: Next.js App Router
- Infra: AWS App Runner, ECR, RDS, Secrets Manager, S3, Terraform
- Shared non-prod environment: `staging`
- Production: reserved, not fully launched

## Repo Map

- `backend/`: Express API, Prisma schema, migrations, tests, Docker image
- `frontend/`: Next.js web app, unit tests, Playwright, Lighthouse config
- `infra/terraform/`: App Runner, RDS, ECR, networking, secrets, IAM, Route 53
- `.github/workflows/`: CI, security, Terraform, and deployment workflows
- `docs/reviews/`: project standing reviews and comparative assessments
- `docs/plans/`: next-phase planning artifacts
- `.codex/skills/afritalent-operator/`: project-specific skill for future agents

## Live Environment Summary

Canonical live details are in `STAGING_RUNBOOK.md`. At the time of writing:

- Active non-prod runtime is AWS, not Railway
- Backend App Runner service is healthy and returns `200`
- Frontend live service is `afritalent-stg-fe-livefix`
- Redis is backed by AWS ElastiCache Serverless and currently connected in staging
- The dead managed frontend App Runner service has already been removed from AWS and the live frontend service is now imported into Terraform state

## Delivery Model

- `develop` is the staging integration branch
- `main` is the production promotion branch
- CI runs app validation
- Security workflow runs Gitleaks and dependency review
- Terraform workflow runs fmt, validate, TFLint, Checkov, and a staging plan when credentials are available
- App Runner deploy workflow builds amd64 images, pushes them to ECR, reconciles infra, triggers App Runner deployments, and runs post-deploy smoke checks

## What Was Recently Repaired

- The broken staging deployment path was restored on AWS App Runner
- Prisma migration failures blocking backend startup were repaired
- The clean-database Prisma migration chain was reconciled so CI can migrate and seed from zero without schema drift
- Staging now points at the working live frontend service instead of the dead managed one
- Repo-level delivery controls were upgraded with backend linting, workflow linting, security scans, Terraform checks, CODEOWNERS, Dependabot, and a PR template

## What Still Needs To Be Closed Before Pre-Prod Is Clean

- Populate `STRIPE_SECRET_KEY` for staging with a real test-mode key
- Complete the broader Terraform reconciliation beyond the targeted App Runner repairs that are already in state
- Deploy and operationalize the new semantic retrieval foundation with job indexing plus a stronger embedding provider if we want production-grade retrieval quality

## Product And Platform Gaps

AfriTalent is stronger than before on trust, ATS depth, employer onboarding, and candidate AI workflow. It is still comparatively weaker on:

- semantic search and retrieval quality beyond the new hash-embedding foundation
- recruiter workflow depth
- talent market intelligence
- defensible proprietary data loops
- automation depth across discovery, matching, and application packaging

## Background Agents To Build Next

- `job-discovery-agent`
- `match-ranking-agent`
- `application-pack-agent`
- `recruiter-copilot-agent`
- `trust-risk-agent`
- `mobility-readiness-agent`

These are product agents, not Codex skills. Treat them as roadmap capabilities that need backend services, queueing, observability, evals, and trust controls.

## Working Rules For Future Agents

- Read `STAGING_RUNBOOK.md` before any live or infra work
- Do not assume Railway is active unless a fresh verification says otherwise
- Do not revert unrelated changes in `backend/dist/*` or `infra/terraform/modules/apprunner/*`
- If a live environment changes, update `STAGING_RUNBOOK.md` in the same session
- Prefer scoped changes with verification evidence over broad refactors

## High-Signal Commands

```bash
cd backend && npm run lint && npm run typecheck && npm test && npm run build
cd frontend && npm run lint && npx tsc --noEmit && npm run test:unit:ci && npm run build
cd infra/terraform && terraform fmt -check -recursive && terraform init -backend=false && terraform validate
```

## Reference Docs

- `STAGING_RUNBOOK.md`
- `docs/ops/CICD_OPERATING_MODEL.md`
- `docs/SEMANTIC_RETRIEVAL_FOUNDATION.md`
- `docs/reviews/2026-04-03-project-standing-review.md`
- `docs/plans/2026-04-03-preprod-next-phase-plan.md`
- `.codex/skills/afritalent-operator/SKILL.md`
