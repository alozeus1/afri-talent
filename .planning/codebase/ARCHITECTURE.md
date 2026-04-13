# System Architecture

**Analysis Date:** 2026-04-09

---

## Overview

AfriTalent is a two-tier web application: a Next.js 16 frontend and an Express 5 + Node.js 20 backend, both containerised and deployed as AWS App Runner services backed by RDS PostgreSQL. The backend is the single source of truth for all data and business logic. The frontend is a pure client — it calls the backend REST API for everything and holds no server-side session state.

**Pattern:** Client-server monolith with a background scheduler running inside the backend process.

**Key characteristics:**
- All API routes live under `/api/` prefix on the backend (port 4000)
- Auth is stateless JWT, delivered as HttpOnly cookies; Redis used for token revocation blocklist (fail-open)
- Multi-agent AI pipeline (Claude via `@anthropic-ai/sdk`) runs synchronously on demand in the orchestrator route
- A proactive scheduler starts on backend boot and runs 9 background workers on configurable intervals
- Billing is region-aware: Stripe for EUROPE/ROW, Flutterwave for AFRICA
- Semantic search layer (embedding-based) stored in PostgreSQL via `SemanticDocument` table

---

## Backend Architecture (Express/Node)

**Entry:** `backend/src/server.ts` → creates HTTP server, starts scheduler, handles graceful shutdown

**App wiring:** `backend/src/app.ts` — registers all middleware and routes

**Middleware stack (in order):**
1. `requestIdMiddleware` — attaches `req.requestId` UUID to every request
2. `pinoHttp` — structured request logging (suppressed in test)
3. `securityHeaders` (Helmet) — CSP, HSTS, etc.
4. Trust proxy setting (production only)
5. CORS — allowlist from `FRONTEND_URL` + localhost patterns; `ALLOWED_ORIGIN_REGEX` for App Runner wildcard
6. `generalLimiter` — 100 req/15 min per IP (express-rate-limit)
7. Stripe/ATS webhook routes — raw body required, registered BEFORE `express.json()`
8. `express.json({ limit: "10kb" })` + `express.urlencoded`
9. `sanitizeRequest` — strips null bytes and prototype-polluting keys
10. Route handlers
11. `orchestratorLimiter` — 10 req/min per user ID, applied only to `/api/orchestrator`
12. Sentry error handler
13. 404 + global error handlers

**Security middleware layers:**
- `backend/src/middleware/auth.ts` — `authenticate`, `optionalAuth`, `authorize(role)`, `requireVerifiedEmail()`
- `backend/src/middleware/security.ts` — rate limiters: `generalLimiter`, `authLimiter`, `registerLimiter`, `passwordResetLimiter`, `orchestratorLimiter`
- `backend/src/middleware/bot-protection.ts` — `validateHumanAuthSubmission`, `anonymousJobsLimiter`, `blockAnonymousJobsAutomation`
- `backend/src/middleware/account-standing.ts` — `requireAccountStanding()` blocks LIMITED/SUSPENDED accounts
- `backend/src/middleware/feature-flags.ts` — optional feature gate middleware

**Core libraries:**
- `backend/src/lib/prisma.ts` — singleton Prisma client
- `backend/src/lib/jwt.ts` — `signToken`, `verifyToken` (RS256 with issuer/audience validation; 7-day expiry)
- `backend/src/lib/redis.ts` — optional ioredis client for token blocklist; fails open if unavailable
- `backend/src/lib/logger.ts` — Pino structured logger
- `backend/src/lib/sentry.ts` — Sentry SDK initialisation and error handler
- `backend/src/lib/cache.ts` — in-memory JSON cache with TTL (used for job listings)
- `backend/src/lib/email.ts` — AWS SES email sending
- `backend/src/lib/stripe.ts` — Stripe SDK singleton and price constants
- `backend/src/lib/flutterwave.ts` — Flutterwave checkout and verification

---

## Frontend Architecture (Next.js)

**Entry:** `frontend/src/app/layout.tsx` — root layout, wraps all pages with `ThemeProvider` and `AuthProvider`

