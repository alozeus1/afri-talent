# AfriTalent Shared Staging Handoff And Runbook

Last updated: March 26, 2026 (America/Chicago)

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
- Backend status at handoff: healthy and returning `200` on `/health` and `/api/health`

- Frontend managed service name: `afritalent-staging-appr-frontend-managed`
- Frontend managed service ARN: `arn:aws:apprunner:us-east-1:260820061731:service/afritalent-staging-appr-frontend-managed/d4d78ed015ee4faa88d9c647d0fdb422`
- Frontend managed URL: `https://zkpptays2x.us-east-1.awsapprunner.com`
- Frontend managed status at handoff: stuck in `OPERATION_IN_PROGRESS`

- Frontend recovery service name: `afritalent-stg-fe-recov`
- Frontend recovery service ARN: `arn:aws:apprunner:us-east-1:260820061731:service/afritalent-stg-fe-recov/def7b662c4a34c48ac33b171b2a7c02d`
- Frontend recovery URL: `https://fnpbwtphjp.us-east-1.awsapprunner.com`
- Frontend recovery status at handoff: also stuck in `OPERATION_IN_PROGRESS`

## Last Known Deployment State

The backend deployment path was repaired and is working.

Completed:

- Staging GitHub role and repo variables were aligned to staging
- Backend image was built and pushed successfully
- Backend App Runner service was updated to image tag `1910dfc-live`
- Prisma migrations now run at container startup through `backend/docker/entrypoint.sh`
- Staging `DATABASE_URL` in Secrets Manager was repaired so the password is URL-encoded
- Backend startup logs confirmed migrations applied and health checks succeeded

Open:

- Frontend image was built and pushed successfully
- Frontend container logs show Next.js starts successfully
- App Runner does not finish either frontend service create operation
- Public frontend hostnames still do not serve the app at handoff time

## Last Known Image Digests

- Backend tag: `1910dfc-live`
- Backend digest: `sha256:323ab65dc4acc9279a05bbdcb1ad1a2f6727c4458ee12e5554d6643b3c02b7da`

- Frontend tag: `fe70c56-live`
- Frontend digest: `sha256:9101760d5a964411c93b51bdf0b7ea672007969457c6fd22d4a377d92a3f7866`

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

1. Backend `FRONTEND_URL` still points at `https://staging.afri-talent.com`
   The backend is working, but password reset links and any frontend redirect behavior should be updated after a stable frontend URL is chosen.

2. Frontend App Runner service creation is hanging in AWS
   Both the normal HTTP-health-check service and a TCP-health-check recovery service start the Next.js app successfully, but App Runner does not complete the create operation.

3. Uploads bucket CORS was manually widened for App Runner testing
   Current allowed origins include:
   - `https://staging.afri-talent.com`
   - `https://zkpptays2x.us-east-1.awsapprunner.com`
   - `https://fnpbwtphjp.us-east-1.awsapprunner.com`

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

2. Check App Runner application logs for `Ready`

3. Check App Runner service `events`

4. If App Runner is stuck in `OPERATION_IN_PROGRESS` for a long time:

- wait for the control plane to release the service state
- if deletion becomes allowed, delete the stuck service and recreate it
- if deletion is blocked, create a temporary recovery service with a short name

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
