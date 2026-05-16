# IaC Cutover Runbook — Wave 8 §9.1

**Purpose.** Move AfriTalent's production traffic from the legacy App Runner stack (and DigitalOcean DNS) to the new ECS Fargate + Aurora + CloudFront stack running in a dedicated `afritalent-prod` AWS account. Master prompt §9.1, lines 348-352.

**Scope.**
1. Stand up the new prod stack via `infra/terraform/accounts/afritalent-prod/`.
2. Migrate DNS for `afri-talent.com` from DigitalOcean → AWS Route 53 (in the new prod account).
3. Run dual-stack for ~48 hours.
4. Freeze writes for a 15-minute cutover window, sync data, switch DNS, end freeze.
5. Retire App Runner.

**Audience.** Founder (driving every AWS-side action). The Wave Lead session has authored every Terraform file and runbook step; nothing in this document requires Wave Lead to run an AWS command.

**Estimated wall-clock.** 4–6 days end-to-end, dominated by the 48-hour soak.

---

## 0. Pre-flight assumptions

- The new `afritalent-prod` AWS account has been created (Organizations → Add account; founder owns the root credentials + MFA setup).
- The founder has billing alerts active on the new account.
- The current production database is the App Runner stack's RDS instance in the OLD account (`260820061731`) OR has already been migrated to dev-new Aurora; record whichever is true at the start of §9.
- DigitalOcean still hosts the `afri-talent.com` zone.
- Current public URL: `https://d2j3ahmgbbdup1.cloudfront.net` (the dev-new CloudFront — `afri-talent.com` is NOT yet pointing at it).

---

## 1. Pre-cutover: state backend bootstrap (T-7 days)

The Terraform state bucket and lock table must exist in the new prod account **before** the first `terraform init` against this stack.

In the new prod account (use the root user or a freshly-bootstrapped IAM user with admin):

```bash
# Set once
PROD_ACCT="REPLACE-WITH-PROD-ACCOUNT-ID"

# State bucket
aws s3api create-bucket \
  --bucket "afritalent-${PROD_ACCT}-tfstate" \
  --region us-east-1
aws s3api put-bucket-versioning \
  --bucket "afritalent-${PROD_ACCT}-tfstate" \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption \
  --bucket "afritalent-${PROD_ACCT}-tfstate" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"},
      "BucketKeyEnabled": true
    }]
  }'
aws s3api put-public-access-block \
  --bucket "afritalent-${PROD_ACCT}-tfstate" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Lock table
aws dynamodb create-table \
  --table-name "afritalent-${PROD_ACCT}-tflocks" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

Verification:

```bash
aws s3api head-bucket --bucket "afritalent-${PROD_ACCT}-tfstate"
aws dynamodb describe-table --table-name "afritalent-${PROD_ACCT}-tflocks"
```

---

## 2. Pre-cutover: prod tfvars (T-6 days)

```bash
cd infra/terraform/accounts/afritalent-prod
cp terraform.tfvars.example terraform.tfvars
```

Replace placeholders in `terraform.tfvars`:

- `aws_account_id` → real prod account ID
- `tfstate_bucket_arn` → `arn:aws:s3:::afritalent-${PROD_ACCT}-tfstate`
- `tflock_table_arn` → `arn:aws:dynamodb:us-east-1:${PROD_ACCT}:table/afritalent-${PROD_ACCT}-tflocks`

Leave all other values at defaults unless there's a specific reason to change them (the defaults encode Wave 8 §9.3 spec values).

`terraform.tfvars` is gitignored — verify with `git check-ignore terraform.tfvars`.

---

## 3. Pre-cutover: first terraform apply (T-5 days)

From `infra/terraform/accounts/afritalent-prod/`:

```bash
# Init with the new account's backend
terraform init \
  -backend-config="bucket=afritalent-${PROD_ACCT}-tfstate" \
  -backend-config="dynamodb_table=afritalent-${PROD_ACCT}-tflocks" \
  -backend-config="key=afritalent-prod/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="encrypt=true"