**Routing:** Next.js App Router. Two parallel route trees:
- `frontend/src/app/` — canonical pages (no locale prefix)
- `frontend/src/app/[locale]/` — locale-prefixed mirror for en/fr/pt/ar pages

**i18n:** `frontend/middleware.ts` — intercepts requests; redirects `/`, `/login`, `/register`, `/pricing`, `/candidate`, `/jobs` to `/{locale}/...`; reads locale from cookie `afritalent-locale` or `Accept-Language` header; supported locales: `en`, `fr`, `pt`, `ar`

**Auth state:** `frontend/src/lib/auth-context.tsx` — React context. On mount calls `GET /api/auth/me` to restore session from HttpOnly cookie. Exposes `login`, `register`, `logout` methods. No tokens stored in localStorage.

**API client:** `frontend/src/lib/api.ts` — `fetchAPI()` wrapper that sends `credentials: "include"` on every request; reads `NEXT_PUBLIC_API_URL` for the backend base URL. Organised into domain namespaces: `auth`, `jobs`, `applications`, `profile`, etc.

**Component organisation:**
- `frontend/src/components/layout/` — Header, Footer, NetworkStatusBanner, LanguageSwitcher, ThemeToggle
- `frontend/src/components/jobs/` — JobCard, JobFilters, JobsBrowseExperience, QuickApplyModal
- `frontend/src/components/trust/` — TrustBadge, TrustScoreCard, TrustStatusBanner
- `frontend/src/components/pricing/` — PlanCard, ComparisonTable, FeatureGate, RegionSelector
- `frontend/src/components/employer/` — ActivationChecklist, JobPostingPreview
- `frontend/src/components/ui/` — Primitive UI components (Badge, Button, Card, Input, Skeleton)

---

## Database Schema Summary

**Provider:** PostgreSQL (Prisma ORM). Full schema at `backend/prisma/schema.prisma`.

### Core Tables

| Table | Purpose |
|-------|---------|
| `User` | All users (ADMIN, CANDIDATE, EMPLOYER). Owns most domain relations. |
| `Employer` | Employer profile linked 1:1 to User |
| `CandidateProfile` | Candidate profile linked 1:1 to User |
| `Job` | Job listings (both EMPLOYER_POSTED and AGGREGATED). Includes trust/quality scoring fields. |
| `Application` | Candidate applications to jobs |
| `Subscription` | User plan (FREE/BASIC/PROFESSIONAL/EMPLOYER_FREE/EMPLOYER_BASIC/EMPLOYER_PREMIUM) |
| `AdminReview` | Moderation record for jobs, applications, resources |
| `MessageThread` / `Message` | Platform messaging |
| `Notification` | In-app notifications |

### Trust & Verification

| Table | Purpose |
|-------|---------|
| `CandidateTrustProfile` | Trust score + verification level for candidates |
| `EmployerTrustProfile` | Trust score + verification level for employers |
| `VerificationArtifact` | Documents submitted for identity/business verification |
| `TrustRiskEvent` | Risk signal log (entity-agnostic) |
| `TrustCase` | Moderation case with actions |
| `AbuseReport` | User-filed abuse/scam reports |
| `CandidateVerifiedSkill` | Partner-verified skills for candidates |
| `CandidatePartnerMarker` | University/bootcamp programme markers |

### Billing

| Table | Purpose |
|-------|---------|
| `UserBillingProfile` | Region, currency, country, grandfathering state |
| `RegionalPrice` | Plan × Region × Interval × Currency price matrix |
| `PlanEntitlement` | Feature quotas per plan (DB-driven, with hardcoded fallbacks) |
| `BillingEntitlementState` | Live entitlement consumption counters per user |
| `BillingEventAudit` | Full audit log of billing events (Stripe + Flutterwave webhooks) |
| `BillingDiscrepancy` | Detected subscription state mismatches |
| `BillingRegionAudit` | History of region changes |
| `RegionConfig` | Region metadata (currencies, countries, tax behaviour) |

### AI & Orchestration

