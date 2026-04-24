# Codebase Structure

**Analysis Date:** 2026-04-09

---

## Root Layout

```
afri-tech/
├── backend/                 # Express 5 + Node.js 20 API
├── frontend/                # Next.js 16 App Router UI
├── infra/terraform/         # AWS infrastructure (Terraform)
├── .github/workflows/       # CI/CD pipelines
├── .planning/               # GSD planning documents
├── .agents/                 # Agent bootstrap files
├── .codex/                  # Codex operator skills
├── AGENTS.md                # Repo rules and build/test guidance
├── CLAUDE.md                # Claude start-here document
├── STAGING_RUNBOOK.md       # Live staging state and recovery
└── africa-recruit-app-extracted/  # Design reference (Figma stitch exports)
```

---

## Backend Structure

```
backend/
├── src/
│   ├── server.ts            # HTTP server entry point, graceful shutdown
│   ├── app.ts               # Express app wiring (middleware + all routes)
│   ├── instrument.ts        # Sentry instrumentation pre-load
│   ├── config/
│   │   └── env.ts           # Runtime env validation (validateRuntimeEnv)
│   ├── middleware/
│   │   ├── auth.ts          # authenticate, optionalAuth, authorize, requireVerifiedEmail
│   │   ├── security.ts      # Rate limiters (general/auth/register/orchestrator), sanitizeRequest
│   │   ├── bot-protection.ts  # validateHumanAuthSubmission, anonymousJobsLimiter
│   │   ├── account-standing.ts  # requireAccountStanding() — blocks restricted accounts
│   │   ├── feature-flags.ts   # Feature gate middleware
│   │   └── requestId.ts     # UUID per-request correlation ID
│   ├── routes/              # One file per resource group
│   │   ├── auth.ts              # POST register/login/logout, GET me
│   │   ├── password-reset.ts    # POST forgot-password, reset-password
│   │   ├── oauth.ts             # GET providers, POST google/apple callback
│   │   ├── email-verification.ts # POST send-verification/verify, GET status
│   │   ├── jobs.ts              # GET /, /:slug, /employer/my-jobs, /ai-search; POST, PUT, DELETE
│   │   ├── applications.ts      # POST /, GET /my, /job/:jobId, /:id; PUT /:id/status
│   │   ├── profile.ts           # GET/PUT /, GET /resumes; POST /resumes; GET /analytics
│   │   ├── billing.ts           # POST checkout/verify-checkout/portal, GET status
│   │   ├── webhooks.ts          # POST /stripe, /flutterwave
│   │   ├── ats.ts               # GET/POST connections; PUT/DELETE /:id; sync/retry/test
│   │   ├── ats-webhooks.ts      # POST /:provider/:connectionId
│   │   ├── admin.ts             # GET stats/jobs/users/resources; PUT job review
│   │   ├── admin-billing.ts     # GET dashboard/discrepancies; POST reconcile
│   │   ├── admin-trust.ts       # Trust dashboard, verification queue, risk queue
│   │   ├── admin-ats.ts         # GET dashboard
│   │   ├── admin-rag.ts         # GET status; POST documents/search/index
│   │   ├── orchestrator.ts      # POST /run, GET /runs
│   │   ├── chat.ts              # POST /message/conversations, GET /history
│   │   ├── chat-consent.ts      # GET/POST/DELETE consent
│   │   ├── autopilot.ts         # Candidate autopilot profile + tasks
│   │   ├── trust.ts             # Candidate/employer trust scores + verification
│   │   ├── talent.ts            # GET / (search), /:userId; talent pools CRUD
│   │   ├── employer-analytics.ts  # GET analytics/branding/onboarding
│   │   ├── employer-ai.ts       # GET tasks; POST drafts/review
│   │   ├── companies.ts         # GET / /:id /:id/reviews; POST reviews
│   │   ├── messages.ts          # GET/POST threads; POST messages; GET unread-count
│   │   ├── notifications.ts     # GET /; PUT /:id/read /read-all; GET unread-count
│   │   ├── saved-searches.ts    # CRUD + GET /:id/jobs
│   │   ├── aggregator.ts        # POST sync, GET sources/preview/stats (admin)
│   │   ├── pricing.ts           # GET /, /me, /regions; POST billing-country
│   │   ├── files.ts             # POST presign (S3 presigned URL)
│   │   ├── resume-parser.ts     # POST parse, /apply-draft
│   │   ├── job-extract.ts       # POST (2 endpoints for URL extraction)
│   │   ├── quick-apply.ts       # POST /, GET /eligible/:jobId
│   │   ├── salary-reports.ts    # GET / /compare /top-paying; POST
│   │   ├── salary-negotiation.ts # GET/POST sessions
│   │   ├── skills-assessments.ts # GET available/; POST; PUT /:id/complete
│   │   ├── mock-interviews.ts   # Full CRUD + feedback/artifacts/privacy
│   │   ├── social.ts            # GET/PUT profile; GET connections; POST request/respond
│   │   ├── calendar.ts          # Full CRUD calendar events
│   │   ├── candidate-analytics.ts # GET profile-views/application-funnel/recommendations
│   │   ├── resources.ts         # GET / /categories /:slug
│   │   ├── learning.ts          # GET categories/recommended/ /:id
│   │   ├── immigration.ts       # GET/POST processes and steps
│   │   ├── interview-experiences.ts # GET / /:id /companies/:id/summary; POST
│   │   ├── referrals.ts         # GET stats/ /; POST; PUT /:id/status
│   │   ├── push.ts              # GET/PUT preferences; POST subscribe/test; DELETE subscribe
│   │   ├── preferences.ts       # GET/PUT locale
│   │   ├── analytics-events.ts  # POST events; GET model/summary
│   │   ├── bots.ts              # GET/POST subscriptions; POST verify/preferences/test-alert/webhooks
│   │   ├── university-partners.ts # Admin partner CRUD + ingest endpoints
│   │   └── public.ts            # GET /stats (unauthenticated platform stats)
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── orchestrator/
│   │   │   │   ├── index.ts      # runOrchestrator() entry point
│   │   │   │   ├── agents.ts     # 6 Claude agent functions
│   │   │   │   ├── types.ts      # OrchestratorInput/Output, ResumeSchema, etc.
│   │   │   │   └── validators.ts # Zod schemas for agent outputs
│   │   │   ├── persistence.ts    # createAiRun() fire-and-forget
│   │   │   ├── claude.ts         # Anthropic SDK client
│   │   │   ├── chat-context.ts   # Chat conversation context management
│   │   │   ├── cover-letter.ts   # Standalone cover letter generation
│   │   │   ├── types.ts          # AI shared types
│   │   │   └── index.ts          # AI lib exports
│   │   ├── billing/
│   │   │   ├── index.ts          # Main billing exports
│   │   │   ├── entitlements.ts   # Entitlement lookup + defaults
│   │   │   ├── operations.ts     # Subscription create/update operations
│   │   │   ├── pricing.ts        # Price resolution logic
│   │   │   ├── providers.ts      # Provider selection (Stripe vs Flutterwave)
│   │   │   ├── provider-catalog.ts # Provider-specific catalog
│   │   │   ├── default-price-catalog.ts # Hardcoded fallback prices
│   │   │   ├── region-resolver.ts # User billing region resolution
│   │   │   ├── regions.ts        # Region definitions
│   │   │   └── grandfathering.ts # Legacy plan grandfathering
│   │   ├── rag/
│   │   │   ├── store.ts          # SemanticDocument upsert + cosine search
│   │   │   ├── embedding.ts      # Embedding generation (Anthropic)
│   │   │   ├── job-documents.ts  # Job → semantic document builder
│   │   │   ├── candidate-documents.ts # Candidate → semantic document builder
│   │   │   └── types.ts          # RAG types
│   │   ├── jobs/
│   │   │   ├── search.ts         # buildJobSearchWhere, fetchRankedJobs
│   │   │   ├── discovery.ts      # Job quality/freshness scoring
│   │   │   └── aggregator/       # Multi-source job aggregation (11 sources)
│   │   │       ├── index.ts      # Aggregator orchestration
│   │   │       ├── catalog.test.ts
│   │   │       ├── types.ts
│   │   │       └── sources/      # adzuna, apify, arbeitnow, greenhouse, himalayas,
│   │   │                         # jobberman, jobsincyprus, lever, remoteok,
│   │   │                         # weworkremotely, workable, base.ts
│   │   ├── trust/
│   │   │   ├── service.ts        # ensureTrustProfile, refreshTrustProfile, recordRiskEvent
│   │   │   ├── risk.ts           # assessJobPostingRisk, risk scoring functions
│   │   │   └── throwaway-domains.ts # Throwaway email domain list
│   │   ├── ats/
│   │   │   ├── service.ts        # ATS sync logic
│   │   │   └── providers.ts      # Greenhouse, Lever, Workable clients
│   │   ├── talent/
│   │   │   └── match.ts          # Candidate matching/scoring for talent search
│   │   ├── employer/
│   │   │   └── onboarding.ts     # Employer onboarding state machine
│   │   ├── autopilot/
│   │   │   └── framework.ts      # Candidate autopilot task framework
│   │   ├── ops/
│   │   │   ├── events.ts         # recordOpsEvent, recordLatencyMetric
│   │   │   └── resilience.ts     # withRetry, recordWorkerState, pushDeadLetter
│   │   ├── platform/
│   │   │   └── health.ts         # buildDegradedState
│   │   ├── prisma.ts             # Singleton Prisma client
│   │   ├── jwt.ts                # signToken, verifyToken
│   │   ├── redis.ts              # ioredis client, blockToken, isTokenBlocked
│   │   ├── logger.ts             # Pino logger
│   │   ├── cache.ts              # In-memory JSON cache with TTL
│   │   ├── email.ts              # AWS SES
│   │   ├── stripe.ts             # Stripe SDK singleton
│   │   ├── flutterwave.ts        # Flutterwave checkout + verification
│   │   ├── sentry.ts             # Sentry SDK
│   │   ├── swagger.ts            # OpenAPI spec builder
│   │   ├── push.ts               # Web Push notifications
│   │   ├── notifications.ts      # Notification creation helpers
│   │   ├── resume-parser.ts      # Resume parsing utility
│   │   ├── profile-completeness.ts # Profile completeness score
│   │   ├── candidate-retention.ts # Retention nudge logic
│   │   ├── secure-string.ts      # Secure string utilities
│   │   └── profile-completeness.ts
│   └── workers/
│       ├── scheduler.ts          # Proactive scheduler, Redis distributed locking
│       ├── aggregator-cron.ts    # Job aggregation cycle
│       ├── job-matcher.ts        # Score jobs vs saved searches
│       ├── alert-sender.ts       # Dispatch notifications/emails for matches
│       ├── auto-apply.ts         # Candidate autopilot auto-apply
│       ├── job-cleanup.ts        # Stale/expired job cleanup
│       ├── operational-snapshot.ts # Ops metrics snapshot
│       ├── billing-reconciliation.ts # Detect billing discrepancies
│       ├── candidate-retention.ts # Lifecycle nudge dispatch
│       └── semantic-indexer.ts   # Background embedding indexing
├── prisma/
│   ├── schema.prisma             # Full Prisma schema (all models + enums)
│   └── migrations/               # Timestamped migration history
├── scripts/
│   └── fixtures/                 # Seed/fixture scripts (run with npx tsx)
├── docker/                       # Docker build files
├── dist/                         # Compiled JS output (git-ignored)
└── package.json                  # Node.js + scripts
```

