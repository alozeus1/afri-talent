# AfriTalent Shared Staging Handoff And Runbook

Last updated: April 8, 2026 12:12 AM (America/Chicago)

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

Update on April 7, 2026:

- Commit `9fa48da` (`Fix Synthetics canary execution role`) was pushed to `develop` to repair the failing shared staging CI/CD pipeline.
- GitHub Actions run `24104076134` is the validating deploy run for this fix.
- Root cause of the prior pipeline failure in run `24102816072`:
  - `Finalize Infrastructure` failed while creating `aws_synthetics_canary.public_journey[0]`
  - AWS returned `CREATE_FAILED: The role defined for the function cannot be assumed by Lambda`
  - the execution role in `infra/terraform/monitoring-apprunner.tf` only had a minimal Lambda basic setup and an incomplete inline policy for CloudWatch Synthetics
- Fix applied:
  - expanded the Synthetics execution role policy to match AWS-documented canary requirements for S3 artifact access, CloudWatch Logs, X-Ray, and `cloudwatch:PutMetricData`
  - added explicit Terraform dependency ordering so the canary waits on the execution role policy setup
- Validation already confirmed in AWS during run `24104076134`:
  - CloudWatch Synthetics canary `afritalent-staging-public-journey` is now `RUNNING`
  - backend health is still `ok` at `https://ed4nsj3sgv.us-east-1.awsapprunner.com/health`
  - frontend still responds from `https://3mwn2b4e5t.us-east-1.awsapprunner.com` with the expected `307` redirect to `/en`
- At this handoff moment, the later App Runner `START_DEPLOYMENT` operations triggered by run `24104076134` are still `IN_PROGRESS` for both backend and frontend, so check the run and App Runner operation status before assuming the deploy leg is fully complete.

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

- Stripe and Flutterwave billing code paths are now implemented locally, but the provider secrets and catalogs still need to be populated in GitHub repo secrets and then hydrated into `afritalent-staging/app-secrets`
- The Stripe credentials supplied during the April 8 billing setup are live-mode credentials; do not commit them to the repo, and do not wire them into shared staging casually unless the team explicitly accepts live-mode checkout against a non-prod environment
- Flutterwave account `Godwill Ocheme` is still in `TEST MODE` with account activation incomplete, so live Flutterwave charging is still blocked by provider KYC/activation
- A full local `terraform plan` from the `admin` IAM user is still blocked by an explicit deny on `ec2:DescribeInstances` from `arn:aws:iam::260820061731:policy/demo-policy`
- Full Terraform apply is still pending for monitoring, alerting, and other non-App-Runner resources outside the targeted repairs above
- A semantic retrieval foundation now exists in the backend codebase, but it has not been deployed or indexed in staging yet

## Billing Integration Snapshot

Updated on April 8, 2026:

- The backend and frontend now support provider-aware checkout routing:
  - Nigeria defaults to Flutterwave
  - all other countries default to Stripe
  - Google Pay rides on eligible Stripe Checkout flows automatically
  - PayPal is intentionally deferred
- Terraform and the App Runner deploy workflow were extended so the following runtime secrets can be hydrated into Secrets Manager without manual container edits:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_CATALOG_JSON`
  - `FLUTTERWAVE_PUBLIC_KEY`
  - `FLUTTERWAVE_SECRET_KEY`
  - `FLUTTERWAVE_SECRET_HASH`
  - `FLUTTERWAVE_PLAN_CATALOG_JSON`
  - `FLUTTERWAVE_PAYMENT_OPTIONS`
- Note: some external notes may call the Flutterwave webhook verifier `FLW_WEBHOOK_HASH`; the AfriTalent codebase expects `FLUTTERWAVE_SECRET_HASH`

### Stripe State

- Stripe account id: `acct_1PnvMGIVndXzaBq6`
- Webhook endpoint id: `we_1TJo78IVndXzaBq61TwP9Xma`
- Stripe webhook URL is confirmed as:
  - `https://ed4nsj3sgv.us-east-1.awsapprunner.com/api/webhooks/stripe`
- Required webhook events are confirmed:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
- Google Pay status:
  - enabled through Stripe payment method configurations and available automatically to eligible Checkout users
- PayPal status:
  - native beta only
  - limited to EU/UK
  - zero Africa coverage
  - do not add PayPal in the same release as Stripe + Flutterwave

Stripe non-secret catalog payload for `STRIPE_PRICE_CATALOG_JSON`:

