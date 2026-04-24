# AfriTalent Production Runbook

Last updated: 2026-03-31

This is the authoritative reference for production deployments, health verification, and rollback.
Read this before touching anything in the `prod` environment.

---

## AWS Account & Region

| Item | Value |
|---|---|
| AWS Account | `260820061731` |
| Region | `us-east-1` |
| GitHub Repo | `alozeus1/afri-talent` |
| Production branch | `main` |

---

## Required GitHub Secrets & Variables

All of these must be set **at the repository level** in GitHub → Settings → Secrets and variables before the first production deploy.

### Secrets (encrypted)

| Secret name | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `REDIS_URL` | Production Redis connection string |
| `BACKEND_SENTRY_DSN` | Sentry DSN for backend error tracking |
| `STRIPE_SECRET_KEY` | Stripe production secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `ADZUNA_APP_ID` | Adzuna job feed app ID |
| `ADZUNA_API_KEY` | Adzuna job feed API key |
| `SENTRY_AUTH_TOKEN` | Sentry release upload token (frontend build) |

### Variables (plain text)

| Variable name | Value |
|---|---|
| `AWS_ROLE_ARN` | `arn:aws:iam::260820061731:role/afritalent-prod-github-actions` |
| `AWS_ACCOUNT_ID` | `260820061731` |
| `ECR_REGISTRY` | `260820061731.dkr.ecr.us-east-1.amazonaws.com` |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry public DSN for frontend |
| `SENTRY_ORG` | Sentry org slug |
| `SENTRY_PROJECT` | Sentry project slug |

---

## GitHub Environment: `production`

The deploy workflow requires a GitHub Environment named **`production`** with a required reviewer. Without this, the `prod-gate` CI job will fail.

**One-time setup (manual):**
1. GitHub → Settings → Environments → New environment: `production`
2. Check "Required reviewers" → add the release approver(s)
3. Under "Deployment branches": select "Selected branches" → add `main`

The `prod-gate` job will pause and wait for approval before any AWS resources are touched.

---

## Triggering a Production Deploy

Production deploys are **never triggered automatically** — only from `workflow_dispatch` on `main`.

```bash
gh workflow run deploy-apprunner.yml \
  --ref main \
  --field environment=prod
```

Or via GitHub UI: Actions → "Deploy Shared Environment (App Runner)" → Run workflow → environment: `prod` → Run.

**Job flow after approval:**

| Step | Job | What happens |
|---|---|---|
| 1 | `prod-gate` | Pauses for required reviewer — approve in GitHub UI |
| 2 | `provision-infra` | Terraform base infra + secrets hydration |
| 3 | `build-and-push` | Docker build + push to ECR |
| 4 | `finalize-infra` | Full Terraform apply + captures App Runner URLs |
| 5 | `deploy-apprunner` | Triggers App Runner deploy + waits for RUNNING |
| 6 | `health-check` | Verifies `/health` and frontend return healthy |

---

## Pre-Deploy Checklist

Before triggering a production deploy, verify each item:

- [ ] All required CI checks pass on `main`: `backend-test`, `frontend-unit-test`, `frontend-build`, `frontend-typecheck`, `frontend-lint`, `backend-typecheck`
- [ ] All 8 GitHub Secrets populated (see table above)
- [ ] All 6 GitHub Variables populated (see table above)
- [ ] GitHub `production` environment configured with at least one required reviewer
- [ ] Staging deploy is healthy — check `STAGING_RUNBOOK.md` for current staging status
- [ ] Migrations tested in staging before applying to production
- [ ] `db_deletion_protection = true` in `infra/terraform/envs/prod/terraform.tfvars`
- [ ] `db_multi_az = true` in `infra/terraform/envs/prod/terraform.tfvars`
- [ ] Sentry DSNs confirmed for frontend and backend

---

## Production AWS Resources

> These are populated after the first successful production deploy. Update this section immediately after.