# Plan — expect ~150-200 new resources
terraform plan -out tfplan

# Review the plan carefully. Then apply.
terraform apply tfplan
```

Apply takes ~15-25 minutes (Aurora cluster, ECS services, CloudFront propagation).

If `terraform apply` fails partway, **do not panic**. Re-run; Terraform is idempotent and will pick up where it left off. The most common partial-failure modes are:

- IAM eventual consistency (retry usually fixes it).
- ACM cert validation timing out (DNS propagation). If `create_route53_zone = true`, the validation records and zone are both in the same TF run; rarely fails. If `create_route53_zone = false`, validate by hand in the parent account and re-run.

---

## 4. Pre-cutover: SSM secrets prep (T-4 days)

The first `terraform apply` creates **empty SSM parameter shells** for every key in `module.ecs_fargate.backend_secrets` and `module.lambda_functions.*_secrets`. ECS tasks won't start successfully until each shell holds a real value.

For each parameter under `/afritalent/prod/`, set the live value:

```bash
# Example pattern (repeat for every secret)
aws ssm put-parameter \
  --name "/afritalent/prod/JWT_SECRET" \
  --value "$(openssl rand -base64 48)" \
  --type SecureString \
  --overwrite

aws ssm put-parameter \
  --name "/afritalent/prod/ANTHROPIC_API_KEY" \
  --value "sk-ant-..." \
  --type SecureString \
  --overwrite

# ... and so on for every key in main.tf backend_secrets
```

**Critical**: generate fresh values for `JWT_SECRET`, `SESSION_SECRET`, `ATS_TOKEN_ENCRYPTION_KEY`, `WEB_PUSH_VAPID_*`, `BOT_WEBHOOK_SECRET`. Do **not** reuse dev secrets. Use the **same** third-party keys (Stripe live keys, Anthropic, OpenAI, etc.) — those need to be production-class.

After every parameter has a value, restart the ECS services to pick them up:

```bash
aws ecs update-service --cluster afritalent-prod --service afritalent-prod-backend --force-new-deployment
aws ecs update-service --cluster afritalent-prod --service afritalent-prod-frontend --force-new-deployment
```

The blog SSM toggle stays at `"0"` until the editorial calendar is curated (Wave 6 γ2 — separate workstream).

---

## 5. Pre-cutover: GitHub Actions deploy wiring (T-3 days)

Once the new stack is healthy at its CloudFront URL, point CI at the new account:

In repo settings → **Variables** (not Secrets):

- `AWS_ACCOUNT_ID` → new prod account ID
- `OIDC_ROLE_NAME` → `afritalent-prod-github-deploy` (output `github_oidc_role_name`)
- `FRONTEND_API_URL` → `https://afri-talent.com` (final value — pre-cutover, this URL doesn't resolve to the new stack; we keep it this way intentionally so the post-cutover build picks up the right value automatically)

**Do not flip these until §9 cutover.** The dev-new stack still needs to be deployable until cutover is verified. Suggest creating new variables with a `_PROD_` infix and switching at cutover time:

- `AWS_ACCOUNT_ID_PROD`, `OIDC_ROLE_NAME_PROD` — populated now, ignored by deploy.yml
- `AWS_ACCOUNT_ID`, `OIDC_ROLE_NAME` — flipped at §9.5 only

---

## 6. Pre-cutover: smoke the new stack at the CloudFront URL (T-3 days)

```bash
# From any machine on the public internet:
NEW_CF=$(cd infra/terraform/accounts/afritalent-prod && terraform output -raw cloudfront_domain_name)
echo "New stack CloudFront: https://${NEW_CF}"

curl -fsS "https://${NEW_CF}/api/health"          # → 200
curl -fsS "https://${NEW_CF}/api/health/db"       # → 200
curl -fsS "https://${NEW_CF}/"                    # → 200 (HTML)
curl -fsS "https://${NEW_CF}/pricing"             # → 200
```

