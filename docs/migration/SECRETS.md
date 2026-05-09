# Migration Secrets Inventory

**Purpose:** Complete list of secrets to inject into SSM Parameter Store (SecureString) in the new AWS account during Phase 3 of the migration.

**Storage decision:** SSM Parameter Store SecureString (KMS-encrypted), NOT Secrets Manager. Saves ~$0.40 × N parameters/month. Lifecycle: Terraform creates parameters as `placeholder` shells with `lifecycle { ignore_changes = [value] }`; values are injected post-apply via `scripts/migrate/inject-secrets.sh`.

**Path scheme:** `/afritalent/<env>/<KEY>` where `<env>` ∈ `dev | staging | prod`.

**KMS key:** `alias/afritalent-<env>-ssm` (one CMK per env, auto-rotation enabled).

---

## Required (must inject before app starts)

| Parameter Path | Source | Type | Notes |
|---|---|---|---|
| `/afritalent/<env>/DATABASE_URL` | Auto-written by Terraform from Aurora outputs | String | Format: `postgresql://USER:PASS@PROXY_ENDPOINT:5432/afritalent` (uses RDS Proxy) |
| `/afritalent/<env>/JWT_SECRET` | Generate fresh per env | SecureString | `openssl rand -hex 64` |
| `/afritalent/<env>/SESSION_SECRET` | Generate fresh per env | SecureString | `openssl rand -hex 64` |
| `/afritalent/<env>/ANTHROPIC_API_KEY` | Anthropic console | SecureString | Used by orchestrator Lambda + Express |

## Payments (Stripe)

| Parameter Path | Source | Type |
|---|---|---|
| `/afritalent/<env>/STRIPE_SECRET_KEY` | Stripe dashboard | SecureString |
| `/afritalent/<env>/STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint settings | SecureString |
| `/afritalent/<env>/STRIPE_PRICE_CATALOG_JSON` | Stripe price IDs by region | SecureString |

**Action item:** After CloudFront/ALB DNS is final, update Stripe webhook endpoint URL in the Stripe dashboard to point at the new Lambda Function URL.

## Payments (Flutterwave)

| Parameter Path | Source | Type |
|---|---|---|
| `/afritalent/<env>/FLUTTERWAVE_PUBLIC_KEY` | Flutterwave dashboard | SecureString |
| `/afritalent/<env>/FLUTTERWAVE_SECRET_KEY` | Flutterwave dashboard | SecureString |
| `/afritalent/<env>/FLUTTERWAVE_SECRET_HASH` | Flutterwave webhook config | SecureString |
| `/afritalent/<env>/FLUTTERWAVE_PLAN_CATALOG_JSON` | Plan IDs by region | SecureString |
| `/afritalent/<env>/FLUTTERWAVE_PAYMENT_OPTIONS` | Comma list, default `card,banktransfer,ussd` | String |

**Action item:** Update Flutterwave webhook URL post-cutover.

## Auth providers (OAuth)

| Parameter Path | Source | Type |
|---|---|---|
| `/afritalent/<env>/GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth consent | SecureString |
| `/afritalent/<env>/GOOGLE_CLIENT_SECRET` | Google Cloud Console | SecureString |
| `/afritalent/<env>/APPLE_CLIENT_ID` | Apple Developer | SecureString |

**Action item:** Add the new CloudFront domain to authorized redirect URIs in each provider's console BEFORE cutover.

## Job aggregation / external data

| Parameter Path | Source | Type |
|---|---|---|
| `/afritalent/<env>/ADZUNA_APP_ID` | Adzuna dev portal | String |
| `/afritalent/<env>/ADZUNA_API_KEY` | Adzuna dev portal | SecureString |
| `/afritalent/<env>/APIFY_TOKEN` | Apify console | SecureString |
| `/afritalent/<env>/APIFY_JOB_TASKS_JSON` | Apify task config | SecureString |
| `/afritalent/<env>/GREENHOUSE_BOARD_TOKENS` | Comma-separated tokens | String |
| `/afritalent/<env>/LEVER_SITE_TOKENS` | Comma-separated tokens | String |
| `/afritalent/<env>/WORKABLE_COMPANY_TOKENS` | `account:token` pairs | SecureString |
| `/afritalent/<env>/COMPANY_CAREER_SOURCES_JSON` | JSON config | SecureString |

