# Codebase Concerns

**Analysis Date:** 2026-04-09

---

## Known Bugs / Issues

**Timestamp-based slug collision in job creation:**
- Issue: `generateSlug()` in `backend/src/routes/jobs.ts` (line 44-49) appends `Date.now().toString(36)` as the unique suffix. Under concurrent writes, two jobs created in the same millisecond will produce identical slugs, causing a DB unique constraint violation.
- Files: `backend/src/routes/jobs.ts`
- Impact: Rare in development, real risk under load or job aggregator bulk-import.
- Fix: Replace with `nanoid(8)` as documented in `CLAUDE_CODE_FIXES.md` FIX-10.

**Job hard-delete with applications causes DB error:**
- Issue: `Job` model has no `deletedAt` field. `DELETE /api/jobs/:id` issues a hard delete. `Application.jobId` FK uses `ON DELETE RESTRICT`. Employers cannot delete jobs that have any applications — the query throws a Prisma foreign key constraint error.
- Files: `backend/src/routes/jobs.ts`, `backend/prisma/schema.prisma`
- Impact: Employers cannot remove job listings once a candidate applies. No soft-delete pattern exists in schema yet.
- Fix: Add `deletedAt DateTime?` to `Job` model, migrate, filter `deletedAt: null` everywhere. Documented in `CLAUDE_CODE_FIXES.md` FIX-8.

**Lever aggregator source yields zero matches:**
- Issue: Lever connectivity is restored in staging but the configured Plaid site token produces `matchedCount=0` for every sync run because the postings are stale or non-remote.
- Files: `backend/src/lib/jobs/aggregator/sources/lever.ts`
- Impact: Lever is effectively a dead source in production. Job count depends entirely on Greenhouse and other sources.
- Fix: Rotate Lever site token or add a different Lever company. Documented in `STAGING_RUNBOOK.md`.

**Staging entrypoint patches Prisma migration ledger at startup:**
- Issue: `backend/docker/entrypoint.sh` hard-deletes the failed row `20260329003000_add_candidate_authenticity_layer` from `_prisma_migrations` before running `prisma migrate deploy`. This is a manual ledger repair baked into the container boot path.
- Files: `backend/docker/entrypoint.sh`
- Impact: If this migration row ever reappears or the entrypoint script is removed, migrations fail at startup. The staging DB migration history is not clean.
- Fix: Run a proper cleanup migration pass to normalize the staging migration ledger and remove the entrypoint hack.

**`DRAFT` job status exists in enum but is not honored by POST `/api/jobs`:**
- Issue: `JobStatus.DRAFT` is defined in the Prisma schema but `POST /api/jobs` always sets `status: JobStatus.PENDING_REVIEW`. Employers cannot save a draft.
- Files: `backend/src/routes/jobs.ts`
- Fix: Add `saveDraft` boolean to `createJobSchema`. Documented in `CLAUDE_CODE_FIXES.md` FIX-9.

---

## Security Concerns

**JWT stored in localStorage (partially resolved, not fully verified):**
- Risk: `CLAUDE_CODE_FIXES.md` identifies JWT in localStorage as a P0 XSS vector. `backend/src/lib/auth-context.tsx` comment says "No localStorage" but this was added as part of a fix pass and should be verified against the live auth flow.
- Files: `frontend/src/lib/auth-context.tsx`, `backend/src/routes/auth.ts`, `backend/src/middleware/auth.ts`
- Current mitigation: Code comment says localStorage is not used; cookie-based auth appears to be implemented.
- Risk remains: Not independently verified that all frontend paths (OAuth, deep links) avoid localStorage.

**No JWT blocklist — revoked sessions remain valid for 7 days:**
- Risk: JWT expiry is 7 days. There is no Redis-backed blocklist. Logging out does not invalidate the token on the server side.
- Files: `backend/src/lib/jwt.ts`, `backend/src/middleware/auth.ts`
- Current mitigation: None. Redis infrastructure exists in staging but blocklist is not implemented.
- Fix: Add `jti` claim, implement `blockToken`/`isTokenBlocked` via Redis. Documented in `CLAUDE_CODE_FIXES.md` FIX-4.