---

## Frontend Structure

```
frontend/
├── src/
│   ├── app/                      # Next.js App Router pages
│   │   ├── layout.tsx            # Root layout (ThemeProvider, AuthProvider, Header, Footer)
│   │   ├── page.tsx              # Homepage (redirects to /{locale})
│   │   ├── not-found.tsx         # 404 page
│   │   ├── global-error.tsx      # Next.js global error boundary
│   │   ├── globals.css           # Tailwind v4 base styles
│   │   ├── robots.ts             # robots.txt
│   │   ├── [locale]/             # Locale-prefixed pages (en/fr/pt/ar)
│   │   │   ├── layout.tsx        # Locale validation (404 for unsupported)
│   │   │   ├── page.tsx          # Locale home
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   ├── jobs/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [slug]/page.tsx
│   │   │   ├── candidate/
│   │   │   │   ├── page.tsx      # Candidate dashboard
│   │   │   │   ├── profile/page.tsx
│   │   │   │   ├── resumes/page.tsx
│   │   │   │   ├── ai-assistant/page.tsx
│   │   │   │   ├── chat/page.tsx
│   │   │   │   ├── saved-searches/page.tsx
│   │   │   │   └── trust/page.tsx
│   │   │   ├── employer/
│   │   │   │   ├── page.tsx      # Employer dashboard
│   │   │   │   ├── jobs/new/page.tsx
│   │   │   │   ├── talent/page.tsx
│   │   │   │   ├── analytics/page.tsx
│   │   │   │   ├── onboarding/page.tsx
│   │   │   │   ├── integrations/page.tsx
│   │   │   │   └── trust/page.tsx
│   │   │   ├── admin/
│   │   │   │   ├── trust/page.tsx
│   │   │   │   ├── integrations/page.tsx
│   │   │   │   └── partners/page.tsx
│   │   │   ├── billing/page.tsx
│   │   │   ├── pricing/page.tsx
│   │   │   ├── companies/page.tsx
│   │   │   ├── messages/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── notifications/page.tsx
│   │   │   ├── trust/
│   │   │   │   ├── page.tsx
│   │   │   │   └── report/page.tsx
│   │   │   ├── immigration/page.tsx
│   │   │   ├── interviews/page.tsx
│   │   │   ├── learning/page.tsx
│   │   │   └── salaries/page.tsx
│   │   ├── admin/                # Admin panel (no locale prefix)
│   │   │   ├── page.tsx
│   │   │   ├── billing/page.tsx
│   │   │   ├── integrations/page.tsx
│   │   │   ├── partners/page.tsx
│   │   │   ├── reviews/page.tsx
│   │   │   ├── trust/page.tsx
│   │   │   └── users/page.tsx
│   │   ├── candidate/            # Candidate section (no locale prefix)
│   │   │   ├── page.tsx
│   │   │   ├── ai-assistant/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   ├── applications/page.tsx
│   │   │   ├── calendar/page.tsx
│   │   │   ├── chat/page.tsx
│   │   │   ├── preferences/page.tsx
│   │   │   ├── profile/page.tsx
│   │   │   ├── referrals/page.tsx
│   │   │   ├── resumes/page.tsx
│   │   │   ├── saved-searches/page.tsx
│   │   │   ├── skills/page.tsx
│   │   │   └── trust/page.tsx
│   │   ├── employer/             # Employer section (no locale prefix)
│   │   │   ├── page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   ├── integrations/page.tsx
│   │   │   ├── jobs/
│   │   │   │   ├── [id]/applications/page.tsx
│   │   │   │   ├── [id]/edit/page.tsx
│   │   │   │   └── new/page.tsx
│   │   │   ├── onboarding/page.tsx
│   │   │   ├── talent/page.tsx
│   │   │   └── trust/page.tsx
│   │   ├── jobs/                 # Public job board (no locale prefix)
│   │   │   ├── page.tsx
│   │   │   ├── [slug]/page.tsx
│   │   │   ├── [slug]/error.tsx
│   │   │   └── [slug]/loading.tsx
│   │   ├── companies/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── billing/
│   │   │   ├── page.tsx
│   │   │   └── success/page.tsx
│   │   ├── auth/
│   │   │   ├── callback/page.tsx  # OAuth callback landing
│   │   │   └── apple/callback/route.ts  # Apple OAuth server-side route
│   │   ├── trust/
│   │   │   ├── page.tsx
│   │   │   └── report/page.tsx
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── reset-password/page.tsx
│   │   ├── verify-email/page.tsx
│   │   ├── pricing/page.tsx
│   │   ├── resources/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/page.tsx
│   │   ├── salaries/page.tsx
│   │   ├── interviews/page.tsx
│   │   ├── learning/page.tsx
│   │   ├── immigration/page.tsx
│   │   ├── messages/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── notifications/page.tsx
│   │   ├── accessibility/page.tsx
│   │   ├── privacy-policy/page.tsx
│   │   ├── terms-of-service/page.tsx
│   │   └── cookies-policy/page.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── header.tsx
│   │   │   ├── footer.tsx
│   │   │   ├── language-switcher.tsx
│   │   │   ├── network-status-banner.tsx
│   │   │   └── theme-toggle.tsx
│   │   ├── jobs/
│   │   │   ├── job-card.tsx
│   │   │   ├── job-filters.tsx
│   │   │   ├── job-apply-panel.tsx
│   │   │   ├── job-jsonld.tsx           # Structured data (JSON-LD)
│   │   │   ├── jobs-browse-experience.tsx
│   │   │   ├── jobs-search-shell.tsx
│   │   │   └── quick-apply-modal.tsx
│   │   ├── trust/
│   │   │   ├── trust-badge.tsx
│   │   │   ├── trust-checklist.tsx
│   │   │   ├── trust-explainer-modal.tsx
│   │   │   ├── trust-score-card.tsx
│   │   │   ├── trust-status-banner.tsx
│   │   │   └── trust-support-card.tsx
│   │   ├── pricing/
│   │   │   ├── comparison-table.tsx
│   │   │   ├── faq-section.tsx
│   │   │   ├── feature-gate.tsx
│   │   │   ├── plan-card.tsx
│   │   │   ├── pricing-data.ts
│   │   │   └── region-selector.tsx
│   │   ├── employer/
│   │   │   ├── activation-checklist.tsx
│   │   │   ├── activation-milestones.tsx
│   │   │   └── job-posting-preview.tsx
│   │   ├── home/
│   │   │   ├── hero-stats.tsx
│   │   │   └── home-page.tsx
│   │   ├── notifications/
│   │   │   ├── candidate-preference-center.tsx
│   │   │   └── push-opt-in.tsx
│   │   ├── auth/
│   │   │   └── oauth-buttons.tsx
│   │   └── ui/                  # Primitive components
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── retry-button.tsx
│   │       └── skeleton.tsx
│   ├── lib/
│   │   ├── api.ts               # fetchAPI() + all domain API functions
│   │   ├── auth-context.tsx     # AuthContext (login/register/logout + session restore)
│   │   ├── theme-context.tsx    # ThemeContext (light/dark)
│   │   ├── bot-shield.ts        # Bot honeypot/timing payload builder
│   │   ├── analytics.ts         # Frontend analytics helpers
│   │   ├── job-description.ts   # Job description formatting
│   │   ├── jobs-search.ts       # Job search utilities
│   │   ├── salary.ts            # Salary formatting
│   │   ├── password-strength.ts # Password strength checker
│   │   ├── push-client.ts       # Web Push subscription client
│   │   ├── trust-files.ts       # Trust document upload helpers
│   │   ├── trust-labels.ts      # Trust level label strings
│   │   ├── network-profile.ts   # Network/social profile helpers
│   │   ├── server-public-api.ts # Server-side public API calls (Next.js RSC)
│   │   ├── i18n/
│   │   │   ├── config.ts        # SUPPORTED_LOCALES, DEFAULT_LOCALE, isSupportedLocale
│   │   │   ├── client.ts        # Client-side i18n helpers
│   │   │   └── messages.ts      # Translation message maps
│   │   └── api/
│   │       ├── orchestratorClient.ts  # Type-safe orchestrator API client
│   │       └── orchestratorTypes.ts   # Orchestrator request/response types
└── middleware.ts                # i18n locale redirect middleware
```