## Blog pipeline

| Parameter Path | Source | Type |
|---|---|---|
| `/afritalent/<env>/blog/NEWS_API_KEY` | newsapi.org | SecureString |
| `/afritalent/<env>/blog/UNSPLASH_ACCESS_KEY` | Unsplash dev | SecureString |
| `/afritalent/<env>/blog/PEXELS_API_KEY` | Pexels API | SecureString |
| `/afritalent/<env>/blog/BLOG_ADMIN_NOTIFICATION_EMAIL` | Admin email | SecureString |

## Optional / observability

| Parameter Path | Source | Type | Required? |
|---|---|---|---|
| `/afritalent/<env>/REDIS_URL` | ElastiCache or external | SecureString | Optional — empty disables Redis |
| `/afritalent/<env>/SENTRY_DSN` | Sentry project | SecureString | Optional |
| `/afritalent/<env>/ADMIN_BOOTSTRAP_EMAIL` | Bootstrap admin | SecureString | Optional |
| `/afritalent/<env>/ADMIN_BOOTSTRAP_PASSWORD` | Bootstrap admin | SecureString | Optional |
| `/afritalent/<env>/AI_FAST_MODEL` | Anthropic model id | String | Default: `claude-haiku-4-5-20251001` |
| `/afritalent/<env>/AI_QUALITY_MODEL` | Anthropic model id | String | Default: `claude-sonnet-4-6` |
| `/afritalent/<env>/OPENAI_API_KEY` | OpenAI dashboard | SecureString | Optional — embeddings fallback |
| `/afritalent/<env>/OPENAI_EMBEDDING_ENDPOINT` | OpenAI URL | String | Optional |

## Frontend (build-time, not SSM — set in CI as build args)

These are baked into the Next.js build at CI time, not pulled from SSM at runtime:

- `NEXT_PUBLIC_API_URL` — set to new ALB domain or `/api` (proxied via CloudFront)
- `NEXT_PUBLIC_BACKEND_URL` — set to new backend URL
- `NEXT_PUBLIC_DEFAULT_LOCALE` — `en`
- `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS` — `false` for prod

## Non-secret runtime config (passed as ECS task definition env, not SSM)

- `NODE_ENV=production`
- `APP_URL` — public app URL
- `FRONTEND_URL` — same
- `MOCK_AI` — `0` for prod, `1` for synthetic canary runs
- `AI_DISABLED` — kill switch, `0` default

---

## Injection runbook (Phase 3.1)

```bash
# Pre-req: aws CLI authenticated to NEW account, region us-east-1
export ENV=dev
export ACCOUNT_ID=NEWACCT  # replace
./scripts/migrate/inject-secrets.sh
```

The script reads values interactively (or from a sourced `.env.migrate` file you delete after) and runs `aws ssm put-parameter --overwrite` for each.

After injection, verify all required parameters resolve:

```bash
./scripts/migrate/inject-secrets.sh --verify
```

---

## Source-of-truth note

The canonical list lives in two Terraform places:
- `infra/terraform/modules/secrets/variables.tf` — variables
- `infra/terraform/modules/secrets/main.tf` — current Secrets Manager + blog SSM resources

After the migration's Phase 0.1 work, this module will be replaced by `infra/terraform/modules/ssm-parameters/` which creates SSM SecureString parameter shells matching this document exactly.

If you add a new secret to the codebase: add it here, add it to the SSM module, and add it to `inject-secrets.sh`.
