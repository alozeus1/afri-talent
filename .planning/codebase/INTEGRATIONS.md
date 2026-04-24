# External Integrations

**Analysis Date:** 2026-04-09

## Payment Services

**Stripe** (global / non-Nigeria markets)
- SDK: `stripe ^20.3.1`
- Client: `backend/src/lib/stripe.ts`
- Features: hosted checkout, webhooks, subscription management
- Env vars:
  - `STRIPE_SECRET_KEY` — server-side API key
  - `STRIPE_WEBHOOK_SECRET` — webhook signature validation
  - `STRIPE_PRICE_BASIC_MONTHLY` — legacy price ID fallback
  - `STRIPE_PRICE_PROFESSIONAL_MONTHLY` — legacy price ID fallback
  - `STRIPE_PRICE_EMPLOYER_BASIC_MONTHLY` — legacy price ID fallback
  - `STRIPE_PRICE_EMPLOYER_PREMIUM_MONTHLY` — legacy price ID fallback
  - `STRIPE_PRICE_CATALOG_JSON` — JSON map of plan:region:interval:currency → price ID

**Flutterwave** (Nigeria / Africa-first billing)
- Client: `backend/src/lib/flutterwave.ts` (REST API, no official Node SDK)
- Features: recurring billing, card, bank transfer, USSD payment rails
- Env vars:
  - `FLUTTERWAVE_PUBLIC_KEY`
  - `FLUTTERWAVE_SECRET_KEY`
  - `FLUTTERWAVE_SECRET_HASH` — webhook signature validation
  - `FLUTTERWAVE_PLAN_CATALOG_JSON` — JSON map of plan:region:interval:currency → plan ID
  - `FLUTTERWAVE_PAYMENT_OPTIONS` — comma-separated rails (default: `card,banktransfer,ussd`)

**Health check bypass:**
- `HEALTHCHECK_REQUIRE_BILLING` — set to `1` to require billing readiness in health checks, `0` to make optional

## Authentication Services

**Custom JWT Auth**
- Library: `jsonwebtoken ^9.0.3`
- Implementation: `backend/src/lib/jwt.ts`
- Env vars:
  - `JWT_SECRET` — signing secret (generate with `openssl rand -base64 64`)
  - `JWT_EXPIRES_IN` — token TTL (default: `7d`)

**Google OAuth** (optional, social login)
- Implementation: custom (no dedicated SDK)
- Env vars:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`

**Apple OAuth** (optional, social login)
- Implementation: custom
- Env vars:
  - `APPLE_CLIENT_ID`
  - `APPLE_TEAM_ID`
  - `APPLE_KEY_ID`
  - `APPLE_PRIVATE_KEY`

**ATS Token Encryption**
- Env var: `ATS_TOKEN_ENCRYPTION_KEY` — 32+ char secret for encrypting ATS provider access/refresh tokens at rest
- Implementation: `backend/src/lib/ats/service.ts`

## AI / ML Services

**Anthropic Claude API** (primary AI provider)
- SDK: `@anthropic-ai/sdk ^0.78.0`
- Env var: `ANTHROPIC_API_KEY` (injected from AWS Secrets Manager in production)
- Models:
  - `AI_FAST_MODEL` — defaults to `claude-haiku-4-5-20251001`
  - `AI_QUALITY_MODEL` — defaults to `claude-sonnet-4-6`
- Kill switches:
  - `MOCK_AI=1` — return stub responses without API calls (testing)
  - `AI_DISABLED=1` — return 503 for all AI routes
- Token budget: `ORCHESTRATOR_TOKEN_BUDGET_MAX` (default: `120000`)
- Per-user daily quotas (env-configurable):
  - `DAILY_APPLY_PACK_LIMIT` (default: `5`)
  - `DAILY_JOB_MATCH_LIMIT` (default: `20`)
  - `DAILY_RESUME_REVIEW_LIMIT` (default: `10`)
- Orchestrator: `backend/src/lib/ai/orchestrator/` — 6 specialist agents:
  - `ResumeParserAgent`
  - `JobParserAgent`
  - `MatchScorerAgent`
  - `ResumeTailorAgent`
  - `CoverLetterAgent`
  - `TruthConsistencyGuardAgent`

**Semantic Embeddings** (RAG / job matching)
- Implementation: `backend/src/lib/rag/embedding.ts`
- Providers (switchable via env):
  - `hash` — local hash-based embeddings, no external API (default/fallback)
  - `openai` — OpenAI-compatible embedding endpoint
  - `disabled` — turns off indexing and search
- Env vars:
  - `SEMANTIC_EMBEDDING_PROVIDER` (default: `hash`)
  - `SEMANTIC_EMBEDDING_MODEL` (default: `hash-v1`; OpenAI default: `text-embedding-3-small`)
  - `SEMANTIC_EMBEDDING_DIMENSIONS` (default: `256`)
  - `OPENAI_EMBEDDING_ENDPOINT` (default: `https://api.openai.com/v1/embeddings`)
  - `SEMANTIC_INDEX_ENABLED` (default: `1`)
  - `SEMANTIC_INDEX_BATCH_SIZE` (default: `100`)
  - `SEMANTIC_INDEX_MAX_BATCHES` (default: `10`)

