# AfriTalent Shared Staging Handoff And Runbook

Last updated: April 3, 2026 5:12 PM (America/Chicago)

This is the first file a future Codex run should read for staging, deployment, ops, and recovery work.
It captures the current live state, the last known deployment progress, where to look in AWS, and the fastest safe troubleshooting paths.

## What This App Is

- Product: AfriTalent
- Backend: Express + Prisma + PostgreSQL
- Frontend: Next.js App Router
- Runtime platform: AWS App Runner
- Data services: Amazon RDS PostgreSQL, Secrets Manager, S3, ECR
- IaC: Terraform in `infra/terraform`
- Primary shared non-prod environment: `staging`
- Production is intentionally not deployed yet

## Environment Model

- `dev` has been intentionally destroyed to reduce cost
- `staging` is now the only shared cloud environment for test, QA, and UAT
- `prod` remains reserved for later

## Agent Startup Checklist

For any future deployment or incident task:

1. Read this file first
2. Check live staging backend health
3. Check App Runner service status and operations
4. Check `git status` before editing anything
5. Do not revert unrelated local changes in `backend/dist/*` or `infra/terraform/modules/apprunner/*`

## Operational References

For incidents, readiness work, or monitoring changes, use these docs after this runbook:

- `docs/ops/README.md`
- `docs/ops/SLO_DEFINITIONS.md`
- `docs/ops/ALERT_CATALOG.md`
- `docs/ops/INCIDENT_SEVERITY_AND_ESCALATION.md`
- `docs/runbooks/`

## Current Live AWS State

- AWS account: `260820061731`
- Region: `us-east-1`
- Shared environment: `staging`
- Terraform state bucket: `afritalent-260820061731-staging-terraform-state`
- Terraform lock table: `afritalent-260820061731-staging-terraform-locks`
- GitHub Actions role: `arn:aws:iam::260820061731:role/afritalent-staging-github-actions`
- Staging DB instance: `afritalent-staging-postgres`
- Staging DB endpoint: `afritalent-staging-postgres.cm3aieqwylul.us-east-1.rds.amazonaws.com`
- Staging secret: `afritalent-staging/app-secrets`
- Staging uploads bucket: `afritalent-staging-uploads`
- Backend ECR repo: `afritalent-staging-backend`
- Frontend ECR repo: `afritalent-staging-frontend`

## Current App Runner Resources

- Backend service name: `afritalent-staging-appr-backend-managed`
- Backend service ARN: `arn:aws:apprunner:us-east-1:260820061731:service/afritalent-staging-appr-backend-managed/c768443a22d2415a9d182079a8ff639d`
- Backend public URL: `https://ed4nsj3sgv.us-east-1.awsapprunner.com`
- Backend status at handoff: `RUNNING` and returning `200` on `/health` and `/api/health`
- Backend live health payload is currently `ok` with `database=connected` and `redis=connected`

- Frontend live service name: `afritalent-stg-fe-livefix`
- Frontend live service ARN: `arn:aws:apprunner:us-east-1:260820061731:service/afritalent-stg-fe-livefix/3cfcc7543c0746c582000ae3d4a529b4`
- Frontend live URL: `https://3mwn2b4e5t.us-east-1.awsapprunner.com`
- Frontend live status at handoff: `RUNNING`

- The dead managed frontend App Runner service has been deleted from AWS after the live frontend service was imported into Terraform state

## Last Known Deployment State

The current shared staging deployment path is working on AWS App Runner.

Completed on April 3, 2026:

- Verified the active non-prod runtime is AWS App Runner + ECR + RDS PostgreSQL, not Railway
- Confirmed frontend live service `afritalent-stg-fe-livefix` is healthy on image tag `apprunnerfix-20260326-221310`
- Patched `.github/workflows/deploy-apprunner.yml` and `infra/terraform/envs/staging/terraform.tfvars` so staging points at the recovered live frontend service instead of the dead managed frontend service
- Repaired the broken Prisma migration chain:
  - `20260329003000_add_candidate_authenticity_layer` now bootstraps the missing trust schema safely
  - `20260329020000_add_candidate_retention_lifecycle` now checks `NotificationType` correctly
- Rebuilt and pushed the backend image to the existing ECR tag `1910dfc-live`
- Backend App Runner deployment `e865b93c94a74454acb47799c5c7b584` succeeded
- Backend application logs confirmed the previously failed trust migration, ATS migration, and candidate retention migration all applied successfully in staging
- Backend startup now auto-clears the previously failed trust migration ledger entry before running `prisma migrate deploy`
- Imported the live frontend App Runner service `afritalent-stg-fe-livefix` into Terraform state
- Updated staging Terraform config so backend redirects and S3/CORS public URL resolution use the live frontend App Runner URL
- Applied a targeted Terraform update so backend `FRONTEND_URL` now points at `https://3mwn2b4e5t.us-east-1.awsapprunner.com`
- Provisioned AWS ElastiCache Serverless Redis:
  - cache name: `afritalent-staging-redis`
  - endpoint: `afritalent-staging-redis-w72h9g.serverless.use1.cache.amazonaws.com:6379`
  - security group: `sg-02077c3484d361b0e`