| Table | Purpose |
|-------|---------|
| `AiRun` | Persisted orchestrator run record (fire-and-forget, never awaited in request path) |
| `SemanticDocument` | Embedding vectors + content for RAG (jobs and candidates) |
| `CandidateResumeVersion` | Versioned resume snapshots |
| `CandidateAutopilotProfile` | Autopilot settings and task history |
| `CandidateAgentTask` | Individual AI tasks for candidate autopilot |

### ATS Integration

| Table | Purpose |
|-------|---------|
| `ATSConnection` | Employer ATS provider connections (Greenhouse, Lever, Workable) |
| `ATSSyncLog` | Sync run history |
| `ATSApplicationLink` | Application cross-reference to ATS candidate ID |
| `ATSWebhookEvent` | Inbound ATS webhook payloads |

### Other Domain Tables

- `SavedSearch`, `JobAlert` — candidate search preferences and alert subscriptions
- `CalendarEvent` — interview/meeting scheduling
- `ChatConversation`, `ChatMessage`, `ChatConsent` — AI chat assistant
- `MockInterviewSession`, `MockInterviewArtifact` — AI-powered mock interviews
- `SocialProfile`, `SocialConnection` — professional networking
- `SalaryNegotiationSession` — AI salary negotiation coaching
- `CompanyReview`, `InterviewExperience`, `SalaryReport` — community content
- `UniversityPartner`, `UniversityRecord` — partner institution pipeline
- `BotSubscription` — WhatsApp/Telegram job alert subscriptions
- `EmployerTalentPool`, `EmployerTalentPoolCandidate` — employer talent pipeline management
- `AnalyticsEvent` — platform analytics event stream

---

## Authentication Flow

```
Browser                         Backend                         Redis
  |                               |                               |
  |-- POST /api/auth/login ------->|                               |
  |   { email, password,          |                               |
  |     botShield }               |                               |
  |                               |-- bcrypt.compare() ---------->|
  |                               |-- jwt.sign() (7d)             |
  |<-- Set-Cookie: auth_token=... |                               |
  |    (HttpOnly, Secure,         |                               |
  |     SameSite=Strict)          |                               |
  |                               |                               |
  |-- GET /api/auth/me ----------->|                               |
  |   (cookie auto-sent)          |-- verifyToken() ------------>|
  |                               |-- isTokenBlocked(token) ----->|
  |                               |   (fail-open if Redis down)   |
  |<-- { authenticated, user } ---|                               |
  |                               |                               |
  |-- POST /api/auth/logout ------>|                               |
  |                               |-- blockToken(token, ttl) ---->|
  |                               |   (Redis SET EX)              |
  |<-- 200 + clear cookie --------|                               |
```

**OAuth flow:** `POST /api/auth/oauth/google/callback` and `POST /api/auth/oauth/apple/callback` accept the provider token, validate it, upsert the `OAuthAccount` record, and return the same HttpOnly cookie.

**Role hierarchy:** ADMIN > EMPLOYER > CANDIDATE. `authorize(...roles)` middleware enforces role. `requireVerifiedEmail()` enforces email verification for CANDIDATE and EMPLOYER roles before sensitive operations.

---

## Payment / Subscription Flow

### Stripe (EUROPE / ROW regions)
```
Frontend          Backend                    Stripe
   |-- POST /api/billing/checkout -->|
   |   { plan, interval }            |-- resolveCheckoutProvider()
   |                                 |-- validateCheckoutSafety()
   |                                 |-- stripe.checkout.sessions.create()
   |<-- { url: stripe_checkout_url } |
   |                                 |
   |  [user completes payment on Stripe]
   |                                 |
   |                               Stripe --> POST /api/webhooks/stripe
   |                                 |-- verify stripe-signature
   |                                 |-- handle: checkout.session.completed
   |                                 |-- upsert Subscription + BillingEntitlementState
   |                                 |-- recordBillingEvent()
```