```json
{
  "BASIC:AFRICA:MONTHLY:USD": "price_1TJmHyIVndXzaBq6zL81AHtU",
  "BASIC:AFRICA:YEARLY:USD": "price_1TJmHzIVndXzaBq6clpeEsa9",
  "BASIC:EUROPE:MONTHLY:EUR": "price_1TJmI0IVndXzaBq63NLldsi1",
  "BASIC:EUROPE:YEARLY:EUR": "price_1TJmI1IVndXzaBq6QdI2PKH1",
  "BASIC:ROW:MONTHLY:USD": "price_1TJmIIIVndXzaBq6pRSPhlmH",
  "BASIC:ROW:YEARLY:USD": "price_1TJmIJIVndXzaBq6jNqLUYMr",
  "PROFESSIONAL:AFRICA:MONTHLY:USD": "price_1TJmI2IVndXzaBq6sBL5YZni",
  "PROFESSIONAL:AFRICA:YEARLY:USD": "price_1TJmI3IVndXzaBq6aBiKSL2E",
  "PROFESSIONAL:EUROPE:MONTHLY:EUR": "price_1TJmI4IVndXzaBq6Uncr7417",
  "PROFESSIONAL:EUROPE:YEARLY:EUR": "price_1TJmI5IVndXzaBq6jvXoJveq",
  "PROFESSIONAL:ROW:MONTHLY:USD": "price_1TJmIXIVndXzaBq6Rj5oyRai",
  "PROFESSIONAL:ROW:YEARLY:USD": "price_1TJmIZIVndXzaBq6FpV54E7o",
  "EMPLOYER_BASIC:AFRICA:MONTHLY:USD": "price_1TJmIKIVndXzaBq6zszokqoy",
  "EMPLOYER_BASIC:AFRICA:YEARLY:USD": "price_1TJmILIVndXzaBq6cFFXkR0J",
  "EMPLOYER_BASIC:EUROPE:MONTHLY:EUR": "price_1TJmIMIVndXzaBq6WpAvsKoK",
  "EMPLOYER_BASIC:EUROPE:YEARLY:EUR": "price_1TJmINIVndXzaBq6vSNXgEN6",
  "EMPLOYER_BASIC:ROW:MONTHLY:USD": "price_1TJmIOIVndXzaBq66VbAF1Ri",
  "EMPLOYER_BASIC:ROW:YEARLY:USD": "price_1TJmIPIVndXzaBq6PVcP65gg",
  "EMPLOYER_PREMIUM:AFRICA:MONTHLY:USD": "price_1TJmIZIVndXzaBq6fqYtIgE7",
  "EMPLOYER_PREMIUM:AFRICA:YEARLY:USD": "price_1TJmIaIVndXzaBq6FVcQtwFV",
  "EMPLOYER_PREMIUM:EUROPE:MONTHLY:EUR": "price_1TJmIbIVndXzaBq6dWDK66P8",
  "EMPLOYER_PREMIUM:EUROPE:YEARLY:EUR": "price_1TJmIcIVndXzaBq6rEaA4Kjm",
  "EMPLOYER_PREMIUM:ROW:MONTHLY:USD": "price_1TJmIdIVndXzaBq6QPFKFwSI",
  "EMPLOYER_PREMIUM:ROW:YEARLY:USD": "price_1TJmIeIVndXzaBq6O8qd2V27"
}
```

### Flutterwave State

- Flutterwave merchant: `Godwill Ocheme`
- Current mode:
  - `TEST MODE`
- Live charging blocker:
  - account activation / KYC incomplete
- Test webhook was configured directly in the dashboard to:
  - `https://ed4nsj3sgv.us-east-1.awsapprunner.com/api/webhooks/flutterwave`
- Test webhook preferences enabled:
  - retries on
  - v3 webhooks on
  - resend from dashboard on

Flutterwave non-secret catalog payload for `FLUTTERWAVE_PLAN_CATALOG_JSON`:

```json
{
  "BASIC:AFRICA:MONTHLY:NGN": "231469",
  "BASIC:AFRICA:YEARLY:NGN": "231470",
  "PROFESSIONAL:AFRICA:MONTHLY:NGN": "231471",
  "PROFESSIONAL:AFRICA:YEARLY:NGN": "231472",
  "EMPLOYER_BASIC:AFRICA:MONTHLY:NGN": "231473",
  "EMPLOYER_BASIC:AFRICA:YEARLY:NGN": "231474",
  "EMPLOYER_PREMIUM:AFRICA:MONTHLY:NGN": "231475",
  "EMPLOYER_PREMIUM:AFRICA:YEARLY:NGN": "231476"
}
```

Recommended default for `FLUTTERWAVE_PAYMENT_OPTIONS`:

```text
card,banktransfer,ussd
```

### Safe Next Step

1. Populate the provider secrets in GitHub repo secrets, not in the repo
2. Let the deploy workflow hydrate them into `afritalent-staging/app-secrets`
3. Run a staging deploy only if the team accepts live Stripe against staging, otherwise use Stripe test credentials for staging first
4. Do not treat Flutterwave as live-ready until the merchant account exits test mode

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

6. Billing is now a controlled release item, not a code gap
   - Stripe account setup is complete enough for integration, but secrets must still be populated out of band
   - Flutterwave recurring plan IDs exist in test mode, but live charging is blocked by provider activation
   - staging should not be assumed safe for live Stripe keys unless the user explicitly approves that risk

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