Manual browser smoke:

- [ ] Landing page renders
- [ ] `/pricing` shows regional amounts (Wave 6 §7.1 acceptance)
- [ ] Sign up a brand-new test candidate (NOT `candidate@example.com` — pick a fresh email)
- [ ] Email verification arrives via SES
- [ ] Sign in works
- [ ] Browse jobs (may be empty pre-launch)
- [ ] Cookie banner / privacy controls behave (Wave 10 §11.3 if implemented)
- [ ] Webhooks: send a Stripe test event to the new `webhook_stripe_url` output → expect 200

If any check fails, **halt cutover** and triage. The new stack must be green before §7.

---

## 7. Pre-cutover: verify backup + DR (T-2 days)

The Wave 8 §9.3 work shipped with the new stack. Verify:

```bash
# Aurora deletion protection
aws rds describe-db-clusters \
  --db-cluster-identifier afritalent-prod-aurora \
  --query 'DBClusters[0].DeletionProtection'   # → true

aws rds describe-db-clusters \
  --db-cluster-identifier afritalent-prod-aurora \
  --query 'DBClusters[0].BackupRetentionPeriod' # → 30

# Backup vaults
aws backup list-backup-vaults --region us-east-1   # primary vault present
aws backup list-backup-vaults --region us-west-2   # DR vault present

# Trigger an on-demand backup, watch it land in both regions
aws backup start-backup-job \
  --backup-vault-name "afritalent-prod-backup-vault" \
  --resource-arn "$(terraform -chdir=infra/terraform/accounts/afritalent-prod output -raw aurora_cluster_arn)" \
  --iam-role-arn "arn:aws:iam::${PROD_ACCT}:role/afritalent-prod-backup"
```

Wait ~30 min, then verify the recovery point exists in BOTH `us-east-1` AND `us-west-2` vaults via the AWS Backup console.

---

## 8. Pre-cutover: reduce DNS TTL at DigitalOcean (T-1 day)

At least **24 hours before** the cutover window, lower TTL on every `afri-talent.com` record at DigitalOcean to **60 seconds**. This bounds the worst-case rollback recovery time once cutover begins.

After 24 hours, every resolver worldwide is honoring 60s. You can revert post-cutover.

Records to change at DigitalOcean (or current DNS host):

- `@` (apex A or ALIAS record)
- `www` (A/CNAME record)
- Any other record pointing at the old App Runner URL

---

## 9. Cutover window (T) — 15 minutes