**Employer authorization gap on `GET /api/applications/:id`:**
- Risk: Any authenticated employer can view any application by guessing the application UUID. The route checks `role === EMPLOYER` but not whether the employer owns the job.
- Files: `backend/src/routes/applications.ts`
- Fix: Cross-reference `application.job.employerId === employer.id`. Documented in `CLAUDE_CODE_FIXES.md` FIX-2.

**No Zod validation on `PUT /api/admin/resources/:id/publish`:**
- Risk: `req.body.published` is read raw without schema validation. A non-boolean value is passed directly to the DB query.
- Files: `backend/src/routes/admin.ts`
- Fix: Add `publishResourceSchema`. Documented in `CLAUDE_CODE_FIXES.md` FIX-3.

**`cvUrl` field accepts any URL including `http://` and internal network addresses:**
- Risk: SSRF risk if the backend ever fetches this URL; also data integrity concern.
- Files: `backend/src/routes/applications.ts`
- Fix: Enforce `https://` prefix and optional domain allowlist via `ALLOWED_CV_DOMAINS`. Documented in `CLAUDE_CODE_FIXES.md` FIX-7.

**Staging may be using Stripe live-mode credentials:**
- Risk: `STAGING_RUNBOOK.md` explicitly notes the Stripe credentials supplied during April 8 setup are live-mode keys, not test keys. Live charges could be processed in a shared test environment.
- Files: `infra/terraform/envs/staging/terraform.tfvars` (secrets in Secrets Manager, not in repo)
- Current mitigation: Runbook warns against this but does not confirm which mode is active.
- Recommended action: Verify and rotate staging to Stripe test-mode keys before any interactive checkout testing.

**`subscription.ts` middleware uses `console.error` — security events bypass Pino redaction:**
- Risk: Subscription check errors logged via `console.error` bypass Pino's field redaction, potentially leaking sensitive fields in aggregated logs.
- Files: `backend/src/middleware/subscription.ts` (line 49)

---

## Performance Bottlenecks

**Job search uses `ILIKE '%term%'` — sequential full table scan:**
- Problem: `backend/src/lib/jobs/search.ts` (lines 113-116) uses `contains` with `mode: "insensitive"` for title, description, and sourceName. This compiles to `ILIKE '%term%'` in PostgreSQL — cannot use standard B-tree indexes.
- Files: `backend/src/lib/jobs/search.ts`
- Cause: No full-text search index exists. No `searchVector tsvector` column or GIN index in schema.
- Impact: Every keyword search is a sequential scan. Will not scale past a few thousand jobs.
- Improvement: Add PostgreSQL full-text search trigger + GIN index. Documented in `CLAUDE_CODE_FIXES.md` FIX-13.

**Semantic search performs in-process cosine similarity over full table fetch:**
- Problem: `backend/src/lib/rag/store.ts` (line 143-167) fetches up to 500 documents from the `SemanticDocument` table into memory, then computes cosine similarity in JavaScript. No vector index in the database.
- Files: `backend/src/lib/rag/store.ts`, `backend/src/lib/rag/embedding.ts`
- Cause: `SemanticDocument.embedding` is stored as `Float[]` (plain PostgreSQL array), not a `pgvector` column. Prisma does not support pgvector natively.
- Impact: Semantic search latency grows linearly with document count. At thousands of indexed jobs/candidates, this will be too slow for real-time queries.
- Improvement path: Migrate `embedding` column to pgvector's `vector` type, add `ivfflat` or `hnsw` index, use raw SQL for ANN search instead of in-process brute force.