### Flutterwave (AFRICA region)
```
Frontend          Backend                    Flutterwave
   |-- POST /api/billing/checkout -->|
   |   { plan, interval }            |-- createFlutterwaveCheckout()
   |<-- { url: fw_payment_url,       |
   |      txRef, provider }          |
   |                                 |
   |  [user completes payment]       |
   |                                 |
   |-- POST /api/billing/verify-checkout -->|
   |   { provider: FLUTTERWAVE,             |-- verifyFlutterwaveTransaction()
   |     transactionId, txRef }             |-- update Subscription
   |                                        |
   |               Flutterwave --> POST /api/webhooks/flutterwave
   |                                 |-- verify X-Flutterwave-Signature
   |                                 |-- handle charge.completed
```

**Region resolution:** `backend/src/lib/billing/region-resolver.ts` resolves user region from `UserBillingProfile.region` (defaults to ROW). Users can self-select region via `POST /api/pricing/billing-country`.

---

## AI Orchestrator Architecture

Located in `backend/src/lib/ai/orchestrator/`. Invoked via `POST /api/orchestrator/run`.

**Three run types:**
- `resume_review` — parse resume only
- `job_match` — parse resume + score jobs
- `apply_pack` — parse + score + tailor resume + cover letter + truth guard

**Six agents (in pipeline order):**
1. `ResumeParserAgent` — extracts structured data from raw resume text
2. `JobParserAgent` — extracts structured data from raw job description text
3. `MatchScorerAgent` — scores resume against each job (0-100)
4. `ResumeTailorAgent` — rewrites resume sections for a specific job
5. `CoverLetterAgent` — generates cover letter given tailored resume
6. `TruthConsistencyGuardAgent` — validates no fabricated claims; retries once on FAIL

**Token budget:** Default 60,000 tokens per run. Budget is tracked and enforced per agent step; runs stop early with `status: "partial"` if exhausted.

**Mock mode:** `MOCK_AI=1` → returns deterministic stub output without calling Claude API.

**Kill switch:** `AI_DISABLED=1` → `/api/orchestrator/run` returns 503.

**Persistence:** `backend/src/lib/ai/persistence.ts` — `void createAiRun(...)` fire-and-forget; never awaited.

---

## Background Scheduler Architecture

`backend/src/workers/scheduler.ts` starts on server boot. Uses Redis distributed locks (fail-open) so only one App Runner replica runs each task.

| Worker | File | Default Interval |
|--------|------|-----------------|
| aggregator | `workers/aggregator-cron.ts` | 6 hours (runs immediately at boot+15s) |
| job-matcher | `workers/job-matcher.ts` | 30 minutes |
| alert-dispatch | `workers/alert-sender.ts` | 15 minutes |
| ops-snapshot | `workers/operational-snapshot.ts` | 15 minutes (boot+30s) |
| billing-reconciliation | `workers/billing-reconciliation.ts` | 24 hours (boot+60s) |
| candidate-retention | `workers/candidate-retention.ts` | 12 hours (boot+90s) |
| semantic-index | `workers/semantic-indexer.ts` | 12 hours (boot+120s) |
| auto-apply | `workers/auto-apply.ts` | configurable via `AUTO_APPLY_INTERVAL_MS` |
| job-cleanup | `workers/job-cleanup.ts` | configurable via `CLEANUP_INTERVAL_MS` |

Env flags: `DISABLE_SCHEDULER=1` disables all workers.

---

## Job Aggregation Architecture

`backend/src/lib/jobs/aggregator/` — multi-source job scraping pipeline.

**Sources (`aggregator/sources/`):**
- `adzuna.ts` — Adzuna API
- `apify.ts` — Apify web scraping tasks
- `arbeitnow.ts` — Arbeitnow job board
- `greenhouse.ts` — Greenhouse ATS public boards
- `himalayas.ts` — Himalayas remote jobs
- `jobberman.ts` — Jobberman (Africa)
- `jobsincyprus.ts` — JobsInCyprus
- `lever.ts` — Lever ATS public boards
- `remoteok.ts` — RemoteOK
- `weworkremotely.ts` — We Work Remotely
- `workable.ts` — Workable ATS public boards

All sources implement `base.ts` interface. Aggregated jobs are deduped by `sourceFingerprint` and scored for freshness/quality via `backend/src/lib/jobs/discovery.ts`.

---

## API Design Patterns