- Updated staging `REDIS_URL` in Secrets Manager and the GitHub Actions repo secret to the new AWS Redis endpoint
- Restarted the backend App Runner service and verified `/health` now returns `status=ok` with `redis=connected`
- Deleted the dead frontend App Runner service `afritalent-staging-appr-frontend-managed`

Open:

- `STRIPE_SECRET_KEY` is still empty in `afritalent-staging/app-secrets`
- A full local `terraform plan` from the `admin` IAM user is still blocked by an explicit deny on `ec2:DescribeInstances` from `arn:aws:iam::260820061731:policy/demo-policy`
- Full Terraform apply is still pending for monitoring, alerting, and other non-App-Runner resources outside the targeted repairs above
- A semantic retrieval foundation now exists in the backend codebase, but it has not been deployed or indexed in staging yet

## Last Known Image Digests

- Backend tag: `1910dfc-live`
- Backend digest: `sha256:157eebefaa3db7ab605176a9dd68a6b0b19e5cf0ee53a102f27db799a9830ed9`
- Backend image pushed at: `2026-04-03 14:53:43 America/Chicago`

- Frontend tag: `apprunnerfix-20260326-221310`
- Frontend digest: `sha256:13c51e87e91671834c6bf170a6968684ee325a1147c3cfe433af507f0d2a13b8`
- Frontend image pushed at: `2026-04-03 14:21:31 America/Chicago`

## Current Repo State

There is a local commit that captures the shared staging deployment repair:

- Commit: `fe70c56`
- Message: `Repair shared staging deployment path`

That commit includes the main deploy-path fixes:

- `staging` as the shared non-prod environment
- deploy workflow updates for `develop`
- backend runtime migration entrypoint
- Terraform DB password drift fix in root `main.tf`
- URL-safe secret generation in `infra/terraform/modules/secrets/main.tf`

Important: the working tree still has unrelated local modifications that were not reverted:

- `backend/dist/*`
- `infra/terraform/modules/apprunner/main.tf`
- `infra/terraform/modules/apprunner/variables.tf`

Do not reset or discard those unless the user explicitly asks.

## Known Issues At Handoff

1. Backend `FRONTEND_URL` previously pointed at `https://staging.afri-talent.com`
   Resolved on April 3, 2026.
   - backend runtime env now points at `https://3mwn2b4e5t.us-east-1.awsapprunner.com`
   - password reset links and frontend redirects now target the live staging frontend service

2. Staging Redis is degraded
   Resolved on April 3, 2026.
   - `/health` and `/api/health` now return `redis=connected`
   - staging now uses AWS ElastiCache Serverless instead of the previous external Upstash URL

3. The original managed frontend App Runner service is dead
   Resolved on April 3, 2026.
   - live traffic remains on `afritalent-stg-fe-livefix`
   - the live frontend service is now in Terraform state
   - the dead managed service has been deleted from AWS

4. Backend migrations now depend on a targeted ledger repair at startup
   - `backend/docker/entrypoint.sh` clears the old failed `20260329003000_add_candidate_authenticity_layer` row in `_prisma_migrations`
   - leave that in place until the staging database history has been normalized and a cleanup pass is planned

5. Uploads bucket CORS was manually widened for App Runner testing
   Current allowed origins include:
   - `https://staging.afri-talent.com`
   - `https://rrmkvb99ca.us-east-1.awsapprunner.com`
   - `https://3mwn2b4e5t.us-east-1.awsapprunner.com`

6. Stripe is still the main remaining pre-prod blocker
   - `STRIPE_SECRET_KEY` is still empty
   - no usable Stripe test credential is present in the local shell, GitHub repo secrets, or the staging app secret
   - billing flows should be treated as incomplete until a real test-mode Stripe key is provided

## Where To Look First

### Backend Health

```bash
curl -fsS https://ed4nsj3sgv.us-east-1.awsapprunner.com/health
curl -fsS https://ed4nsj3sgv.us-east-1.awsapprunner.com/api/health
```

### App Runner Status

```bash
aws apprunner describe-service --service-arn <SERVICE_ARN>
aws apprunner list-operations --service-arn <SERVICE_ARN>
```

### App Runner Service Logs

```bash
aws logs get-log-events \
  --log-group-name /aws/apprunner/<service-name>/<service-id>/service \
  --log-stream-name events
```

### App Runner Application Logs

