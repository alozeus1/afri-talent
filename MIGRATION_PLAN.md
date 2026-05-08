# AfriTalent Cross-Account Migration Plan (v2)

**Status:** Draft — awaiting user approval and new-account readiness
**Authors:** Claude (devops-architect skill, AWS MCP-verified)
**Last updated:** 2026-05-08
**Target execution window:** ~2 hours from go-ahead
**Source of truth:** This document. After each phase, append actual outcome + timestamps under "Execution Log".

---

## 1. Goals and Constraints

### Goals
1. Migrate AfriTalent off App Runner (sunset to new customers as of 2026-04-30) into a new AWS account.
2. Reduce monthly run cost vs both the current setup and the original migration draft.
3. Adopt serverless **where it does not affect user-facing latency**.
4. Establish enterprise-grade governance, security, and observability from day one.
5. Be ready to execute the live cutover in **~2 hours** once the new account is provisioned.

### User constraints (locked in)
- **UX must not regress.** Synchronous request path stays on warm compute (no cold starts on user-visible flows).
- **Drop NAT Gateway.** Use VPC endpoints.
- **Test-phase product.** Downtime acceptable. Old account teardown not preserved.
- **Two-hour execution window.** All slow work must happen before go-ahead.

### Non-goals (this migration)
- Multi-region deployment (single region: `us-east-1`).
- Aurora DSQL adoption (worth piloting later; not on critical path).
- Migrating frontend hosting off AWS (Vercel/Cloudflare considered, deferred).
- Production-grade SOC 2 readiness (deferred to a later phase).

---

## 2. Target Architecture

### Compute split — "warm path on Fargate, async on Lambda"

| Workload | Runtime | Why |
|---|---|---|
| Next.js 16 SSR (frontend) | **ECS Fargate** (mixed On-Demand + Spot) | UX-critical; no cold starts |
| Express 5 API (sync requests) | **ECS Fargate** (mixed On-Demand + Spot) | UX-critical; no cold starts |
| AI orchestrator (6-agent flow) | **AWS Step Functions + Lambda** | Bursty, long-ish, multi-step; idle 95% of the time |
| Stripe / Flutterwave webhooks | **Lambda + Function URL** | Bursty; pay-per-event |
| Scheduled jobs (cleanup, digests) | **EventBridge Scheduler → Lambda** | $0 idle; cron-shaped |
| S3-triggered processing (resume parsing, file conversions) | **S3 Event Notification → Lambda** | Naturally event-driven |

### Data
- **Aurora Serverless v2 PostgreSQL**, multi-AZ, `MinCapacity = 0` (auto-pause), `MaxCapacity = 4` ACU initially. ~15s cold-resume on first connection — acceptable for a test-phase product. Promote `MinCapacity = 0.5` when traffic is steady.
- **RDS Proxy** in front of Aurora (multiplexes Express + Lambda connections; reduces ACU thrash; keeps Lambda safe under load).
- Aurora **I/O-Optimized** cluster setting (no per-I/O charges; ~40% saving for I/O-heavy workloads — this app is one).

### Network
- **Single VPC, 3 AZs.** Public subnets (ALB only), private subnets (Fargate, Lambda, Aurora, RDS Proxy), isolated subnets (DB only — no route to internet at all).
- **No NAT Gateway.** All AWS-service egress via VPC endpoints.
- **VPC Endpoints provisioned (Terraform):**
  - Gateway endpoints (free): `S3`, `DynamoDB`
  - Interface endpoints: `ECR API`, `ECR DKR`, `CloudWatch Logs`, `SSM`, `SSM Messages`, `EC2 Messages`, `Secrets Manager` (used by RDS Proxy), `STS`, `KMS`, `SQS`, `Step Functions`, `EventBridge`
- **Anthropic / Stripe / Flutterwave** are public-internet calls. Two options:
  - (a) Egress via PrivateLink partner endpoints where the SaaS supports it (Stripe does not currently).
  - (b) Single small NAT instance (t4g.nano with `nat` AMI, ~$3/mo) for these specific egress paths. **Recommended.** Drop the AWS NAT Gateway; keep one tiny EC2 NAT instance for SaaS egress only.

### Edge / Security
- **CloudFront** in front of everything user-facing.
  - Price Class **200** (NA + EU + Asia + ME + Africa) — matches your user base.
  - Origins: ALB (dynamic), S3 (static assets if/when split out).
  - Custom cache behaviors: `/api/*` → no-cache + forward all headers; `/_next/static/*` → long TTL.