**Default embedding provider is a hash function, not a real embedding model:**
- Problem: `backend/src/lib/rag/embedding.ts` defaults `SEMANTIC_EMBEDDING_PROVIDER` to `"hash"`. This uses a SHA-256 token hashing scheme (`generateHashEmbedding`) that produces poor semantic similarity scores.
- Files: `backend/src/lib/rag/embedding.ts`
- Impact: Semantic matching and candidate-to-job retrieval quality is low unless `OPENAI_API_KEY` is configured and `SEMANTIC_EMBEDDING_PROVIDER=openai` is set.
- Current state: In staging, whether OpenAI embeddings are configured is not confirmed. The runbook notes "semantic retrieval foundation exists but has not been deployed or indexed in staging yet."

**No Redis caching on job listings or public stats:**
- Problem: `PERFORMANCE.md` identifies caching as a "short-term when needed" item. Every public `GET /api/jobs` request hits PostgreSQL. Public stats endpoint (`/api/public/stats`) is also uncached.
- Files: `backend/src/lib/cache.ts` exists but usage is limited to specific paths.
- Impact: Under any real traffic, the DB will be the bottleneck on read-heavy public pages.

**Pagination `limit` cap not universally enforced:**
- Problem: `CLAUDE_CODE_FIXES.md` FIX-5 identifies that paginated endpoints accept arbitrary `limit` values with no upper bound cap.
- Files: `backend/src/routes/jobs.ts`, `backend/src/routes/admin.ts`
- Impact: A caller can request all rows in a single query.

---

## Technical Debt

**Zod import inconsistency — 40 files use bare `"zod"`, only 2 use `"zod/v4"`:**
- Issue: Project uses Zod v4 (`"zod": "^4.3.6"` in `package.json`). The correct import for Zod v4 is `import { z } from "zod/v4"`. However, 40 source files import from bare `"zod"` (the v3 compatibility shim), while only `backend/src/lib/ai/orchestrator/index.ts` and one other file use `"zod/v4"`.
- Files: All files in `backend/src/routes/` plus many in `backend/src/lib/`
- Impact: Mixed behavior between v3 compatibility layer and v4 native API. Error message formats, `z.ZodError` handling, and some schema methods differ between shims.
- Fix: Standardize all imports to `"zod/v4"` across the codebase.

**`console.error` used across 30+ route files instead of Pino logger:**
- Issue: `CLAUDE_CODE_FIXES.md` FIX-6 identifies this as a P1 issue. Files including `admin-rag.ts`, `oauth.ts`, `learning.ts`, `webhooks.ts`, `candidate-analytics.ts`, `resources.ts`, `notifications.ts`, `pricing.ts`, `subscription.ts`, and many more use raw `console.error` in catch blocks.
- Files: Most files in `backend/src/routes/`
- Impact: Errors bypass Pino's structured JSON format, redaction of sensitive fields (`authorization`, `cookie`, `password`, `token`), and request correlation ID injection. Log aggregation is unreliable for these paths.

**No API versioning — all routes at `/api/*`:**
- Issue: 50+ routes are registered at `/api/<name>` with no version prefix. Future breaking changes require simultaneous client updates.
- Files: `backend/src/app.ts` (lines 292-384)
- Fix: Mount routes at `/api/v1/` with backward-compatible aliases. Documented in `CLAUDE_CODE_FIXES.md` FIX-12.

**In-memory AI quota tracker resets on process restart:**
- Issue: `backend/src/lib/ai/index.ts` uses a `Map` for per-user hourly quota tracking. This resets on every deploy or crash. Users can exhaust the quota, get a new window by timing a restart, or exceed limits across multiple instances.
- Files: `backend/src/lib/ai/index.ts`
- Impact: Quota enforcement is approximate only. Dual-layer: per-user hourly in-memory quota AND per-run-type daily DB-backed quota (`backend/src/middleware/quotas.ts`). The two systems are not coordinated.