---

## Shared Types / Contracts

There is no shared package between frontend and backend. Types are duplicated at boundaries:

- **Backend types:** Prisma-generated types from `backend/node_modules/.prisma/client` + manual types in `backend/src/lib/ai/orchestrator/types.ts`
- **Frontend API types:** Defined inline in `frontend/src/lib/api.ts` (User, Job, Application interfaces) and `frontend/src/lib/api/orchestratorTypes.ts`

**When adding a new field to an API response:**
1. Update the Prisma schema and migration if it's a DB field
2. Update the route handler return shape in `backend/src/routes/`
3. Update the corresponding TypeScript interface in `frontend/src/lib/api.ts`

---

## Key Entry Points

| Purpose | Path |
|---------|------|
| Backend server start | `backend/src/server.ts` |
| Express app + all routes | `backend/src/app.ts` |
| Prisma schema | `backend/prisma/schema.prisma` |
| Frontend root layout | `frontend/src/app/layout.tsx` |
| i18n middleware | `frontend/middleware.ts` |
| Frontend API client | `frontend/src/lib/api.ts` |
| Auth context | `frontend/src/lib/auth-context.tsx` |
| Orchestrator entry | `backend/src/lib/ai/orchestrator/index.ts` |
| Background scheduler | `backend/src/workers/scheduler.ts` |
| Terraform root | `infra/terraform/main.tf` |