**Schedule.** Pick a low-traffic window (Sunday 03:00–04:00 UTC is conventional for AfriTalent's traffic mix — verify against CloudWatch traffic graphs).

**Communicate.** 24 hours before: notify any active users (banner, email) of a brief read-only window. At T-1 hour: status page entry (Wave 9 §10.2 deliverable).

### 9.1 Start write freeze (T+00:00)

Pick ONE strategy:

- **Preferred**: set backend env `MAINTENANCE_MODE=1` on the OLD App Runner stack. The backend's maintenance middleware returns 503 on every non-GET (writes blocked, reads still serve). Push the env change and force redeploy.
- **Fallback**: revoke the App Runner instance's DB write permissions at the IAM layer (attach a deny-policy on the role for `rds:Modify*`, `s3:Put*`).

Verify writes blocked: try registering a user on the old URL → expect 503.

### 9.2 Final data sync (T+02:00)

If the new Aurora cluster has been periodically syncing from the old DB (logical replication or scheduled dumps), trigger the **final delta sync** now. If not, take the **last snapshot from the old DB** and restore it into the new Aurora as the source of truth — this is the safest pattern for a one-shot migration.

```bash
# OLD account
aws rds create-db-cluster-snapshot \
  --db-cluster-identifier afritalent-old-cluster \
  --db-cluster-snapshot-identifier afritalent-final-cutover-snap

# Share with new account, restore into afritalent-prod-aurora
# (full procedure documented in docs/runbooks/db-restore.md §"Cross-account snapshot share")
```

Verify row counts match between old and new (sample a few high-volume tables: User, Job, Application).

### 9.3 DNS cutover (T+10:00)

Two paths — pick ONE based on where the registrar lives:

**Path A** (cleaner; recommended): change the **nameservers at the registrar** to point at the new Route 53 zone's name servers.

```bash
# Get the new zone's name servers
cd infra/terraform/accounts/afritalent-prod
terraform output route53_name_servers
# → ["ns-XXX.awsdns-XX.com", "ns-YYY.awsdns-YY.net", ...]
```

At the registrar (DigitalOcean or wherever `afri-talent.com` was bought), replace nameservers with those four. Propagation: 5-15 min (delegation has its own TTL set at the registry).

**Path B** (faster but less clean): at DigitalOcean DNS, change the `@` and `www` A records to point at the new CloudFront distribution (an ALIAS record if DigitalOcean supports it, else a CNAME for `www` and follow DigitalOcean's apex-CNAME workaround).

Path A is the long-term right answer; Path B leaves DNS management split across providers.

### 9.4 Verify (T+12:00)

From an internet-connected machine:

```bash
dig +short afri-talent.com           # → expect CloudFront IPs
dig +short www.afri-talent.com       # → expect CloudFront IPs
curl -fsSI https://afri-talent.com   # → 200, CF-Cache headers present
curl -fsSI https://www.afri-talent.com
```

In browser:

- Open `https://afri-talent.com` — should hit the new stack.
- Register a fresh test user — verify the new user lands in the NEW Aurora (via `psql`).
- Sign in as the test user, browse a job page.
- Trigger a billing test (Stripe test card) — verify the webhook hits the new `webhook_stripe_url` (Lambda Function URL in the new account).

If any verification fails, **immediately roll back** (§10).

### 9.5 End write freeze (T+15:00)

Remove `MAINTENANCE_MODE` from the OLD stack (or restore IAM write permissions). Status page: "Cutover complete; service restored."

Set GitHub repo variables:

- `AWS_ACCOUNT_ID` → new prod account ID
- `OIDC_ROLE_NAME` → `afritalent-prod-github-deploy`

Now the deploy workflow targets the new account on the next push to main.

---

## 10. Rollback procedure

### 10.1 Before write freeze ends (T+00:00 to T+15:00)

If verification at §9.4 fails:

```bash
# Revert DNS at the registrar (Path A): restore the DigitalOcean nameservers.
# OR at DigitalOcean DNS (Path B): restore the old A records pointing at App Runner.
```

With the 60s TTL set in §8, recovery happens in ~1-2 minutes. The OLD stack is still running — no data has been written to the new stack yet (write freeze prevented it).

### 10.2 After write freeze ends (post-T+15:00)

Once writes have happened on the new stack, rolling back is destructive — DNS reversal sends users back to the OLD DB, but the writes from the new DB are stranded.

Options:

- **Roll forward** (preferred): fix the issue on the new stack. Most issues are config (env, SSM, IAM). The new stack is the canonical state.
- **Roll back with data preservation**: pause writes on the new stack (re-enable MAINTENANCE_MODE), dump new-DB delta since cutover, restore that delta into the OLD DB, then revert DNS. Time-consuming but possible.

Decision criterion: if the issue is contained (one feature broken, others fine) and customer impact is acceptable, roll forward. Only roll back if a critical feature is wholly broken AND the data delta is small/replayable.

---

## 11. Post-cutover (T+1 hour to T+1 week)

### 11.1 Monitor (T+1h to T+24h)

- CloudWatch alarms (Wave 8 §9.3 + Wave 9 §10.2) — watch for 2 hours minimum
- Sentry — watch for new error patterns (especially 500s)
- SES — bounce rate; should be <1% for transactional mail
- ECS service health — both services Running with Desired count
- Aurora — connection count, CPU, replica lag if any

### 11.2 SES domain verification (T+1d)

In the new prod account, re-verify the `afri-talent.com` sender domain. DKIM records need to be in the new Route 53 zone (or pre-published if domain DNS was already migrated):

```bash
aws ses verify-domain-identity --domain afri-talent.com
aws ses verify-domain-dkim --domain afri-talent.com
# Add the 3 DKIM CNAMEs to Route 53 (Terraform-managed; see modules/ses-dkim if it exists)
```

### 11.3 App Runner retirement (T+48h)

After 48 hours of green on the new stack (no rollback indicators, alarms quiet, error rates normal):

```bash
# In the OLD account
# 1. Disable any cron / event sources still hitting App Runner
# 2. Take a final RDS snapshot of the old DB (long-term archive)
# 3. Destroy the legacy stack
cd infra/terraform   # the legacy root path
terraform destroy   # OR delete via AWS console
```

The OLD account `260820061731` still hosts unrelated student/demo workloads (per project memory) — **do NOT** destroy the account; only destroy the AfriTalent resources.

### 11.4 Update STAGING_RUNBOOK.md (T+48h)

- Primary URL: `https://afri-talent.com` (was CloudFront URL)
- AWS account: new prod account ID (was 108188564905 / dev-new)
- Cluster name: `afritalent-prod` (was `afritalent-dev`)
- ALB name: from `terraform output alb_dns_name`
- Add a "Cutover history" section dated this cutover

### 11.5 Restore default DNS TTL (T+1 week)

Once you have one week of green: at the registrar (or in Route 53), raise TTL back to a normal value (300s or 3600s) to reduce DNS query cost and improve cache hit rate.

### 11.6 Wave 8 §9.4 acceptance verification (T+1 week)

```bash
# Stack diff is clean
cd infra/terraform/accounts/afritalent-prod
terraform plan
# → "No changes. Your infrastructure matches the configuration."

# App Runner stack is gone
cd infra/terraform  # legacy root
terraform state list   # → empty OR clear "0 resources"

# DR drill scheduled
grep "Q3 2026" docs/runbooks/db-restore.md   # → confirms the drill date
```

§9.4 acceptance met. Wave 8 closed.

---

## 12. Quick-reference appendix

### 12.1 Critical accounts + regions

- New prod account ID: `<PROD_ACCT>` (filled in tfvars)
- Primary region: `us-east-1`
- DR region: `us-west-2`
- Old account (legacy + student workloads, do NOT account-wide cleanup): `260820061731`
- dev-new account (post-cutover: stays as dev environment): `108188564905`

### 12.2 Key Terraform outputs after first apply

```bash
cd infra/terraform/accounts/afritalent-prod
terraform output cloudfront_domain_name      # smoke-test target pre-cutover
terraform output primary_url                 # final canonical URL
terraform output route53_name_servers        # NS to set at registrar
terraform output webhook_stripe_url          # paste into Stripe dashboard
terraform output webhook_flutterwave_url     # paste into Flutterwave dashboard
terraform output github_oidc_role_arn        # CI variable value
terraform output backup_primary_vault_name   # primary backups land here
terraform output backup_dr_vault_name        # cross-region copies land here
```

### 12.3 Smoke test commands

See §6 (pre-cutover CloudFront-URL smoke) and §9.4 (post-cutover apex smoke).

### 12.4 Related runbooks + docs

- `docs/runbooks/db-restore.md` — Aurora PITR + cross-region snapshot restore + quarterly DR drill (Wave 8 §9.3).
- `STAGING_RUNBOOK.md` — current live-state of the environment.
- `infra/terraform/accounts/afritalent-prod/main.tf` — module wiring for this stack.
- Master prompt `~/Desktop/AfriTalent_Public_Launch_Master_Prompt.md` §9 — original Wave 8 spec.