## Storage / CDN

**AWS S3** (file uploads)
- SDK: `@aws-sdk/client-s3 ^3.1027.0` + `@aws-sdk/s3-request-presigner ^3.1027.0`
- Env var: `S3_UPLOADS_BUCKET` (set by Terraform as `{name_prefix}-uploads`)
- Use: resume documents, interview media, candidate files
- Presigned upload URLs for direct browser-to-S3 transfers
- IAM policy attached to App Runner instance role (`aws_iam_role_policy_attachment.apprunner_s3` in `infra/terraform/main.tf`)

**Interview Media Retention:**
- `MOCK_INTERVIEW_RETENTION_DAYS` (default: `30`) — artifact cleanup window

## Email / Notifications

**AWS SES** (transactional email)
- SDK: `@aws-sdk/client-ses ^3.1027.0`
- Implementation: `backend/src/lib/email.ts`
- Env vars:
  - `SES_FROM_EMAIL` (default: `noreply@afritalent.com`)
  - `SES_REGION` (set by Terraform, e.g. `us-east-1`)

**Web Push Notifications**
- Library: `web-push ^3.6.7`
- Implementation: `backend/src/lib/push.ts`
- Env vars:
  - `WEB_PUSH_VAPID_SUBJECT` (e.g. `mailto:security@afritalent.com`)
  - `WEB_PUSH_VAPID_PUBLIC_KEY`
  - `WEB_PUSH_VAPID_PRIVATE_KEY`
  - Generate keys with: `npx web-push generate-vapid-keys`

**WhatsApp / Telegram Bot Bridge** (Phase 4, disabled by default)
- Inbound webhook endpoint (bot bridge requests)
- `BOT_WEBHOOK_SECRET` — authenticates inbound webhook calls
- `PHASE4_BOTS_ENABLED=0` — feature flag

## Job Scraping / Data Sources

All aggregator sources live in `backend/src/lib/jobs/aggregator/sources/`. Cron sync managed by `backend/src/workers/aggregator-cron.ts`.

**Adzuna** (multi-region job search API)
- Source: `backend/src/lib/jobs/aggregator/sources/adzuna.ts`
- Env vars:
  - `ADZUNA_APP_ID`
  - `ADZUNA_API_KEY`

**Apify** (cloud scraper runtime for extended coverage)
- Source: `backend/src/lib/jobs/aggregator/sources/apify.ts`
- Env vars:
  - `APIFY_TOKEN`
  - `APIFY_JOB_TASKS_JSON` — JSON array of task configs (taskId, label, defaultInput, overrides)

**Greenhouse** (ATS board API)
- Source: `backend/src/lib/jobs/aggregator/sources/greenhouse.ts`
- Env var: `GREENHOUSE_BOARD_TOKENS` — comma-separated board tokens
- Includes built-in curated catalog (configurable)

**Lever** (ATS board API)
- Source: `backend/src/lib/jobs/aggregator/sources/lever.ts`
- Env var: `LEVER_SITE_TOKENS` — comma-separated site tokens
- Default catalog includes: plaid, spreetail, yubico, pointclickcare, levelai, enter-rcm-llc

**Workable** (ATS board API)
- Source: `backend/src/lib/jobs/aggregator/sources/workable.ts`
- Env var: `WORKABLE_COMPANY_TOKENS` — comma-separated `accountSlug` or `accountSlug:apiToken` entries

**Scraped / Public Sources** (no API key required)
- `arbeitnow.ts` — Arbeitnow job board
- `himalayas.ts` — Himalayas remote jobs
- `jobberman.ts` — Jobberman (Nigeria)
- `jobsincyprus.ts` — Jobs in Cyprus
- `remoteok.ts` — RemoteOK
- `weworkremotely.ts` — We Work Remotely

