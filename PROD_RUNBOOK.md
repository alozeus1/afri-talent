# AfriTalent Production Runbook

## Platform Baseline

- Frontend: AWS App Runner
- Backend: AWS App Runner
- Database: Amazon RDS PostgreSQL
- Images: Amazon ECR
- Secrets: AWS Secrets Manager
- IaC: Terraform in `infra/terraform`

## Pre-Production Gates

- `infra/terraform/envs/prod/terraform.tfvars` reviewed from a clean plan
- backend and frontend App Runner min size set to `2`
- RDS configured with Multi-AZ, deletion protection, and `30` day backups
- production secrets rotated independently from non-prod
- Sentry ingest confirmed for frontend and backend
- Prisma migrations tested in staging and then run in production
- DNS and TLS validated for `afri-talent.com` and `api.afri-talent.com`

## Deploy Production

```bash
cd infra/terraform
terraform init -backend-config=envs/prod/backend.config
terraform plan -var-file=envs/prod/terraform.tfvars -out=prod.plan
terraform apply prod.plan
```

Then deploy application images with the `Deploy App Runner (Cost-Effective)` workflow.

Run migrations:

```bash
cd backend
DATABASE_URL="<production-database-url>" npx prisma migrate deploy
```

## Post-Deploy Smoke Tests

```bash
curl -fsS https://api.afri-talent.com/health
curl -fsS https://api.afri-talent.com/api/health
curl -I https://afri-talent.com
```

Validate:

- auth flows
- jobs list and detail
- applications submission path
- billing bootstrap
- Sentry frontend and backend events

## Emergency Procedures

- AI kill switch: set `AI_DISABLED=1` in backend runtime configuration and redeploy
- app rollback: redeploy the previous ECR image tag
- database incident: use RDS failover first, restore from snapshot only if needed

## Guardrails

- never use `terraform destroy` as a production rollback
- keep production image tags immutable and tied to commits
- confirm source map upload before closing a deployment window