- **AWS WAFv2** attached to CloudFront with managed rules:
  - `AWSManagedRulesCommonRuleSet`
  - `AWSManagedRulesKnownBadInputsRuleSet`
  - `AWSManagedRulesAmazonIpReputationList`
  - Custom rate-limit rule (2,000 req / 5min per IP)

### Account & Governance
- **AWS Organizations** wrapping the new account. Old account joined as member during transition (so consolidated billing covers both during the bake-out window).
- **GuardDuty, Security Hub (FSBP + CIS), AWS Config** enabled day 1.
- **CloudTrail** org-trail to a dedicated S3 bucket in the new account (until a true log-archive account is added later).
- **IAM Identity Center** for human access (vs root + IAM users).
- **Cost allocation tags** enforced via Terraform `default_tags`: `Environment`, `Project=afritalent`, `Application`, `Owner`, `CostCenter`, `ManagedBy=terraform`.
- **AWS Budgets** with alerts at 50% / 80% / 100% of monthly cap.

### Observability
- **CloudWatch Logs** with 30-day retention (vs default never-expire — major cost trap).
- **CloudWatch Container Insights** on the ECS cluster.
- **AWS Distro for OpenTelemetry (ADOT)** sidecar on Fargate tasks for tracing.
- **AI orchestrator runs** persisted to existing `AiRun` table (already done in `backend/src/lib/ai/persistence.ts`); Step Functions execution history covers the rest.

---

## 3. Cost Projection

| Item | On-demand | After optimizations | Notes |
|---|---|---|---|
| Fargate (2 tasks × 1 vCPU + 2GB, 24/7) | ~$60/mo | ~$25/mo | Spot 70% mix |
| Aurora Serverless v2 | ~$43/mo at 0.5 ACU | ~$5–15/mo | `MinCapacity=0` auto-pause |
| ALB | $20/mo | $20/mo | unavoidable |
| CloudFront (low traffic) | ~$5/mo | ~$5/mo | Class 200 |
| NAT Gateway | $32+/mo | **$0** (replaced by t4g.nano NAT instance ~$3/mo) | VPC endpoints + tiny instance |
| RDS Proxy | $15/mo | $15/mo | worth it |
| Lambda + Step Functions (orchestrator) | $0 idle | $1–10/mo at low traffic | pay per use |
| WAF | $5/mo + $1/rule | ~$10/mo | ~5 managed rules |
| GuardDuty + Security Hub + Config | ~$5–15/mo | ~$5–15/mo | usage-based |
| **Total** | **~$200/mo** | **~$90–125/mo** | |

Compute Savings Plan (1-year, no upfront) on the always-on Fargate baseline after 30 days steady-state cuts another ~30%.

---

## 4. Pre-Flight (Phase 0) — Done BEFORE go-ahead

This is the work that lets the live execution fit in 2 hours. None of it requires the new account.

### 0.1 Terraform module set
- Migrate `infra/terraform/` to a clean module layout:
  ```
  infra/terraform/
    bootstrap/                    # state bucket + DynamoDB lock (manual one-shot)
    accounts/dev/                 # the new account's root config
    modules/
      vpc/                        # VPC + endpoints, no NAT GW
      ecs-fargate/                # cluster + service + taskdef + Spot capacity provider
      alb/                        # ALB + target groups + listeners
      cloudfront-waf/             # CF dist + WAFv2
      aurora-serverless/          # cluster + RDS Proxy + secrets + auto-pause config
      ecr/                        # repositories + lifecycle policies
      lambda-orchestrator/        # Lambda functions + Step Functions state machine
      lambda-webhooks/            # webhook handlers + Function URLs
      observability/              # log groups, retention, dashboards
      security-baseline/          # GuardDuty, Security Hub, Config, CloudTrail
      iam-oidc-github/            # GitHub Actions OIDC role
  ```
- All resources tagged via provider `default_tags`.
- All variables typed with `validation` blocks.
- All `required_providers` and `required_version` pinned.

### 0.2 Application changes
> [!WARNING]
> **CRITICAL RECOMMENDATION:** The work listed below constitutes major application re-architecture, not just devops prep. To ensure a smooth migration, **decouple these application changes from the infrastructure migration.** Either perform a pure "lift and shift" of the existing Express app from App Runner to Fargate first (and migrate to Lambda in a subsequent phase), or treat these changes as distinct engineering epics that must be merged and fully vetted in staging before scheduling the migration.

