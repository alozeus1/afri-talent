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

### Local Postgres + pgvector

`backend/prisma/schema.prisma` uses the `vector` type from the pgvector
extension. CI runs against `pgvector/pgvector:pg15`, so CI is unaffected,
but `prisma migrate deploy` against a local Postgres without the extension
fails on `20260512000000_enable_pgvector_extension`.

Two ways to satisfy this locally:

```bash
# Option 1 — install pgvector into your existing local Postgres
brew install pgvector
# then in psql:
#   CREATE EXTENSION IF NOT EXISTS vector;

# Option 2 — use the same image CI uses, via docker
docker run --rm -d --name afritalent-pg -p 5432:5432 \
  -e POSTGRES_USER=afritalent -e POSTGRES_PASSWORD=afritalent_test \
  -e POSTGRES_DB=afritalent_test \
  pgvector/pgvector:pg15
```

### Stray `_prisma_migrations` rows

If a local dev environment carries `_prisma_migrations` rows for the
historical `20260429150000_add_learning_feedback` migration whose on-disk
file no longer exists (the current file is `20260429120000_add_learning_feedback`),
`prisma migrate deploy` ignores them but `prisma migrate status` warns.
Clean up with:

```bash
psql "$DATABASE_URL" -c "DELETE FROM _prisma_migrations \
  WHERE migration_name = '20260429150000_add_learning_feedback';"
```

CI is unaffected — the test DB is provisioned fresh per run.

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