```bash
aws logs describe-log-streams \
  --log-group-name /aws/apprunner/<service-name>/<service-id>/application \
  --order-by LastEventTime --descending --max-items 5

aws logs get-log-events \
  --log-group-name /aws/apprunner/<service-name>/<service-id>/application \
  --log-stream-name <stream-name>
```

### Secrets Manager

```bash
aws secretsmanager get-secret-value \
  --secret-id afritalent-staging/app-secrets \
  --query SecretString --output text
```

Check specifically:

- `DATABASE_URL`
- `JWT_SECRET`
- `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`
- `REDIS_URL`

### ECR Images

```bash
aws ecr describe-images --repository-name afritalent-staging-backend
aws ecr describe-images --repository-name afritalent-staging-frontend
```

## Fast Troubleshooting Paths

### If The Backend Goes Down

1. Check App Runner status and operations
2. Check backend application logs
3. Check `DATABASE_URL` formatting in Secrets Manager
4. Verify `/health` and `/api/health`
5. If needed, rerun `update-service` against the last known good backend image tag

### If Prisma Fails At Startup

Look for:

- `P1013` invalid database URL
- auth or networking errors to RDS
- migration SQL errors

Known past failure:

- The staging password contained reserved URL characters
- Fix was to percent-encode the password inside `DATABASE_URL`
- Terraform module fix now lives in `infra/terraform/modules/secrets/main.tf`

### If Frontend Is Stuck Again

1. Verify the image locally first

```bash
docker run --rm -p 3001:3000 \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_API_URL=https://ed4nsj3sgv.us-east-1.awsapprunner.com \
  -e NEXT_PUBLIC_BACKEND_URL=https://ed4nsj3sgv.us-east-1.awsapprunner.com \
  260820061731.dkr.ecr.us-east-1.amazonaws.com/afritalent-staging-frontend:latest
```

2. Check App Runner application logs for:

- `Local: http://localhost:3000`
- `Network: http://0.0.0.0:3000`
- `Ready`

3. Check App Runner service `events`

4. Inspect the generated standalone server:

- `frontend/.next/standalone/server.js`
- it reads `process.env.HOSTNAME`
- if App Runner overrides `HOSTNAME`, the server may bind to the instance hostname instead of `0.0.0.0`

5. If App Runner is stuck in `OPERATION_IN_PROGRESS` for a long time:

- wait for the control plane to release the service state
- if deletion becomes allowed, delete the stuck service and recreate it
- if deletion is blocked, create a temporary recovery service with a short name

6. If App Runner moves from `OPERATION_IN_PROGRESS` to `CREATE_FAILED`:

- verify whether the generated `*.awsapprunner.com` hostname resolves in DNS
- pull the service deployment log stream and capture the final failure line
- pull the application log stream with `LANG=en_US.UTF-8` so Next.js unicode output renders correctly
- if the app reaches `Ready` but service creation still fails, treat it as an App Runner service-side deployment failure and recreate the service rather than assuming the container itself is broken

### If Uploads Fail From Frontend

Check bucket CORS:

```bash
aws s3api get-bucket-cors --bucket afritalent-staging-uploads
```

### If You Need To Update Backend Redirects To A Real Frontend URL

Update the backend App Runner service runtime env var:

- `FRONTEND_URL`

Then redeploy the backend service.

## DR And Recovery Notes

This is not production DR, but it is the operational recovery plan for the shared test environment.

### Shared Staging Recovery Priority

1. Restore backend health first
2. Restore a usable frontend hostname second
3. Reconfirm auth, jobs listing, and uploads
4. Only then push workflow changes that auto-deploy from `develop`

### Safe Rollback Principle

- Roll back by redeploying a previous ECR image tag
- Do not use `terraform destroy` as a rollback for staging
- Do not rotate DB passwords casually
- Do not overwrite live secrets with blank GitHub secrets

### If Terraform Wants To Rotate RDS Password Unexpectedly

Check `infra/terraform/main.tf`.

The `random_password.db` resource was aligned to the existing state specifically to avoid accidental DB password rotation during normal deploy work.

### If You Need To Resume And Ship The Workflow Changes

1. Re-read this file
2. Confirm frontend is actually reachable
3. Optionally update backend `FRONTEND_URL` to the chosen frontend App Runner hostname
4. Push local commit `fe70c56` to `develop`
5. Watch `.github/workflows/deploy-apprunner.yml`

## Source Of Truth Files

- `STAGING_RUNBOOK.md`
  Current staging environment state, handoff, ops, and recovery notes

- `AGENTS.md`
  Repository rules and pointer to this handoff file

- `infra/terraform/README.md`
  Terraform stack and infrastructure details

- `OPS_README.md`
  Generic application-level ops guidance such as logging and health

- `PROD_RUNBOOK.md`
  Production-only gates and recovery notes

## Maintenance Rule

Whenever live infrastructure, deploy status, recovery steps, or critical environment assumptions change, update this file in the same work session.