- **Extract orchestrator from Express into Lambda-deployable shape.**
  - New entry: `backend/src/lambda/orchestrator-step.ts` — single-step Lambda handler, one per agent, callable from Step Functions.
  - Existing `backend/src/lib/ai/orchestrator/` reused unchanged (it's already modular).
  - State machine definition: ASL JSON in `backend/infra/state-machines/orchestrator.asl.json`.
- **Webhook handlers split into Lambda entry points:**
  - `backend/src/lambda/webhook-stripe.ts`
  - `backend/src/lambda/webhook-flutterwave.ts`
  - Existing handlers reused; entry adapts API Gateway/Function URL event → existing service call.
- **Express container unchanged.** Continues to handle the sync API.
- **Dockerfile reviewed:** multi-stage build, `node:slim` or distroless base, non-root user, healthcheck.

### 0.3 CI/CD
> [!WARNING]
> **CRITICAL RECOMMENDATION:** Pushing to `develop` to deploy to the new account is risky if `develop` is currently tied to the live old environment. Ensure `.github/workflows/deploy-dev.yml` uses a distinct branch (e.g., `migration-test`) or a parameterized manual workflow trigger (`workflow_dispatch`) so you don't cross-contaminate the live App Runner environment during testing.

- `.github/workflows/deploy-dev.yml` rewritten to:
  - Read `AWS_ACCOUNT_ID` from `vars` (not `secrets` per memory note about job-level `if`).
  - OIDC into the new account's `GitHubActionsDeployRole`.
  - Build + push two images (frontend, backend) to new ECR.
  - Build + zip + deploy Lambda functions.
  - Trigger ECS service rolling deploy.
  - Run smoke test against ALB DNS.
- Pre-merge: `terraform.yml` workflow validates + plans against new state.

### 0.4 Data migration prep
> [!WARNING]
> **CRITICAL RECOMMENDATION:** The migration scripts referenced below (`dump-old-rds.sh`, `restore-new-aurora.sh`, etc.) do not currently exist in the repository. They must be written, parameterized, and tested against a dummy database well before the execution window.

- `scripts/migrate/dump-old-rds.sh`: `pg_dump -Fc` to local file, includes schema + data.
- `scripts/migrate/restore-new-aurora.sh`: `pg_restore --no-owner --no-acl` against Aurora endpoint via RDS Proxy.
- Test the dump+restore against a throwaway RDS instance to time it (so we know the actual minutes).
- Document the secret list to be injected into SSM (one-page checklist).

### 0.5 DNS prep
- Lower TTL on the prod A/CNAME records to **60 seconds** at least 24 hours before cutover.
- Pre-create the new Route 53 hosted zone in the new account.
- Decide path: keep registration in old account, just delegate NS to new zone (recommended — see §10).

### 0.6 Secrets inventory
Documented list (filled in pre-flight, populated post-Phase 1):
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_PUBLIC_KEY`
- `ANTHROPIC_API_KEY`
- `DATABASE_URL` (auto-populated post-Aurora provisioning)
- `JWT_SECRET`, `SESSION_SECRET`
- (extend in pre-flight)

### 0.7 Synthetic canary
Cheap CloudWatch Synthetics canary (or local script triggered every 30s) hitting:
- `GET /api/health`
- `POST /api/auth/login` (test creds)
- `POST /api/orchestrator/run` (MOCK_AI=1)

Used during validation phase to confirm new env is live before flipping DNS.

**Phase 0 Definition of Done:** Terraform plan against the new account is clean (zero errors); CI workflow lint passes; orchestrator+webhooks run in `MOCK_AI=1` locally as Lambda invocations; dump/restore timing is known; DNS TTL is 60s.

---

## 5. Execution Phases (post go-ahead)

Each phase has a target time, an exact command sequence, and a clear pass/fail signal.

### Phase 1 — Account Bootstrap (target: 15 min)

**Pre-condition:** New AWS account exists; root account access available; user has confirmed account ID.

1.1 Bootstrap Terraform state (one-time, manual `aws` CLI as root):
```
# Run from local with NEW account creds
aws s3api create-bucket --bucket afritalent-NEWACCT-tfstate --region us-east-1
aws s3api put-bucket-versioning --bucket afritalent-NEWACCT-tfstate --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket afritalent-NEWACCT-tfstate --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"}}]}'
aws s3api put-public-access-block --bucket afritalent-NEWACCT-tfstate --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
aws dynamodb create-table --table-name afritalent-NEWACCT-tflocks --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST
```

1.2 Apply security baseline + IAM Identity Center + OIDC role:
```
cd infra/terraform/accounts/dev
terraform init -backend-config="bucket=afritalent-NEWACCT-tfstate" -backend-config="dynamodb_table=afritalent-NEWACCT-tflocks"
terraform apply -target=module.security_baseline -target=module.iam_oidc_github
```

**Pass signal:** GuardDuty enabled, Security Hub enabled with FSBP+CIS, OIDC role ARN visible in Terraform output.

### Phase 2 — Infrastructure Provisioning (target: 30 min)

2.1 Apply VPC + endpoints (no NAT Gateway):
```
terraform apply -target=module.vpc
```

2.2 Apply data plane (Aurora + RDS Proxy):
```
terraform apply -target=module.aurora_serverless
```
This creates the cluster (3–5 min), RDS Proxy, and the SSM parameter shells. `DATABASE_URL` is auto-written to SSM by Terraform.

2.3 Apply compute plane (ECR, ECS, ALB, Lambda, Step Functions):
```
terraform apply -target=module.ecr -target=module.ecs_fargate -target=module.alb -target=module.lambda_orchestrator -target=module.lambda_webhooks
```
Note: ECS service starts with `desired_count = 0` until images are pushed in Phase 3.

2.4 Apply edge + observability:
```
terraform apply
```
This applies CloudFront + WAF + dashboards + log groups (everything not yet applied).

**Pass signal:** All Terraform applies succeed; ALB DNS resolvable; CloudFront distribution `Deployed`; Aurora cluster `available`.

### Phase 3 — Secrets + Image Deploy (target: 20 min)

3.1 Inject SaaS secrets into SSM (manual, ~5 min):
```
# For each secret in §0.6, run:
aws ssm put-parameter --name "/afritalent/dev/STRIPE_SECRET_KEY" --type SecureString --value "..." --overwrite
# (script: scripts/migrate/inject-secrets.sh prompts interactively)
```

3.2 Trigger CI deploy:
```
# From local, force-push to develop (or click Run Workflow in GH Actions UI)
git push origin develop
```
GitHub Actions:
- Builds frontend + backend images
- Pushes to new ECR
- Deploys Lambda functions (orchestrator steps + webhooks)
- Updates ECS service `desired_count` to 2; waits for steady state

3.3 Verify rollout:
```
aws ecs describe-services --cluster afritalent-dev --services afritalent-frontend afritalent-backend --query 'services[].{name:serviceName,running:runningCount,desired:desiredCount,events:events[0].message}'
```

**Pass signal:** Both ECS services have `runningCount == desiredCount`; Lambda functions invocable; ECS task logs show clean startup.

### Phase 4 — Data Migration (target: 30 min)

Test-phase product → simple `pg_dump`/`pg_restore`. No DMS. No CDC. No maintenance mode banner needed.

4.1 Snapshot the old DB (safety net):
```
aws rds create-db-snapshot --db-instance-identifier afritalent-old --db-snapshot-identifier pre-migration-$(date +%Y%m%d-%H%M)
```
*Run with old-account creds.*

4.2 Dump from old:
```
./scripts/migrate/dump-old-rds.sh out/afritalent-$(date +%Y%m%d-%H%M).dump
```

4.3 Restore to new (via RDS Proxy or direct cluster endpoint):
```
./scripts/migrate/restore-new-aurora.sh out/afritalent-*.dump
```

4.4 Run any pending Prisma migrations against the new DB (idempotent — should be a no-op):
```
DATABASE_URL=$(aws ssm get-parameter --name /afritalent/dev/DATABASE_URL --with-decryption --query 'Parameter.Value' --output text) \
  npx prisma migrate deploy
```

**Pass signal:** `SELECT count(*) FROM "User"`, `"Job"`, `"Profile"` etc. on new Aurora match the old RDS counts (run the comparison script).

### Phase 5 — Validation + Cutover (target: 25 min)

5.1 Smoke-test the new env via raw ALB and CloudFront URLs (NOT yet user-facing):
```
./scripts/migrate/smoke-test.sh https://<alb-dns>
./scripts/migrate/smoke-test.sh https://<cloudfront-domain>
```
Covers: health endpoint, login with seeded account, orchestrator run with `MOCK_AI=1` then real, Stripe webhook signature verification.

5.2 Run synthetic canary against the new CloudFront domain for 5 minutes; verify zero failures.

5.3 DNS cutover:
> [!WARNING]
> **CRITICAL RECOMMENDATION:** The API must also route through CloudFront to benefit from the WAF and custom cache behaviors defined in Phase 2. Bypassing CloudFront and going directly to the ALB leaves the API unprotected.

```
# In Route 53 (or your registrar), update the prod records:
#   afritalent.example.com  ALIAS  →  d12345.cloudfront.net
#   api.afritalent.example.com  ALIAS  →  d12345.cloudfront.net (Ensure CloudFront handles the /api/* routing to the ALB)
```
TTL is already 60s from Phase 0, so propagation = ~1–2 min.

5.4 Watch for 10 minutes:
- ALB target group health
- CloudFront 5xx rate
- Lambda errors metric (orchestrator + webhooks)
- Aurora ACU utilization
- WAF blocked requests (sanity-check: not blocking real users)

**Pass signal:** Zero 5xx in CloudFront/ALB metrics over 10 min; orchestrator Step Functions executions succeed end-to-end; user can sign in via prod URL.

### Phase 6 — Old Account (target: 5 min)

Per user direction (test-phase, don't care):
```
# Old-account creds
cd infra-old/terraform/
terraform destroy -auto-approve
```
Then close the AWS account from the Organizations console (or leave it as billing-zero member if you want a record).

**Pass signal:** Old App Runner services + RDS gone; final billing line drops to zero next cycle.

---

## 6. Rollback

If Phase 5 fails after DNS cutover:
1. Revert DNS records to point at old App Runner/RDS endpoints (TTL 60s = ~1 min).
2. Inspect new-env logs in CloudWatch + Step Functions to triage.
3. If new env is recoverable: fix forward, re-cutover.
4. If not: stay on old infra, schedule a retry.

The new infra remains running in the new account during rollback — no destroy. Cost during rollback investigation is the optimized $90–125/mo, not a concern.

If Phase 4 (data migration) fails:
1. Don't cutover.
2. Restore from the Phase 4.1 snapshot if needed.
3. Old infra is still serving traffic; nothing burned.

If Phase 1–3 fails:
1. Old infra unaffected.
2. Re-run failed Terraform apply with `TF_LOG=DEBUG`.
3. Worst case: `terraform destroy` everything in the new account, restart from Phase 1.

---

## 7. Validation Checklist (signs the migration succeeded)

- [ ] `https://<prod-domain>` resolves to CloudFront, returns 200 on `/`.
- [ ] User login works end-to-end against migrated users.
- [ ] AI orchestrator `POST /api/orchestrator/run` succeeds with real Anthropic key (Step Functions execution visible in console).
- [ ] Stripe webhook hits Lambda Function URL, signature verifies, DB record updated.
- [ ] Aurora Serverless v2 visible scale-down to 0 ACU during idle.
- [ ] Fargate Spot tasks present and running (verify capacity provider distribution).
- [ ] No NAT Gateway in the new VPC (`aws ec2 describe-nat-gateways` returns empty).
- [ ] All VPC endpoints `available` (`aws ec2 describe-vpc-endpoints`).
- [ ] WAF showing blocked + allowed metrics; not blocking legit traffic.
- [ ] GuardDuty + Security Hub findings dashboard populated.
- [ ] CloudWatch dashboards show healthy ALB target group.
- [ ] Cost Explorer (24h post-cutover): NAT Gateway line $0; Fargate line lower than App Runner equivalent.

---

## 8. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Aurora SLv2 cold-resume (~15s) hits a real user | Medium | Low–Medium | Test phase, acceptable. Promote `MinCapacity=0.5` if it's a complaint. |
| Lambda cold start on first orchestrator run after idle | Medium | Low | Step Functions handles retries; users see progress not blank. Provisioned concurrency available if it bites. |
| VPC endpoint config wrong → ECR pulls fail → tasks can't start | Low | High (blocks Phase 3) | Pre-flight test in a throwaway VPC; endpoints are well-trodden Terraform. |
| pg_dump/restore takes longer than expected | Medium | Low (downtime tolerated) | Time it in pre-flight. If >20 min, parallelize tables. |
| Terraform state bucket created in wrong region | Low | High (rebuild) | Bootstrap script hard-codes `us-east-1`; reviewed at Phase 1.1. |
| Stripe/Flutterwave webhook URLs need updating in their dashboards | High | Medium | Phase 5.4 includes updating webhook URLs in Stripe/Flutterwave dashboards. |
| Anthropic API key rate-limited under Lambda burst | Low | Low | Step Functions retries on 429 with exponential backoff. |
| Cross-account ECR pulls (if reusing old images) blocked | Low | Low | We're rebuilding images in new ECR; no cross-account pull. |
| User runs Terraform from local (wrong account creds) | Medium | Medium | All `terraform apply` runs through GitHub Actions OIDC (per memory: local creds are wrong account). |

---

## 9. Open Decisions Awaiting User

- [ ] **Account ID for the new account** (placeholder: `NEWACCT`).
- [ ] **Domain name in scope** (placeholder: `afritalent.example.com`).
- [ ] **Route 53 path** — confirm path 1 (keep registration in old, delegate NS to new). See §10.
- [ ] **Region** — confirm `us-east-1` (per memory). DSQL also available there if we revisit later.
- [ ] **AWS Organizations** — create a new org with the new account as management, or join existing? If neither exists, create new.
- [ ] **Aurora MinCapacity for prod-grade traffic** — `0` (auto-pause, ~15s cold) vs `0.5` (always-warm, +$30–40/mo). Default: `0` until traffic justifies otherwise.

---

## 10. Domain Strategy

Recommended path: **keep registration in old account, delegate DNS to new hosted zone.**

1. Pre-flight: create Route 53 hosted zone for `afritalent.example.com` in the **new** account. Note the four NS records.
2. Pre-flight: in the **old** account's Route 53 (or your registrar), update the domain's NS records to those four values. Wait for propagation (1–48 hr).
3. From this point forward, all DNS changes happen in the new account's hosted zone.
4. The domain registration itself stays in the old account (or external registrar) — no rush to transfer.
5. After bake-out (30+ days), if you want to fully close the old account, transfer the registration via AWS Support ticket.

This avoids the registration-transfer support ticket on the critical path.

---

## 11. Post-Migration Improvements (deferred, queued)

In priority order:
1. **Compute Savings Plan** for always-on Fargate baseline after 30 days.
2. **Aurora DSQL pilot** in staging — measure PostgreSQL extension compatibility against your Prisma schema.
3. **Multi-region read replica** if user latency in Africa is a real complaint.
4. **CloudFront → Lambda@Edge** for image optimization if image bandwidth becomes a cost driver.
5. **Move static assets to S3 + CloudFront origin** (currently served from Next.js — works but Fargate cycles wasted on bytes).
6. **SOC 2 readiness path** (siem-soc2 skill) once product hits production.
7. **Disaster recovery runbook + automated cross-region snapshot copy.**

---

## 12. Execution Log

(Filled in during live execution.)

| Phase | Started | Finished | Outcome | Notes |
|---|---|---|---|---|
| 0 | | | | |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |

---

## 13. References (MCP-verified facts)

- App Runner sunset to new customers (2026-04-30): [`docs.aws.amazon.com/apprunner/latest/dg/architecture.html`](https://docs.aws.amazon.com/apprunner/latest/dg/architecture.html)
- Aurora Serverless v2 scale-to-zero: [`docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html`](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html)
- Aurora I/O-Optimized: [`aws.amazon.com/rds/aurora/pricing/`](https://aws.amazon.com/rds/aurora/pricing/)
- Fargate Spot 70% off, capacity providers: [`docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html`](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html)
- VPC endpoints cheaper than NAT: [`aws.amazon.com/vpc/pricing/`](https://aws.amazon.com/vpc/pricing/)
- Lambda Web Adapter for containers: [`aws.amazon.com/blogs/architecture/field-notes-three-steps-to-port-your-containerized-application-to-aws-lambda/`](https://aws.amazon.com/blogs/architecture/field-notes-three-steps-to-port-your-containerized-application-to-aws-lambda/)
- All target services available in `us-east-1`: confirmed via `aws___get_regional_availability` (Aurora, Aurora DSQL, Fargate, Lambda, CloudFront, WAF, GuardDuty, Security Hub, DMS).
