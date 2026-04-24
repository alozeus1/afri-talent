# Repository Guidelines

## Project Structure & Module Organization

- `backend/`: Express + Prisma API (TypeScript). Entry: `src/server.ts`. Prisma schema/seed in `prisma/`.
- `frontend/`: Next.js App Router UI (TypeScript). Pages in `src/app`, shared UI in `src/components`.
- `infra/terraform/`: AWS App Runner + RDS infrastructure, CI/CD workflows.
- `infra/terraform/modules/`: Terraform submodules (`network`, `security`, `alb`, `cloudfront`, `ecr`, `rds`, `secrets`, `iam-ecs`, `ecs`, `route53`, `github-oidc`).
- `docs`: Root markdown files describe deployment, security, and ops.

## Build, Test, and Development Commands

Backend:
- `cd backend && npm run dev`: start API with ts-node.
- `cd backend && npm run build`: compile TypeScript to `dist/`.
- `cd backend && npx tsc --noEmit`: typecheck only.
- `cd backend && npx prisma migrate dev`: run migrations.

Frontend:
- `cd frontend && npm run dev`: start Next.js dev server.
- `cd frontend && npm run build`: production build.
- `cd frontend && npm run lint`: run ESLint.
- `cd frontend && npx tsc --noEmit`: typecheck only.

## Coding Style & Naming Conventions

- TypeScript throughout; follow existing patterns and file structure.
- 2‑space indentation in TS/TSX.
- React components use PascalCase; hooks are `useX`.
- Prefer descriptive names (`candidateApplications`, not `data`).

## Testing Guidelines

- Backend uses ESLint, TypeScript typecheck, Vitest, and build verification.
- Frontend uses ESLint, TypeScript typecheck, Jest unit tests, Playwright, Lighthouse, and build verification.
- Terraform CI runs fmt, validate, TFLint, Checkov, and a staging plan when credentials are available.

## Architecture Overview

- High-level layout is documented in `DEPLOYMENT.md` and `infra/terraform/README.md`.
- Current shared non-prod deployment path is App Runner frontend/backend + RDS PostgreSQL.
- If you add diagrams, place them in `docs/architecture/` and link them from `DEPLOYMENT.md`.

## Current Project Status

- As of April 7, 2026, the active shared staging stack is AWS App Runner + ECR + RDS PostgreSQL + S3 + Secrets Manager + Terraform.
- `develop` remains the staging integration branch and the source for automatic shared staging deployments.
- Shared staging is operational and the CloudWatch Synthetics canary failure in `deploy-apprunner.yml` has been repaired in commit `9fa48da`.
- The most recent validation run should be checked in GitHub Actions and `STAGING_RUNBOOK.md` before assuming the latest App Runner rollout is fully complete.
- Product direction is strongest around trust, employer workflow, ATS depth, and early AI-assisted candidate/recruiter flows.
- Remaining high-priority pre-prod gaps are Stripe test credential setup, full Terraform reconciliation under the intended AWS path, and deploying plus validating the semantic retrieval layer at staging scale.
- Public-facing descriptions of the project should stay high-level: share mission, stack, SDLC, DevOps discipline, and product direction, but avoid disclosing proprietary ranking logic, trust-scoring details, or unpublished roadmap specifics.

## Release Process

- Provision or update infra with Terraform (`infra/terraform`), then capture outputs.
- Build/push images to ECR and deploy App Runner.
- Shared staging is the only active shared test environment; `dev` was intentionally removed.
- Backend runtime currently applies `npx prisma migrate deploy` at container startup for staging.
- Validate `/api/health`, `/health`, and the frontend root route after deploys.

## Deployment Handoff

- For any fresh Codex session, read `AGENT_BOOTSTRAP.md` before exploring the codebase.
- For any deployment, staging, infrastructure, or incident task, read `STAGING_RUNBOOK.md` first.
- Treat `STAGING_RUNBOOK.md` as the current source of truth for live environment state, URLs, AWS resource names, last known blockers, and recovery steps.
- After any material live change, update `STAGING_RUNBOOK.md` in the same session so future agents inherit the latest state immediately.

## Commit & Pull Request Guidelines

- Use concise, imperative commit messages (e.g., “Add Terraform plan job”).
- PRs should include a summary, related issue links, and UI screenshots when applicable.
- Keep changes scoped; avoid mixing infra and app changes unless required.

## Security & Configuration Tips

- Never commit `.env` files; use `backend/.env.example` and `frontend/.env.example`.
- For deploys, use GitHub OIDC role from Terraform outputs (see `infra/terraform/README.md`).