| Resource | Name / ARN |
|---|---|
| Terraform state bucket | `afritalent-260820061731-prod-terraform-state` |
| Terraform lock table | `afritalent-260820061731-prod-terraform-locks` |
| GitHub Actions IAM role | `arn:aws:iam::260820061731:role/afritalent-prod-github-actions` |
| Backend ECR repo | `afritalent-prod-backend` |
| Frontend ECR repo | `afritalent-prod-frontend` |
| S3 uploads bucket | `afritalent-260820061731-prod-uploads` |
| Secrets Manager secret | `afritalent-prod/app-secrets` |
| RDS instance identifier | `afritalent-prod-postgres` *(confirm after deploy)* |
| Backend App Runner URL | *(populate after first deploy)* |
| Frontend App Runner URL | *(populate after first deploy)* |
| Backend App Runner ARN | *(populate after first deploy)* |
| Frontend App Runner ARN | *(populate after first deploy)* |
| Last deployed image tag | *(populate after first deploy)* |

---

## Health Verification

After a deploy, verify manually:

```bash
# Backend health
curl -sf https://<backend-url>/health | jq .
# Expected: {"status":"ok"}

# Frontend reachable
curl -sI https://<frontend-url>/en | grep "200"

# App Runner service status
aws apprunner describe-service \
  --service-arn <backend-arn> \
  --query 'Service.Status' --output text

aws apprunner describe-service \
  --service-arn <frontend-arn> \
  --query 'Service.Status' --output text
# Expected: RUNNING for both
```

**Smoke-test flows to verify manually:**
- Auth: candidate and employer login
- Jobs: job list and detail page load
- Application: submit an application through to confirmation
- Billing: pricing page loads with correct regional pricing
- Trust: trust score card renders for candidate
- AI: job matching generates results (check backend logs for no errors)

---

## Rollback Procedure

### Fast rollback — redeploy previous image tag

```bash
# 1. Find the previous good commit SHA
git log --oneline main | head -10

# 2. Trigger deploy workflow pointing at that commit
gh workflow run deploy-apprunner.yml \
  --ref <previous-good-commit-sha> \
  --field environment=prod
```

### Emergency App Runner forced restart

If a service is stuck in `OPERATION_IN_PROGRESS` for more than 20 minutes:

```bash
# Pause then resume to unstick
aws apprunner pause-service --service-arn <service-arn>
# Wait ~60s
aws apprunner resume-service --service-arn <service-arn>
```

### AI kill switch

If the AI subsystem is causing errors or cost runaway, disable it without a full redeploy:

1. Go to AWS Secrets Manager → `afritalent-prod/app-secrets`
2. Add or update the key `AI_DISABLED` to `"1"`
3. Trigger a production redeploy (App Runner picks up new secret values on deploy)

Or set via Secrets Manager CLI:
```bash
aws secretsmanager update-secret \
  --secret-id afritalent-prod/app-secrets \
  --secret-string "$(aws secretsmanager get-secret-value \
    --secret-id afritalent-prod/app-secrets \
    --query SecretString --output text | jq '. + {AI_DISABLED:"1"}')"
```

### Database incidents

- **App-level errors:** fix in code and redeploy — do not roll back schema
- **RDS failover:** Multi-AZ is enabled; AWS promotes the standby automatically on failure
- **Data corruption:** RDS automated backups retained 30 days — use point-in-time restore via AWS console only as last resort

Never use `terraform destroy` as a rollback mechanism in production.

---

## Secrets Rotation

All runtime secrets are stored in AWS Secrets Manager under `afritalent-prod/app-secrets`. The deploy workflow hydrates this secret from GitHub Secrets on every run.

To rotate a secret:
1. Update the value in GitHub → Settings → Secrets
2. Trigger a production deploy — the `Hydrate runtime secrets` step pushes the new value to Secrets Manager
3. App Runner picks up new secret values on the next deployment

---

## Platform Guardrails

- Never use `terraform destroy` in production
- Keep production image tags immutable and tied to commit SHAs
- Keep `db_deletion_protection = true` — removing it requires a deliberate two-step process
- Prisma migrations are forward-only — write corrective migrations, do not attempt to roll back schema changes
- `MOCK_AI=1` must **never** be set in production (CI uses it; production must not)

---

## Contact & Escalation

- Alerts email: `alozeus1@gmail.com`
- On-call escalation: see `docs/ops/INCIDENT_SEVERITY_AND_ESCALATION.md`
- Sentry: check dashboard for production error rates after every deploy
