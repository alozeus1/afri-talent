# DevOps Runbook

## Local Development

Backend:

```bash
cd backend
npm install
npx prisma generate
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Use `.env.example` files as templates. Do not commit real `.env` files.

## Test Commands

```bash
cd backend && npm run lint && npm run typecheck && npm test && npm run build
cd frontend && npm run lint && npx tsc --noEmit && npm run test:unit:ci && npm run build
cd frontend && npm run test:e2e
```

Infrastructure validation only:

```bash
cd infra/terraform
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
```

## Deployment Flow

- `develop` is the shared staging integration branch.
- GitHub Actions builds backend/frontend images, pushes to ECR, reconciles
  Terraform, deploys App Runner, and runs post-deploy smoke checks.
- `main` is reserved for production promotion.
- Production deployment requires explicit human approval.

## Rollback Flow

- Identify the last known-good commit and GitHub Actions run.
- Prefer reverting through a PR.
- For App Runner incidents, use `STAGING_RUNBOOK.md` and GitHub deploy logs to
  identify service state.
- Do not modify production infrastructure or secrets without approval.

## Secrets Handling

- Runtime secrets live in AWS Secrets Manager for deployed environments.
- Local secrets live only in untracked `.env` files.
- Do not print secrets in logs, tickets, PRs, or heartbeat output.

## Staging Validation

- Backend `/health` returns success.
- Backend `/api/health` confirms database connectivity.
- Frontend root route responds.
- CI, Security, Terraform, and Deploy workflows complete successfully.

## Approval Gates

Human approval is required before:

- production deploy
- Terraform apply
- IAM changes
- secret changes
- database migrations in shared environments
- destructive database or infrastructure operations