---

## Route Inventory (All API Routes)

### Health / Status
```
GET  /health
GET  /api/health
GET  /ready
GET  /api/ready
GET  /live
GET  /api/live
GET  /api/docs
GET  /api/docs/spec.json
GET  /api/public/stats
```

### Auth
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/forgot-password
POST /api/auth/reset-password
GET  /api/auth/oauth/providers
POST /api/auth/oauth/google/callback
POST /api/auth/oauth/apple/callback
POST /api/auth/email/send-verification
POST /api/auth/email/verify
GET  /api/auth/email/status
```

### Jobs
```
GET  /api/jobs
GET  /api/jobs/:slug
GET  /api/jobs/employer/my-jobs
GET  /api/jobs/ai-search
POST /api/jobs
PUT  /api/jobs/:id
DELETE /api/jobs/:id
```

### Applications
```
POST /api/applications
GET  /api/applications/my
GET  /api/applications/job/:jobId
PUT  /api/applications/:id/status
GET  /api/applications/:id
```

### Profile
```
GET  /api/profile
PUT  /api/profile
GET  /api/profile/resumes
POST /api/profile/resumes
GET  /api/profile/analytics
POST /api/profile/resume-parser
POST /api/profile/resume-parser/apply-draft
```

### Billing
```
POST /api/billing/checkout
POST /api/billing/verify-checkout
POST /api/billing/portal
GET  /api/billing/status
POST /api/webhooks/stripe
POST /api/webhooks/flutterwave
```

### Pricing
```
GET  /api/pricing
GET  /api/pricing/me
POST /api/pricing/billing-country
GET  /api/pricing/regions
GET  /api/pricing/payment-localization
GET  /api/pricing/entitlements/:plan
```

### AI Orchestrator
```
POST /api/orchestrator/run
GET  /api/orchestrator/runs
```

### Chat
```
POST /api/chat/message
GET  /api/chat/history
POST /api/chat/conversations
DELETE /api/chat/conversations/:id
GET  /api/chat/consent
POST /api/chat/consent
DELETE /api/chat/consent
```

### Autopilot
```
GET  /api/autopilot              (profile)
GET  /api/autopilot/tasks
POST /api/autopilot              (create profile)
GET  /api/autopilot/resumes
POST /api/autopilot/resumes
POST /api/autopilot/tasks
POST /api/autopilot/tasks/:id
```

### Talent (Employer)
```
GET  /api/talent
GET  /api/talent/compare
GET  /api/talent/:userId
GET  /api/talent/pools
POST /api/talent/pools
POST /api/talent/pools/:poolId/candidates
PATCH /api/talent/pools/:poolId/candidates/:candidateUserId
DELETE /api/talent/pools/:poolId/candidates/:candidateUserId
```

### Employer
```
GET  /api/employer/analytics
GET  /api/employer/analytics/advanced
GET  /api/employer/branding
PUT  /api/employer/branding
GET  /api/employer/onboarding
PUT  /api/employer/onboarding
POST /api/employer/onboarding/job-preview
GET  /api/employer/ai/tasks
POST /api/employer/ai/job-description-drafts
POST /api/employer/ai/candidate-ranking-drafts
POST /api/employer/ai/tasks/:id/review
```

### Trust
```
GET  /api/trust                  (candidate trust profile)
PUT  /api/trust                  (update trust data)
POST /api/trust/...              (multiple trust actions — verification artifacts, etc.)
GET  /api/trust/messaging-guidance
```

### ATS
```
GET  /api/ats/dashboard
GET  /api/ats/connections
POST /api/ats/connections
PUT  /api/ats/connections/:id
DELETE /api/ats/connections/:id
GET  /api/ats/connections/:id/logs
POST /api/ats/connections/:id/test
POST /api/ats/connections/:id/sync
POST /api/ats/connections/:id/retry
POST /api/ats/webhooks/:provider/:connectionId
```

### Admin
```
GET  /api/admin/stats
GET  /api/admin/operations/overview
GET  /api/admin/operations/dead-letters
GET  /api/admin/jobs/pending
GET  /api/admin/jobs
PUT  /api/admin/jobs/:id/review
GET  /api/admin/users
GET  /api/admin/resources
PUT  /api/admin/resources/:id/publish
GET  /api/admin/reviews
PUT  /api/admin/reviews/:id/moderate
GET  /api/admin/aggregator/stats
POST /api/admin/aggregator/sync
GET  /api/admin/ats/dashboard
GET  /api/admin/billing/dashboard
GET  /api/admin/billing/discrepancies
GET  /api/admin/billing/reconciliation-runs
POST /api/admin/billing/reconcile
GET  /api/admin/billing/customers/search
GET  /api/admin/billing/customers/:userId
POST /api/admin/billing/customers/:userId/resync-entitlements
POST /api/admin/billing/customers/:userId/actions
GET  /api/admin/trust/dashboard
GET  /api/admin/trust/verification-queue
POST /api/admin/trust/artifacts/:id/review
GET  /api/admin/trust/risk-queue
POST /api/admin/trust/cases/:id/actions
GET  /api/admin/trust/reports
POST /api/admin/trust/reports/:id/action
GET  /api/admin/rag/status
POST /api/admin/rag/documents
POST /api/admin/rag/search
POST /api/admin/rag/index/jobs
POST /api/admin/rag/index/candidates
```

### Community / Content
```
GET  /api/resources
GET  /api/resources/categories
GET  /api/resources/:slug
GET  /api/companies
GET  /api/companies/:id
GET  /api/companies/:id/reviews
POST /api/companies/:id/reviews
POST /api/companies/:id/reviews/:reviewId/helpful
PATCH /api/companies/:id/reviews/:reviewId/moderate
GET  /api/salary-reports
GET  /api/salary-reports/compare
GET  /api/salary-reports/top-paying
POST /api/salary-reports
GET  /api/salary-negotiation/sessions
GET  /api/salary-negotiation/sessions/:id
POST /api/salary-negotiation/sessions
GET  /api/interview-experiences
GET  /api/interview-experiences/companies/:companyId/summary
GET  /api/interview-experiences/:id
POST /api/interview-experiences
POST /api/interview-experiences/:id/helpful
GET  /api/learning/categories
GET  /api/learning/recommended
GET  /api/learning
GET  /api/learning/:id
GET  /api/immigration/templates
GET  /api/immigration/processes
GET  /api/immigration/processes/:id
POST /api/immigration/processes
PUT  /api/immigration/processes/:id
DELETE /api/immigration/processes/:id
POST /api/immigration/processes/:id/steps
PUT  /api/immigration/processes/:id/steps/:stepId
```

### Candidate Features
```
GET  /api/candidate-analytics/profile-views
GET  /api/candidate-analytics/application-funnel
GET  /api/candidate-analytics/recommendations
GET  /api/candidate-analytics/retention-summary
GET  /api/saved-searches
POST /api/saved-searches
PUT  /api/saved-searches/:id
DELETE /api/saved-searches/:id
GET  /api/saved-searches/:id/jobs
GET  /api/skills-assessments/available
GET  /api/skills-assessments
POST /api/skills-assessments
PUT  /api/skills-assessments/:id/complete
GET  /api/mock-interviews
POST /api/mock-interviews
GET  /api/mock-interviews/:id
POST /api/mock-interviews/:id/feedback
POST /api/mock-interviews/:id/privacy
POST /api/mock-interviews/:id/artifacts
GET  /api/referrals/stats
GET  /api/referrals
POST /api/referrals
PUT  /api/referrals/:id/status
GET  /api/quick-apply/eligible/:jobId
POST /api/quick-apply
```

### Messaging & Notifications
```
GET  /api/messages/threads
GET  /api/messages/threads/:id
POST /api/messages/threads
POST /api/messages/threads/:id/messages
GET  /api/messages/unread-count
GET  /api/notifications
GET  /api/notifications/unread-count
PUT  /api/notifications/:id/read
PUT  /api/notifications/read-all
```

### Social & Calendar
```
GET  /api/social/profile
PUT  /api/social/profile
GET  /api/social/connections
POST /api/social/connections/request
POST /api/social/connections/:id/respond
GET  /api/calendar/upcoming
GET  /api/calendar
GET  /api/calendar/:id
POST /api/calendar
PUT  /api/calendar/:id
DELETE /api/calendar/:id
```

### Push & Preferences
```
GET  /api/push/vapid-public-key
GET  /api/push/preferences
PUT  /api/push/preferences
POST /api/push/subscribe
DELETE /api/push/subscribe
POST /api/push/test
GET  /api/preferences/locale
PUT  /api/preferences/locale
```

### Files & Extraction
```
POST /api/files/presign
POST /api/job-extract              (2 endpoints for URL-based job extraction)
```

### Aggregator
```
POST /api/aggregator/sync
GET  /api/aggregator/sources
GET  /api/aggregator/preview
GET  /api/aggregator/stats
```

### Analytics Events
```
POST /api/analytics/events
GET  /api/analytics/model
GET  /api/analytics/summary
```

### Bots (WhatsApp/Telegram)
```
GET  /api/bots/subscriptions
POST /api/bots/subscriptions
POST /api/bots/subscriptions/:id/verify
PATCH /api/bots/subscriptions/:id/preferences
POST /api/bots/subscriptions/:id/test-alert
POST /api/bots/webhooks/:channel
```

### University Partners
```
POST /api/university-partners/admin/partners
GET  /api/university-partners/admin/partners
GET  /api/university-partners/admin/partners/:partnerId/records
POST /api/university-partners/admin/partners/:partnerId/markers
POST /api/university-partners/admin/partners/:partnerId/verified-skills
GET  /api/university-partners/ingest
POST /api/university-partners/ingest/internships
POST /api/university-partners/ingest/graduates
POST /api/university-partners/ingest/skills-verifications
```

---

## Environment Configuration

### Backend Required Variables
```
DATABASE_URL              # PostgreSQL connection string
FRONTEND_URL              # Allowed CORS origin
JWT_SECRET                # (required in production/staging)
```

### Backend Optional / Feature Variables
```
REDIS_URL                 # Token blocklist (graceful degradation if absent)
ANTHROPIC_API_KEY         # Claude API (AI features)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
FLUTTERWAVE_SECRET_KEY
FLUTTERWAVE_SECRET_HASH
S3_UPLOADS_BUCKET
AWS_REGION / SES_REGION
SES_FROM_EMAIL
SENTRY_DSN
MOCK_AI=1                 # Stubs all Claude calls (dev/test)
AI_DISABLED=1             # Kill switch — 503 on all AI routes
ENABLE_API_DOCS=true      # Expose Swagger UI in production
DISABLE_SCHEDULER=1       # Skip all background workers
AGGREGATOR_INTERVAL_HOURS  # Default: 6
MATCHER_INTERVAL_MINUTES   # Default: 30
ALERT_INTERVAL_MINUTES     # Default: 15
```

### Frontend Required Variables
```
NEXT_PUBLIC_API_URL       # Backend base URL (e.g. https://api.afritalent.com)
```

### Frontend Optional Variables
```
NEXT_PUBLIC_DEFAULT_LOCALE  # Default: en
```

---

## Where to Add New Code

**New API route:**
1. Create `backend/src/routes/{resource}.ts`
2. Register in `backend/src/app.ts` with `app.use("/api/{resource}", ...)`
3. Add corresponding API functions to `frontend/src/lib/api.ts`

**New database model:**
1. Add to `backend/prisma/schema.prisma`
2. Run `cd backend && npx prisma migrate dev --name {description}`
3. Prisma client auto-regenerates

**New frontend page:**
1. Add `frontend/src/app/{path}/page.tsx`
2. If locale-prefixed, also add `frontend/src/app/[locale]/{path}/page.tsx`
3. Update i18n middleware `shouldLocalize()` in `frontend/middleware.ts` if locale redirect is needed

**New background worker:**
1. Create `backend/src/workers/{name}.ts` with a `run{Name}Cycle()` export
2. Import and register in `backend/src/workers/scheduler.ts`

**New job aggregation source:**
1. Create `backend/src/lib/jobs/aggregator/sources/{name}.ts` implementing the `base.ts` interface
2. Register in `backend/src/lib/jobs/aggregator/index.ts`

**New AI agent:**
1. Add agent function to `backend/src/lib/ai/orchestrator/agents.ts`
2. Add Zod validator to `backend/src/lib/ai/orchestrator/validators.ts`
3. Add type definitions to `backend/src/lib/ai/orchestrator/types.ts`
4. Wire into pipeline in `backend/src/lib/ai/orchestrator/index.ts`

**New shared UI component:**
- Primitive (Button, Input, etc.): `frontend/src/components/ui/`
- Domain component: `frontend/src/components/{domain}/`