**`requirePlan` middleware is defined but never applied to any route:**
- Issue: `backend/src/middleware/subscription.ts` exports `requirePlan(minimumPlan)` but grep of the entire codebase shows zero call sites in routes or app registration. Subscription plan enforcement is purely honor-system at the UI level.
- Files: `backend/src/middleware/subscription.ts`
- Impact: Any authenticated candidate or employer can call any API endpoint regardless of subscription tier. Premium feature gating does not exist at the API layer.

**Prisma migration ledger repaired via startup script in entrypoint:**
- Issue: `backend/docker/entrypoint.sh` contains a hardcoded SQL delete to patch the staging migration history before running migrations. This is a fragile workaround that is environment-specific but lives in the universal container entrypoint.
- Files: `backend/docker/entrypoint.sh`
- Impact: Production deployments share the same entrypoint. If the production DB never had this failed migration, the DELETE is a no-op, but the pattern is dangerous to maintain.

**`backend/src/lib/ai/index.ts` has a second in-memory quota system that duplicates `quotas.ts`:**
- Issue: Two separate quota enforcement systems exist: `backend/src/middleware/quotas.ts` (DB-backed, per run type, applied on orchestrator route) and `backend/src/lib/ai/index.ts` (in-memory, per-user hourly, applied on direct `parseResume`/`tailorResume` calls). Neither knows about the other.
- Files: `backend/src/lib/ai/index.ts`, `backend/src/middleware/quotas.ts`

---

## Missing Features / Gaps

**No `POST /api/admin/resources` endpoint:**
- Problem: There is no API route to create a `Resource` (article/blog post). Content can only be inserted directly into the database.
- Files: `backend/src/routes/admin.ts`
- Fix: Add creation endpoint. Documented in `CLAUDE_CODE_FIXES.md` FIX-11.

**No account lockout after failed login attempts:**
- Problem: `SECURITY.md` acknowledges "No account lockout: Rate limiting helps, but consider adding temporary lockout after N failed attempts."
- Current mitigation: Auth rate limiter at 10 requests per 15 minutes by IP. No per-account lockout.

**No MFA support:**
- Problem: `SECURITY.md` notes no MFA. Admin accounts have no second factor.

**No refresh token flow:**
- Problem: `SECURITY.md` notes "No refresh tokens: Current implementation uses long-lived access tokens." 7-day JWT expiry with no rotation.

**No password reset email verified as working end-to-end:**
- Problem: `backend/src/routes/password-reset.ts` exists, but `FRONTEND_URL` in staging previously pointed at a dead URL (`https://staging.afri-talent.com`). Password reset links are generated using `FRONTEND_URL`. Whether this was corrected and tested end-to-end is not confirmed.
- Files: `backend/src/routes/password-reset.ts`

**Semantic retrieval not indexed or deployed in staging:**
- Problem: The RAG foundation (`SemanticDocument` table, `indexPublishedJobs`, `indexOpenCandidates`) exists in code and migrations, but the `STAGING_RUNBOOK.md` explicitly states: "A semantic retrieval foundation now exists in the backend codebase, but it has not been deployed or indexed in staging yet."
- Files: `backend/src/lib/rag/store.ts`, `backend/src/routes/admin-rag.ts`
- Impact: Semantic job-to-candidate matching is not active. Job matching in the orchestrator uses the hash embedding fallback or no vector context.

**No email verification enforcement at login:**
- Problem: Email verification routes exist (`backend/src/routes/email-verification.ts`, `backend/src/routes/oauth.ts`), but it is unclear whether unverified users are blocked from core actions. The schema has `emailVerified Boolean @default(false)` on `User` but whether the `authenticate` middleware or route guards check this is not confirmed.
- Files: `backend/src/middleware/auth.ts`, `backend/prisma/schema.prisma`

---

## Dependency Risks