**Aggregator Tuning Env Vars:**
- `AGGREGATOR_INCLUDE_DEFAULT_BOARD_CATALOG` (default: `1`) — merge built-in curated board catalogs
- `AGGREGATOR_INCLUDE_SCRAPED_SOURCES` (default: `0`) — enable public scraper adapters
- `AGGREGATOR_MAX_JOBS` (default: `500`) — cap on jobs per sync run
- `AGGREGATOR_POSTED_DAYS` (default: `21`) — max age of jobs to fetch

## Error Tracking

**Sentry**
- Backend: `@sentry/node ^10.43.0` + `@sentry/profiling-node ^10.43.0`
  - Config: `backend/src/instrument.ts`
  - Client: `backend/src/lib/sentry.ts`
- Frontend: `@sentry/nextjs ^10.43.0`
  - Configs: `frontend/sentry.client.config.ts`, `frontend/sentry.server.config.ts`, `frontend/sentry.edge.config.ts`
  - Wrapped in `withSentryConfig()` in `frontend/next.config.ts`
- Env vars (backend):
  - `SENTRY_DSN`
- Env vars (frontend):
  - `NEXT_PUBLIC_SENTRY_DSN` — browser SDK
  - `SENTRY_DSN` — server/edge runtime override
  - `SENTRY_ORG` — required for release + source map upload
  - `SENTRY_PROJECT`
  - `SENTRY_AUTH_TOKEN`

## ATS Integrations

**ATS Provider Abstraction**
- Implementation: `backend/src/lib/ats/service.ts` + `backend/src/lib/ats/providers.ts`
- Token encryption at rest using `ATS_TOKEN_ENCRYPTION_KEY`

## CI/CD Integration

**GitHub Actions + AWS OIDC**
- Workflows: `.github/workflows/` (ci.yml, deploy-apprunner.yml, security.yml, terraform.yml)
- OIDC role: `GitHubActionsDeployRole` in AWS account `108188564905`
- No static AWS credentials — federated identity via GitHub OIDC provider
- Terraform state: S3 bucket `afritalent-dev-terraform-state`, DynamoDB lock table `afritalent-dev-terraform-locks`

## Environment Variables — Full Reference

