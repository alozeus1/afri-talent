# AfriTalent Deployment Guide

## Architecture Overview

```
┌─────────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│      Frontend       │────▶│       Backend       │────▶│    PostgreSQL     │
│ Next.js 16 on AWS   │     │ Express + TS on AWS │     │   Amazon RDS      │
│     App Runner      │     │     App Runner      │     │   private subnets │
└─────────────────────┘     └─────────────────────┘     └──────────────────┘
           │                           │                           │
           └──────────────▶ AWS ECR / Secrets Manager / S3 ◀──────┘
```

## Environments

- `dev`: continuous deployment from `develop`
- `staging`: pre-production validation
- `prod`: production deployment

Terraform environment files:

- `infra/terraform/envs/dev`
- `infra/terraform/envs/staging`
- `infra/terraform/envs/prod`

## Environment Matrix

| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `NODE_ENV` | development | staging | production |
| `DATABASE_URL` | local Postgres | RDS secret | RDS secret |
| `JWT_SECRET` | local secret | staging secret | production secret |
| `FRONTEND_URL` | http://localhost:3000 | https://staging.afri-talent.com | https://afri-talent.com |
| `NEXT_PUBLIC_API_URL` | http://localhost:4000 | https://api.staging.afri-talent.com | https://api.afri-talent.com |
| `NEXT_PUBLIC_BACKEND_URL` | http://localhost:4000 | https://api.staging.afri-talent.com | https://api.afri-talent.com |

## Local Development

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev

cd ../frontend
cp .env.example .env.local
npm install
npm run dev
```

## Local Production-Parity Test

```bash
docker-compose up --build
docker-compose run migrate
```

## AWS Deployment Flow

1. Apply Terraform for the target environment.
2. Build and push backend and frontend images to ECR.
3. Deploy App Runner services.
4. Run Prisma migrations.
5. Verify health checks and critical flows.

### Terraform

```bash
cd infra/terraform
terraform init -backend-config=envs/staging/backend.config
terraform plan -var-file=envs/staging/terraform.tfvars -out=staging.plan
terraform apply staging.plan
```

Swap `staging` for `prod` when promoting to production.

### GitHub Actions

Primary workflows:

- `.github/workflows/ci.yml`
- `.github/workflows/terraform.yml`
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-apprunner.yml`

## Required GitHub Settings

Secrets:

- `AWS_ROLE_ARN`
- `SENTRY_AUTH_TOKEN`

Variables:

- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `NEXT_PUBLIC_SENTRY_DSN`

## Required AWS Secret Keys

The application secret in AWS Secrets Manager should include:

- `DATABASE_URL`
- `JWT_SECRET`
- `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ADZUNA_APP_ID`
- `ADZUNA_API_KEY`
- `REDIS_URL`
- `SENTRY_DSN`

## Production Checklist

- prod Terraform backend and tfvars reviewed
- NAT enabled for private backend egress
- RDS Multi-AZ, backups, and deletion protection enabled
- App Runner service min size at least `2`
- Prisma migrations applied with `npx prisma migrate deploy`
- Sentry release upload and ingest validated
- Custom domains and TLS certificates verified
- Rollback tested with previous ECR image tags

## Health Checks

```bash
curl https://api.afri-talent.com/health
curl https://api.afri-talent.com/api/health
curl https://afri-talent.com
```

## Rollback

1. Identify the previous working image tag in ECR.
2. Re-run the App Runner deployment workflow with the previous tag.
3. Re-run health checks.
4. Coordinate any required database rollback separately.