**`@anthropic-ai/sdk` model name drift:**
- Risk: `backend/src/lib/ai/orchestrator/agents.ts` hardcodes model IDs `claude-haiku-4-5-20251001` and `claude-sonnet-4-6` as defaults. These model names may become invalid as Anthropic releases new models and deprecates old ones.
- Files: `backend/src/lib/ai/orchestrator/agents.ts`, `backend/src/lib/ai/cover-letter.ts`
- Mitigation: Configurable via `AI_FAST_MODEL` and `AI_QUALITY_MODEL` environment variables.

**Node 20 GitHub Actions deprecation warnings:**
- Risk: `STAGING_RUNBOOK.md` notes "Clean up the Node 20 GitHub Actions deprecation warnings in a follow-on CI maintenance pass."
- Files: `.github/workflows/deploy-apprunner.yml`, `.github/workflows/ci.yml`
- Impact: Some actions are using deprecated Node 20 runtime or action versions. Warnings today, breakage when GitHub removes support.

**Flutterwave live payments blocked by KYC:**
- Risk: Flutterwave merchant account is in TEST MODE. KYC/activation is incomplete. Any user in Nigeria attempting to pay will reach Flutterwave checkout but live charging is blocked.
- Files: `backend/src/routes/billing.ts`, `backend/src/routes/webhooks.ts`
- Impact: Nigeria is the primary Africa market. The default billing provider for Nigerian users is Flutterwave. Live revenue from Nigeria is blocked until KYC completes.

**Stripe live-mode credentials possibly active in staging:**
- Risk: Confirmed in `STAGING_RUNBOOK.md`. Live Stripe keys may be hydrated into staging Secrets Manager.

---

## Scalability Concerns

**`SemanticDocument` table uses `Float[]` for embeddings — no vector index:**
- Limit: In-process cosine similarity over 500 fetched rows. At 10K+ indexed documents, each semantic search query will take seconds and consume significant memory.
- Scaling path: Migrate to pgvector extension, use `vector(N)` column type, add HNSW index, use `<=>` distance operator in raw SQL.

**Rate limiters are in-memory (per App Runner instance):**
- Limit: `express-rate-limit` uses an in-memory store by default. With multiple App Runner instances behind a load balancer, each instance has its own rate limit window. A user can exceed limits by hitting different instances.
- Files: `backend/src/middleware/security.ts`
- Scaling path: Configure `express-rate-limit` with a Redis store (`rate-limit-redis`) for distributed enforcement. Redis is already provisioned in staging.

**No Prisma connection pooling configuration:**
- Limit: `PERFORMANCE.md` identifies enabling Prisma connection pooling as a short-term item. Default Prisma client opens a new connection per serverless invocation pattern if not configured.
- Impact: Under horizontal scaling or burst traffic, connection pool exhaustion will surface before CPU or memory becomes the bottleneck.

**No job queue for async operations:**
- Limit: AI orchestrator runs, job aggregation sync, and other long-running operations run synchronously in the request path or via a simple scheduler (`backend/src/workers/scheduler.ts`). No durable job queue (BullMQ, SQS) exists.
- Impact: Long-running AI calls can tie up App Runner workers. Retries on failure are not automatic.

---

## Deployment / Ops Risks