### Backend (`backend/.env.example`)

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `JWT_EXPIRES_IN` | JWT TTL (default: `7d`) | No |
| `FRONTEND_URL` | CORS allowed origin | Yes |
| `ALLOWED_ORIGIN_REGEX` | Additional CORS origin regex | No |
| `PORT` | HTTP listen port (default: `4000`) | No |
| `NODE_ENV` | Runtime environment | No |
| `ENABLE_API_DOCS` | Expose Swagger UI (default: `false`) | No |
| `LOG_LEVEL` | Pino log level (default: `info`) | No |
| `SENTRY_DSN` | Sentry error tracking DSN | No |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | No |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | No |
| `APPLE_CLIENT_ID` | Apple OAuth client ID | No |
| `APPLE_TEAM_ID` | Apple OAuth team ID | No |
| `APPLE_KEY_ID` | Apple OAuth key ID | No |
| `APPLE_PRIVATE_KEY` | Apple OAuth private key | No |
| `SES_FROM_EMAIL` | SES sender address | No |
| `WEB_PUSH_VAPID_SUBJECT` | VAPID subject URI | No |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | VAPID public key | No |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | VAPID private key | No |
| `REDIS_URL` | Redis connection URL | No |
| `ADZUNA_APP_ID` | Adzuna API app ID | No |
| `ADZUNA_API_KEY` | Adzuna API key | No |
| `APIFY_TOKEN` | Apify cloud API token | No |
| `APIFY_JOB_TASKS_JSON` | Apify task config JSON array | No |
| `GREENHOUSE_BOARD_TOKENS` | Greenhouse board token list | No |
| `LEVER_SITE_TOKENS` | Lever site token list | No |
| `WORKABLE_COMPANY_TOKENS` | Workable account slug(s) | No |
| `AGGREGATOR_INCLUDE_DEFAULT_BOARD_CATALOG` | Merge built-in catalog (default: `1`) | No |
| `AGGREGATOR_INCLUDE_SCRAPED_SOURCES` | Enable scrapers (default: `0`) | No |
| `AGGREGATOR_MAX_JOBS` | Sync cap (default: `500`) | No |
| `AGGREGATOR_POSTED_DAYS` | Max job age days (default: `21`) | No |
| `SEMANTIC_EMBEDDING_PROVIDER` | `hash` \| `openai` \| `disabled` | No |
| `SEMANTIC_EMBEDDING_MODEL` | Embedding model name | No |
| `SEMANTIC_EMBEDDING_DIMENSIONS` | Vector dimensions (default: `256`) | No |
| `OPENAI_EMBEDDING_ENDPOINT` | OpenAI-compatible endpoint URL | No |
| `SEMANTIC_INDEX_ENABLED` | Enable semantic indexing (default: `1`) | No |
| `SEMANTIC_INDEX_BATCH_SIZE` | Indexing batch size (default: `100`) | No |
| `SEMANTIC_INDEX_MAX_BATCHES` | Max batches per run (default: `10`) | No |
| `HEALTHCHECK_REQUIRE_BILLING` | Force billing readiness check | No |
| `STRIPE_SECRET_KEY` | Stripe server-side key | No |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature secret | No |
| `STRIPE_PRICE_BASIC_MONTHLY` | Legacy Stripe price ID | No |
| `STRIPE_PRICE_PROFESSIONAL_MONTHLY` | Legacy Stripe price ID | No |
| `STRIPE_PRICE_EMPLOYER_BASIC_MONTHLY` | Legacy Stripe price ID | No |
| `STRIPE_PRICE_EMPLOYER_PREMIUM_MONTHLY` | Legacy Stripe price ID | No |
| `STRIPE_PRICE_CATALOG_JSON` | Regional price catalog JSON | No |
| `FLUTTERWAVE_PUBLIC_KEY` | Flutterwave public key | No |
| `FLUTTERWAVE_SECRET_KEY` | Flutterwave secret key | No |
| `FLUTTERWAVE_SECRET_HASH` | Flutterwave webhook hash | No |
| `FLUTTERWAVE_PLAN_CATALOG_JSON` | Flutterwave plan catalog JSON | No |
| `FLUTTERWAVE_PAYMENT_OPTIONS` | Payment rails list | No |
| `ATS_TOKEN_ENCRYPTION_KEY` | ATS token encryption secret (32+ chars) | No |
| `MOCK_INTERVIEW_RETENTION_DAYS` | Interview artifact retention (default: `30`) | No |
| `PHASE4_SOCIAL_ENABLED` | Feature flag (default: `0`) | No |
| `PHASE4_SALARY_NEGOTIATION_ENABLED` | Feature flag (default: `0`) | No |
| `PHASE4_UNIVERSITY_API_ENABLED` | Feature flag (default: `0`) | No |
| `PHASE4_EMPLOYER_AI_ENABLED` | Feature flag (default: `0`) | No |
| `PHASE4_BOTS_ENABLED` | Feature flag (default: `0`) | No |
| `BOT_WEBHOOK_SECRET` | Bot bridge webhook auth | No |
| `MOCK_AI` | Return AI stubs (default: `0`) | No |
| `AI_FAST_MODEL` | Claude fast model ID | No |
| `AI_QUALITY_MODEL` | Claude quality model ID | No |
| `ORCHESTRATOR_TOKEN_BUDGET_MAX` | Max tokens per orchestrator run (default: `120000`) | No |
| `AI_DISABLED` | Kill switch for all AI routes (default: `0`) | No |
| `DAILY_APPLY_PACK_LIMIT` | Daily apply pack quota (default: `5`) | No |
| `DAILY_JOB_MATCH_LIMIT` | Daily job match quota (default: `20`) | No |
| `DAILY_RESUME_REVIEW_LIMIT` | Daily resume review quota (default: `10`) | No |

### Frontend (`frontend/.env.example`)

| Variable | Purpose | Required |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL | Yes |
| `NEXT_PUBLIC_BACKEND_URL` | Orchestrator client base URL | No |
| `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS` | Show demo login helper (dev only) | No |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | Default locale (`en` \| `fr` \| `pt` \| `ar`) | No |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry browser DSN | No |
| `SENTRY_DSN` | Sentry server/edge DSN | No |
| `SENTRY_ORG` | Sentry org slug (build time) | No |
| `SENTRY_PROJECT` | Sentry project slug (build time) | No |
| `SENTRY_AUTH_TOKEN` | Sentry auth token for source maps | No |

### Mobile (`mobile/.env.example`)

| Variable | Purpose | Required |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Backend API base URL | Yes |

---

*Integration audit: 2026-04-09*