- All routes return JSON
- Errors: `{ error: string }` with appropriate HTTP status codes
- Validation: Zod schemas at route level (`z.parse()` / `z.safeParse()`)
- Pagination: `?page=&limit=` query params (varies by route)
- Auth: HttpOnly cookie or `Authorization: Bearer <token>` header (both accepted)
- Body size: 10KB limit globally; 250KB for `/api/orchestrator`
- Webhooks: raw body required, registered before `express.json()`
- OpenAPI spec: `GET /api/docs/spec.json`; Swagger UI: `GET /api/docs` (disabled in production unless `ENABLE_API_DOCS=true`)

---

## Deployment Architecture

```
                Internet
                   |
           [CloudFront CDN]
           /              \
    [Frontend App Runner]  [Backend App Runner]
    (Next.js SSR)          (Express API, port 4000)
           \              /
            [VPC]
             |       |
          [RDS]   [Redis]    [S3 Uploads]
       (PostgreSQL)  (optional,  (file storage)
                    token blocklist)
             |
      [AWS Secrets Manager]
      (DATABASE_URL, JWT_SECRET,
       ANTHROPIC_API_KEY,
       STRIPE_*, FLUTTERWAVE_*,
       ADZUNA_*, APIFY_TOKEN, etc.)
```

**AWS Services:**
- App Runner — backend and frontend containers (auto-scaling, managed TLS)
- ECR — container image registry
- RDS PostgreSQL — primary database (private subnets)
- S3 — file/resume uploads (presigned URLs via `POST /api/files/presign`)
- Secrets Manager — all secrets injected as environment variables at runtime
- CloudFront — CDN in front of frontend App Runner
- ACM — TLS certificates (auto-validated via Route 53 when configured)
- SES — transactional email
- CloudWatch Synthetics — canary health checks (`infra/terraform/canaries/`)

**Terraform modules:** `infra/terraform/modules/` — network, security, ecr, rds, secrets, s3, acm, apprunner, cloudfront, alb (standby), route53, github-oidc

**Environments:** `infra/terraform/envs/staging/` and `infra/terraform/envs/prod/`

**CI/CD:** GitHub Actions (`.github/workflows/`). OIDC role `GitHubActionsDeployRole` for AWS access. Backend runs `npx prisma migrate deploy` at container startup in staging.

---

## Data Flow Diagrams

### Candidate Job Search
```
Browser
  |-- GET /api/jobs?q=...&location=...
  |   (optionalAuth — personalisation if logged in)
  |
Backend
  |-- check in-memory cache (buildCacheKey)
  |-- if miss: buildJobSearchWhere() + fetchRankedJobs()
  |   (loads CandidateProfile preferences for ranking)
  |-- setCachedJson()
  |-- return paginated Job[]
```

### AI Apply Pack Flow
```
Frontend
  |-- POST /api/orchestrator/run
  |   { run_type: "apply_pack", resume_text, jobs: [...] }
  |   (orchestratorLimiter: 10/min per user)
  |
Backend
  |-- check daily quota (quotas middleware)
  |-- runOrchestrator()
  |   |-- ResumeParserAgent (Claude fast model)
  |   |-- JobParserAgent x N (Claude fast model, parallel budget)
  |   |-- MatchScorerAgent x N (Claude fast model)
  |   |-- sort by score descending
  |   |-- for top 5 eligible jobs (score >= 55, must-haves >= 60%):
  |       |-- ResumeTailorAgent (Claude quality model)
  |       |-- CoverLetterAgent (Claude quality model)
  |       |-- TruthConsistencyGuardAgent (retry once on FAIL)
  |-- void createAiRun(...) [fire-and-forget persistence]
  |-- return OrchestratorOutput
```

### Billing Webhook Processing
```
Stripe/Flutterwave
  |-- POST /api/webhooks/stripe  (raw body, verified by signature)
  |-- POST /api/webhooks/flutterwave
  |
Backend
  |-- verify webhook signature
  |-- parse event type
  |-- upsert Subscription record
  |-- upsert BillingEntitlementState
  |-- recordBillingEvent() → BillingEventAudit
  |-- detect discrepancies → BillingDiscrepancy
```