**Staging uploads bucket CORS allows dead origin:**
- Issue: `STAGING_RUNBOOK.md` notes CORS allows `https://staging.afri-talent.com` and `https://rrmkvb99ca.us-east-1.awsapprunner.com` (dead services). The live frontend is at `https://3mwn2b4e5t.us-east-1.awsapprunner.com`.
- Files: S3 bucket CORS config (managed via `aws s3api put-bucket-cors`)
- Impact: Upload requests from the live frontend work (it's also in the allowed list), but stale origins create a false sense of security and surface area.

**Production deployment not yet executed:**
- State: `STAGING_RUNBOOK.md` explicitly states "Production is intentionally not deployed yet." The `prod` environment in Terraform exists but has never been applied end-to-end.
- Impact: No production cutover runbook has been tested. The first production deploy will be the first time the full flow runs against a real prod database.

**Single shared staging environment for all QA and UAT:**
- Risk: `dev` environment was destroyed to reduce cost. Staging is the only non-prod cloud environment. Any staging-breaking change blocks all QA and integration testing.

**Terraform apply from local workstation blocked:**
- Issue: `STAGING_RUNBOOK.md` notes a local `terraform plan` is blocked by an explicit deny on `ec2:DescribeInstances` from the `demo-policy` IAM policy attached to the local machine credentials.
- Impact: Terraform changes can only be applied via GitHub Actions OIDC role. No emergency manual apply path from a developer workstation exists.

**Monitoring and alerting Terraform not fully applied:**
- Issue: `STAGING_RUNBOOK.md` states "Full Terraform apply is still pending for monitoring, alerting, and other non-App-Runner resources outside the targeted repairs above."
- Impact: Alerts, dashboards, and canary monitoring may be partially configured. Ops blind spots exist in staging.

---

## AI Integration Readiness

**Claude AI: Fully integrated and production-capable**
- The multi-agent orchestrator (`backend/src/lib/ai/orchestrator/`) uses `@anthropic-ai/sdk` v0.78 directly.
- 6 agents: `ResumeParserAgent`, `JobParserAgent`, `MatchScorerAgent`, `ResumeTailorAgent`, `CoverLetterAgent`, `TruthConsistencyGuardAgent`
- Controlled via `ANTHROPIC_API_KEY`, `MOCK_AI=1` (stub mode), `AI_DISABLED=1` (kill switch)
- Default models: `claude-haiku-4-5-20251001` (fast), `claude-sonnet-4-6` (quality) — both configurable via env
- Fire-and-forget persistence to `AiRun` table in `backend/src/lib/ai/persistence.ts`
- Routes: `POST /api/orchestrator/run`, `GET /api/orchestrator/runs`
- Rate limiting: `orchestratorLimiter` (10 req/min per user), plus DB-backed daily quota per run type
- Risk: No plan-gating. Any authenticated CANDIDATE can call the orchestrator regardless of subscription tier.

**OpenAI: Optionally integrated for embeddings only**
- Used in `backend/src/lib/rag/embedding.ts` when `SEMANTIC_EMBEDDING_PROVIDER=openai`
- Requires `OPENAI_API_KEY`. Falls back to hash-based embeddings if not configured.
- Not used for text generation anywhere. Anthropic Claude is the sole generation model.

---

## Premium Gating Current State

**`requirePlan` middleware exists but is not applied to any route**
- `backend/src/middleware/subscription.ts` exports `requirePlan(minimumPlan: SubscriptionPlan)`.
- Zero call sites exist in routes or `app.ts`. The middleware is completely unused.
- Subscription plans exist: `FREE | BASIC | PROFESSIONAL | EMPLOYER_FREE | EMPLOYER_BASIC | EMPLOYER_PREMIUM`
- Billing webhooks (Stripe, Flutterwave) write to the `Subscription` table when events fire.
- Impact: Every API feature is freely accessible to any authenticated user. Paid subscription has no API-level enforcement. All gating is currently at the UI level only.

**Billing infrastructure is built and partially live:**
- Stripe checkout, webhook handlers, and subscription lifecycle events are implemented in `backend/src/routes/billing.ts` and `backend/src/routes/webhooks.ts`.
- Regional pricing and Flutterwave support are implemented.
- Flutterwave is blocked in live mode (KYC incomplete).
- Stripe may be configured with live-mode keys in staging (unconfirmed).

---

## Job Listings Current State

**Schema:**
- `Job` model in `backend/prisma/schema.prisma` (line 745) with fields: `title`, `description`, `location`, `type`, `seniority`, `salaryMin`, `salaryMax`, `currency`, `tags`, `slug`, `status` (`DRAFT | PENDING_REVIEW | PUBLISHED | REJECTED | EXPIRED | CLOSED`), `isExpired`, `riskLevel`, `riskScore`, `sourceId`, `sourceName`, `sourceUrl`, `externalId`, `publishedAt`
- No `deletedAt` soft-delete field (documented as missing bug).

**Ingestion:**
- 12 external aggregator sources: Greenhouse, Lever, Adzuna, Apify, Arbeitnow, Himalayas, Jobberman, JobsInCyprus, RemoteOK, WeWorkRemotely, Workable — in `backend/src/lib/jobs/aggregator/sources/`
- Greenhouse is the only confirmed working live source in staging.
- Lever returns `matchedCount=0` due to stale token.

**Search:**
- `ILIKE '%term%'` full table scan (no full-text index).
- Filter by location, type, seniority, salary, tags, country, remote.
- Preference-aware ranking for authenticated candidates via `backend/src/lib/jobs/search.ts`.

**Routes:**
- `GET /api/jobs` — public list with filters, pagination, anonymous rate-limited
- `GET /api/jobs/:slug` — public detail
- `POST /api/jobs` — employer creates (always `PENDING_REVIEW`, no draft support yet)
- `PUT /api/jobs/:id` — employer updates
- `DELETE /api/jobs/:id` — hard delete (bug: fails if applications exist)
- `GET /api/jobs/employer/my-jobs` — employer's own jobs
- `PUT /api/admin/jobs/:id/review` — admin approve/reject

---

## User Profile Current State

**Schema:**
- `CandidateProfile` model with: `headline`, `bio`, `skills` (String[]), `targetRoles`, `targetCountries`, `yearsExperience`, `visaStatus`, `linkedinUrl`, `githubUrl`, `portfolioUrl`, `workHistory` (structured JSON), `educationHistory`, `certifications`, `openToWork`, `resumeVersions`, `profileCompleteness`
- `Resume` model with S3-backed file storage (key + fileName)
- `CandidateResumeVersion` for version history

**Routes:**
- `PUT /api/profile` — upsert candidate profile (structured schema-validated)
- `GET /api/profile` — get own profile
- `POST /api/profile/resume-parser` — parse uploaded resume text via Claude
- File uploads go to S3 (`backend/src/routes/files.ts`)

**Completeness:**
- `backend/src/lib/profile-completeness.ts` computes a score, stored on the profile.

**Trust layer:**
- Profile changes trigger `refreshCandidateTrustProfile` — trust score and risk level are computed and stored in `CandidateTrustProfile`.

**Gap:**
- No candidate profile is sent to the orchestrator automatically. The orchestrator takes raw `resume_text` as input. Profile data and AI-parsed resume data are stored separately and not automatically reconciled.

---

## Pgvector / Embedding Infrastructure

**Current state: Float[] array, no pgvector extension**
- `SemanticDocument.embedding` is `Float[]` in the Prisma schema — stored as a native PostgreSQL float array.
- No pgvector extension is enabled. No `vector(N)` column type. No ANN index.
- Similarity search is brute-force in-process JavaScript (see `backend/src/lib/rag/store.ts` `searchSemanticDocuments`).
- Default provider is a SHA-256 hash-based embedding (`hash-v1`) — not a real embedding model.
- OpenAI `text-embedding-3-small` is supported but requires `OPENAI_API_KEY` + `SEMANTIC_EMBEDDING_PROVIDER=openai`.
- The semantic index has not been populated in staging yet.

**Path to real semantic search:**
1. Enable pgvector extension on RDS (`CREATE EXTENSION vector`)
2. Migrate `embedding Float[]` to `embedding Unsupported("vector(1536)")` or use raw SQL migration
3. Add HNSW or IVFFlat index
4. Replace in-process brute-force in `searchSemanticDocuments` with raw SQL using `<=>` operator
5. Configure `OPENAI_API_KEY` and `SEMANTIC_EMBEDDING_PROVIDER=openai` in Secrets Manager
6. Run indexing jobs via `POST /api/admin/rag/index/jobs` and `POST /api/admin/rag/index/candidates`

---

*Concerns audit: 2026-04-09*
