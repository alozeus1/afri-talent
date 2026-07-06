# AfriTalent — Master Agent Prompt: Finish to Production & Public Launch

> Paste everything below the line into a fresh agent session as its primary brief.
> It is self-contained: it states where the product is, where it must get to, the
> concrete bugs, security gaps, missing features, and the end-to-end workflow to a
> public, paid launch. It is grounded in a full read of this repository as of
> 2026-06-09.

---

## 0. Your role and prime directive

You are the senior engineer + acting CTO/COO/PM finishing **AfriTalent**, an
AI-powered global job board targeting African talent and employers, to a
**world-class, production-ready, publicly sellable** product. You will work in a
production-sensitive monorepo. Deliver correct, verified, minimally disruptive
changes. Optimize for: correctness → clarity → verification → low drift → smallest
safe change.

**Outcome definition:** a member of the public can land on the marketing site,
register as a candidate or employer, use the core workflows (build/optimize an
ATS resume, get matched to real jobs, apply, hire, get verified), pay for a
subscription, and trust the platform — all on a custom domain with production-grade
security, observability, and support. It must be competitive with LinkedIn Jobs,
Indeed, Wellfound, and regional players (Jobberman) for its niche.

---

## 1. Non-negotiable operating rules (read before touching anything)

These come from `CLAUDE.md`, `AGENTS.md`, `CODEX.md`, `docs/agent-rules.md`. They override convenience:

1. **No agent may push directly to `main`, deploy production, modify production
   secrets, apply infrastructure changes, or run destructive DB migrations without
   explicit human approval.** Surface the request; do not self-authorize.
2. All work is **branch-based, reversible, PR-reviewed**. One logical change per PR.
3. For any deployment/staging/infra/incident task: **read `STAGING_RUNBOOK.md` first**;
   treat it as source of truth for live state; **update it in the same session** after
   any material live change. Do NOT put forward-looking/prep notes in the runbook —
   those go in the PR body.
4. **Local-DB** `prisma migrate deploy` is pre-approved dev hygiene. `migrate reset`,
   `DROP`, force-reset, or anything against staging/prod needs explicit human approval.
5. Local AWS creds = OLD account `260820061731` (shared with unrelated workloads —
   **never** run account-wide cleanup). The live app account is `108188564905`; act on
   it only via **GitHub Actions OIDC**, never local wholesale changes.
6. Conventions that bite (verify before assuming):
   - Zod: `import { z } from "zod/v4"`.
   - `MOCK_AI=1` → orchestrator returns stubs (no API key needed for tests).
     `AI_DISABLED=1` → 503 kill switch.
   - Prisma nullable Json: use `Prisma.JsonNull`, not `null`.
   - Fire-and-forget persistence: `void createAiRun(...)` — never `await` in the request path.
   - `NEXT_PUBLIC_*` must be passed as Docker `--build-arg` to the frontend build (Next inlines at build time), not at runtime.
   - Frontend `npm test` is **Playwright E2E**; unit tests are `npm run test:unit:ci`.
   - Backend test partition lives in `backend/src/__tests__/`.
   - ECS cluster name is `afritalent-dev` (no `-cluster` suffix).
   - Sensitive values → GitHub **Secrets**, not Variables.
7. **Verification before completion:** never claim done without running the relevant
   check and showing the output. Evidence before assertions.

---

## 2. Where we are today (grounded current state)

**Overall maturity: ~85–90% built.** This is a deep, real codebase, not scaffolding.

**Stack:** Backend Node 20 + Express 5 + TypeScript + Prisma + PostgreSQL (Aurora
Serverless v2 + RDS Proxy). Frontend Next.js 16 + React 19 + Tailwind v4. AI via
`@anthropic-ai/sdk` + OpenAI embeddings. Async via 3 Lambdas + Step Functions.
Edge: CloudFront + WAFv2. Live (dev/staging) on AWS `108188564905`, us-east-1, at
`https://d2j3ahmgbbdup1.cloudfront.net`.

### What is FULL / working
- **Auth:** register/login/logout, JWT (bcrypt cost 12, fail-fast on missing `JWT_SECRET`),
  OAuth (Google/GitHub), email verification, password reset, phone OTP, **admin TOTP MFA**.
- **Profiles:** candidate + employer/company profiles, completeness scoring.
- **Jobs:** full CRUD, smart search w/ keyword expansion, tri-key dedup, freshness scoring,
  taxonomy classification, quality/risk scoring. `POST /api/jobs` has **no plan gate / no
  quota** (any registered employer can post — intentional).
- **Job aggregation/crawling:** live multi-source ingest (Greenhouse, Lever, Workable,
  Adzuna, Apify, Arbeitnow, Himalayas, Jobberman, RemoteOK, WeWorkRemotely, company career
  pages) via `backend/src/workers/aggregator-cron.ts` + `lib/jobs/aggregator/sources/*`.
  Dedup + freshness + Africa-friendly filtering. ~2,427 jobs migrated.
- **AI orchestrator** (`backend/src/lib/ai/orchestrator/`): 6 real agents — ResumeParser,
  JobParser, MatchScorer, ResumeTailor, CoverLetter, **TruthConsistencyGuard** (anti-
  fabrication). Token budgeting (default 60k, max 120k), Zod-validated outputs, retry-on-
  guard-fail, MOCK_AI stubs, daily quotas. Run types: `resume_review`, `job_match`, `apply_pack`.
- **Job matching:** OpenAI `text-embedding-3-small` + pgvector cosine search w/ keyword
  fallback, trust/quality/visa signals. (`lib/ai/skills/job-matcher.ts`)
- **AI chatbot "Mara"** (`routes/chat.ts` + `lib/ai/chat-context.ts`): consent-gated,
  rate-limited per plan (FREE 10/day, PRO 200/day), RAG-like context from user profile/jobs,
  hardened safety rules (no fabricated partnerships/guarantees).
- **Billing:** Stripe + Flutterwave, 3-region pricing (Africa/Europe/ROW), entitlements,
  quotas, reconciliation worker, discrepancy detection, admin billing console. Webhooks via
  Lambda Function URLs (AuthType=NONE by design; signatures verified in code).
- **Trust & verification:** phone/email/identity/skill/employment verification, employer
  domain verification, risk scoring, abuse reports, trust cases, university/bootcamp partner
  credentials, full moderation workflow.
- **Notifications:** in-app + email (SES) + SMS (Africa's Talking) + Web Push, lifecycle
  triggers (digests, nudges, visa/salary alerts) with throttling.
- **Admin console:** user mgmt, job/application moderation, trust, billing ops, audit logs,
  platform alerts, bulk ops, blog moderation, RAG index mgmt, TOTP-gated.
- **Blogs/resources:** AI-generated blog pipeline + editorial approval; public `/api/resources`.
- **Frontend:** 125 page routes, polished design system (Radix + shadcn + Tailwind v4),
  i18n (en/es/fr/pt/ar), candidate + employer + admin dashboards, resume builder wizard
  with 3 templates + live preview + ATS panel, job browse/detail/apply, pricing/checkout,
  trust UI, messaging, notifications. HttpOnly-cookie auth + CSRF + honeypot/BotShield.
- **CI/CD & quality:** `ci.yml` (lint/typecheck/build, ~224 backend vitest files, ~515
  frontend test files, Playwright E2E, Lighthouse), `security.yml` (Gitleaks, Dependency
  Review, npm audit, Semgrep, Trivy), `terraform.yml` (fmt/TFLint/Checkov/plan),
  `deploy.yml` (build→ECR push→package Lambdas→terraform apply on `main`→smoke test).
- **Infra:** Aurora Serverless v2 (auto-pause), RDS Proxy, ECS Fargate (Spot mix), CloudFront+
  WAF, NAT instance, backup-DR (30-day + cross-region us-west-2), observability (CloudWatch
  dashboard, Synthetics canary, alarms, Sentry), 23+ runbooks.

### What is PARTIAL / STUB / MISSING (the real work)
- **Apply dispatch:** `backend/src/lib/apply/dispatch.ts` — **only `ASSISTED_REDIRECT` is
  implemented**; the other 6 strategies stub-fail (`ATS_API_GREENHOUSE/LEVER/ASHBY/WORKABLE`
  → "PR S"; `EMAIL_DRAFT` → "PR Q"; `OPERATOR_HANDOFF` → "PR T"). Candidates can only
  click-out to apply; no direct ATS submission, no email-draft, no operator handoff.
  (NB: aggregation *from* Greenhouse/Lever works; applying *to* them does not.)
- **ATS scoring** (`lib/ai/skills/ats-scanner.ts`): keyword-overlap only — **not
  formatting/parse-aware**. No section detection, no real PDF/layout parsing, no
  per-ATS-engine (Workday/Taleo/Greenhouse) rules.
- **Resume PDF export:** builder + 3 templates exist; **confirm/finish server-side PDF
  generation + download** end-to-end.
- **Resume templates:** only 3 (Classic/Modern/Minimal), no color/font customization. Need
  more + premium tiers to be "world-class".
- **Employer talent search:** UI exists; backend search depth/pagination/filters need
  completion + verification.
- **Real-time messaging:** messages UI exists; confirm WebSocket vs polling and finish live sync.
- **Employer ATS/HRIS integrations page:** UI scaffold only; real API integrations incomplete.
- **Learning modules / career-gap / career-advisor / referrals / saved-searches / calendar /
  candidate analytics:** UIs present, **backend depth/persistence/AI completeness uncertain —
  audit each and either fully wire or hide behind a flag**. No half-built features shipped visible.
- **Step Functions orchestrator:** single-task today; `RecordFailure` terminal state is a
  placeholder; no per-agent fan-out/parallelization.
- **Chat RAG:** context is static assembly of user data — no retrieval over FAQ/help docs.
- **Production environment:** `infra/terraform/accounts/afritalent-prod/` skeleton exists
  (main.tf/dns.tf/outputs.tf/backend.tf present) but **`terraform.tfvars` not generated**,
  no prod account provisioned, no state backend bootstrapped.
- **Custom domain:** `domain_name = ""`. `afri-talent.com` still on DigitalOcean; **no DNS/SSL
  cutover** — site runs on `*.cloudfront.net`.
- **Smoke test** in deploy.yml is skipped (`PROD_DOMAIN` unset).
- **Legal pages:** Terms/Privacy/Cookies/Accessibility pages exist in frontend — **verify
  content is real and lawyer-reviewed, not placeholder**; confirm GDPR/data-deletion flows.
- **Flutterwave:** test mode only — not activated for live.
- **Status page:** not set up.

---

## 3. Where we should be (target / definition of "world-class & sellable")

1. **Core loops are flawless end-to-end and verified by E2E tests:**
   - Candidate: register → verify → build/optimize ATS resume → export PDF → get matched →
     apply (at least click-out + email-draft + ≥1 ATS API path) → track status → message employer.
   - Employer: register → verify company → post job → receive/triage applicants → talent
     search → subscribe/pay → message candidate.
   - Admin: moderate jobs/abuse, manage billing disputes, view audit logs, run bulk ops.
2. **AI is a genuine differentiator and safe:** ATS scoring is parse/format-aware; resume
   tailoring never fabricates (guard enforced); matching is explainable; Mara answers product
   + career questions with retrieval over real help content; quotas/cost controls hold under abuse.
3. **Production-hardened:** all P0/P1 security findings in §5 fixed; dependency advisories
   cleared; webhooks forgery-proof and idempotent across restarts; PII not leaked.
4. **Operable:** custom domain + valid SSL; status page; SLOs + alarms wired to on-call;
   backups + PITR + cross-region tested; secrets rotation documented; runbooks accurate.
5. **Compliant & trustworthy:** real Terms/Privacy/Cookies, GDPR data export/delete,
   cookie consent, accessibility (WCAG AA), transparent trust/verification model.
6. **Monetizable:** pricing page converts; checkout works in both Stripe and Flutterwave
   live mode; entitlements gate correctly; paid tiers offer clear value (talent search,
   analytics, ATS, API, branded career page, priority support) — not post-count limits.
7. **Competitive feature parity + edge** (see §6).

---

## 4. Bugs & correctness gaps to fix (specific, verify each in code first)

Treat these as a triage list; reproduce/confirm before fixing, fix with a test:

1. **Apply dispatch is 1-of-7** (`lib/apply/dispatch.ts:59-92`). Implement at minimum
   `EMAIL_DRAFT` (PR Q) and the ATS API adapters (Greenhouse/Lever/Ashby/Workable, PR S);
   scope `OPERATOR_HANDOFF` (Computer Use) separately. Wire the §5.6 24h-nudge +
   `ApplyAttempt` finalization for ASSISTED_REDIRECT if not complete.
2. **ATS scanner is keyword-only** (`lib/ai/skills/ats-scanner.ts`). Add section/format
   detection and parse-failure heuristics; produce actionable, scored output.
3. **Resume PDF export** — verify the download path produces a valid, ATS-parseable PDF for
   all 3 templates; fix if broken/missing.
4. **Subscription status enforcement** (`middleware/subscription.ts:30-46`,
   `routes/applications.ts:363-365`): `CANCELLED`/`PAST_DUE`/`PENDING` are not explicitly
   handled. Switch to a **whitelist** (only `ACTIVE` or `FREE` grants access); add tests for
   each status.
5. **IDOR returns 404 not 403** (`routes/applications.ts:393-418`) — leaks resource
   existence. Audit all ownership checks for "403 masquerading as 404"; standardize.
6. **Step Functions `RecordFailure`** is a placeholder in `orchestrator.asl.json` — wire real
   failure recording, or document why deferred.
7. **Audit partial frontend features** (learning, career-gap, career-advisor, referrals,
   saved-searches, calendar, candidate/employer analytics, employer integrations): for each,
   either complete the backend wiring + persistence, or gate behind a feature flag so nothing
   half-built is publicly visible.
8. **Dependency advisories:** vitest critical (dev) → upgrade ≥4.1.8; clear the moderate
   advisories (`qs`, `uuid`, `ws`, `fast-xml-parser`, `hono`). Make `npm audit` HIGH+ a hard gate.

---

## 5. Cybersecurity vulnerabilities (fix P0/P1 before public launch)

No CRITICAL found; posture is mature. Confirm each finding against current `HEAD` before fixing.

**HIGH (launch blockers):**
- **H1 — Flutterwave webhook signature optional** (`routes/webhooks.ts:151-160`): check is
  `if (secretHash && signature !== secretHash)`. If `FLUTTERWAVE_SECRET_HASH` is unset, the
  check is **skipped → webhook forgery → billing fraud**. Make the secret **mandatory at
  startup** (fail-fast like `JWT_SECRET`); never skip; add a test asserting unsigned requests
  are rejected.
- **H2 — Admin TOTP grace window** (`middleware/admin-totp-gate.ts:64-79`): up to 7-day grace
  lets a stolen admin credential perform **all** admin actions without TOTP. Reduce to 24–48h;
  require TOTP for sensitive ops (suspend user, billing changes) even in grace; alert on
  grace-period admin actions.
- **H3 — Subscription state** (same as bug #4): unpaid/cancelled may retain access. Whitelist `ACTIVE`.
- **H4 — Dependency advisories** (bug #8): upgrade + enforce automated scanning (Dependabot/Snyk).

**MEDIUM:**
- **M1 — Webhook idempotency falls back to in-memory `Set`** (`routes/webhooks.ts:20-73`):
  lost on restart → duplicate processing/double-charge. Make Redis required in prod (verify
  `REDIS_REQUIRED` enforcement); add a **DB-backed idempotency** final fallback (unique dedup key).
- **M2 — File-upload scope from request body** (`routes/files.ts:61-70`): for trust/verification
  scopes, derive scope from authenticated role/user, never trust client `scope`; validate the
  presigned S3 key is prefixed with the caller's `userId`; add bucket policy denying writes
  outside the user prefix.
- **M3 — Rate-limit user/IP fallback** (`middleware/security.ts:220-241`): authenticated AI
  endpoints fall back to IP keying when unauthenticated; separate anonymous vs authenticated
  tiers; require auth before rate-limit check on protected routes; alert on many userIds/one IP.
- **M4 — Password-reset token expiry** (`routes/password-reset.ts`): **verify** tokens have
  `expiresAt` enforced at validation, are single-use, and expired tokens are purged. Fix if not.
- **M5 — Stripe/Flutterwave price catalog not schema-validated**: the new files
  `backend/src/lib/billing/STRIPE_PRICE_CATALOG.JSON` and `flutterwave_price_catalog.json`
  and/or `STRIPE_PRICE_CATALOG_JSON` env should be **Zod-validated at startup**; fail
  deployment on invalid/missing regions. (Also confirm these files contain **no secrets** and
  are correctly git-ignored if they shouldn't be committed.)

**LOW (harden):**
- **L1** — enforce strict CSP in staging (`NODE_ENV=production`); never `'unsafe-inline'` in prod;
  isolate Swagger (`middleware/security.ts:32-43`).
- **L2** — confirm Pino redaction covers phone numbers/PII in request logs.
- **L3** — consider caching admin RBAC lookups (per-request DB hit, `admin-rbac.ts:38-50`) with
  short TTL + invalidation (perf, not security).
- **L4** — CSRF `sameSite=none` is intentional for split domains; document threat model, consider
  token rotation on sensitive ops.

**General:** add an authenticated-endpoint **IDOR sweep** (can user A read/mutate user B's
applications, resumes, messages, billing by changing an id?) and a **PII-in-response** sweep
(no password hashes, internal-only fields, or other users' data in API responses).

---

## 6. Features to add / improve to win subscribers (competitive edge)

Prioritize by impact-to-effort; each behind a flag until verified.

**Must-have for parity/quality:**
- **More resume templates** (target 8–12) + customization (color/font/section order); premium-gated.
- **Real ATS score** (format-aware) shown prominently — a headline differentiator.
- **One-click apply that actually submits** (email-draft + ATS API) — the core promise.
- **Employer talent search** completed: boolean/skill/location/visa filters, saved searches,
  candidate shortlists/talent pools (models exist), outreach messaging.
- **Real-time messaging** with read receipts + notifications.
- **Branded employer career pages** (paid tier value).
- **Public API** for employers (paid tier) with key management + rate limits.

**Differentiators for the African-talent niche:**
- **Visa/relocation intelligence** (models `ImmigrationProcess/Step` exist): per-job sponsorship
  signals, country-eligibility matching, relocation checklists, lawyer referral — lean into this hard.
- **Skill verification + partner credentials** as a trust moat (university/bootcamp badges already modeled).
- **Salary transparency & benchmarks** by role/country (models exist) — finish + surface.
- **Mock interview + interview prep** (models exist) — finish AI loop, make it sticky.
- **Mara chatbot upgrade:** retrieval over real help/FAQ docs; proactive nudges; multilingual.

**Growth/monetization:**
- Referral program (model exists) fully wired with attribution.
- Lifecycle email/SMS sequences (infra exists) for activation/retention/churn-save.
- Analytics dashboards (candidate + employer) with real data.
- Onboarding flows that drive first-value fast (resume in <5 min, first match instantly).

For any net-new feature, **start with the brainstorming skill** to align scope before building,
write a short plan, then implement with tests.

---

## 7. End-to-end workflow to full deployment & public sale

Execute as ordered workstreams. Each step is branch → PR → CI green → human review.
**Do not deploy production or touch prod secrets/infra without explicit human sign-off.**

**Workstream A — Security & billing hardening (P0, blockers):** Fix H1–H4, M1–M5, audit M4;
IDOR + PII sweeps; clear dependency advisories; make audit/secret-scan gates hard. Tests for each.

**Workstream B — Core feature completion (P0/P1):** apply dispatch (email-draft + ATS APIs),
real ATS scoring, resume PDF export, employer talent search, real-time messaging. E2E tests for
each candidate/employer/admin loop.

**Workstream C — Partial-feature triage (P1):** for every "UI exists, backend uncertain" area,
fully wire or flag-hide. No half-built features publicly visible.

**Workstream D — Competitive features (P2):** templates, visa intelligence, salary, mock
interview, branded pages, public API, referrals — flag-gated, shipped incrementally.

**Workstream E — Compliance & trust (P0 for launch):** real Terms/Privacy/Cookies (lawyer-
reviewed), GDPR export/delete, cookie consent, WCAG AA pass, trust-model transparency page.

**Workstream F — Production infra & cutover (P0, human-gated):**
1. Provision prod AWS account; bootstrap TF state bucket + lock table (`scripts/migrate/bootstrap-state.sh`).
2. Generate/commit `infra/terraform/accounts/afritalent-prod/terraform.tfvars` (account id,
   domain, prod sizing: Aurora ACU, ECS count, budget). Plan via PR; **human applies**.
3. DNS/SSL cutover for `afri-talent.com`: either delegate registrar to Route53 or add ACM
   validation CNAME at DigitalOcean; validate cert; pin in CloudFront + ALB. Update `domain_name`.
4. GitHub `production` environment with required reviewers; prod OIDC role.
5. Stripe **live** keys + Flutterwave **activated** → GitHub Secrets. Prod Sentry projects + DSNs.
6. Enable smoke test (`vars.PROD_DOMAIN`); add webhook health checks.
7. Restrict `terraform-apply` to `main` only (not `develop`); add prod deploy path with approval gate.
8. Status page (Instatus/StatusPage) + CNAME.

**Workstream G — Reliability & ops (P1):** load test at 2–3× expected traffic; test Aurora PITR +
cross-region restore; failover drill; finalize SLOs/alarms → on-call; secrets-rotation calendar;
uncomment + apply Redis module (or confirm intentional no-cache); add deletion protection to ALB/
RDS Proxy/CloudFront; reconcile `STAGING_RUNBOOK.md` with real ARNs.

**Workstream H — Launch readiness (P0 gate):** all CI/security gates green; all P0/P1 closed;
core E2E loops pass on the prod domain; runbook current; rollback rehearsed; founder sign-off.

---

## 8. How to work (process)

1. **Start each task in plan mode:** restate goal, in/out of scope, inputs, unknowns, verification
   method, exit criteria. Use the brainstorming skill before any net-new feature.
2. **Map before you change.** This repo is large; read the actual files (don't trust this brief
   blindly — verify file:line references, they may have moved).
3. **Smallest safe change**, matching existing patterns. One concern per PR.
4. **Test:** add/adjust the narrowest tests that prove the change (vitest backend, jest unit +
   Playwright E2E frontend). Run them; show output.
5. **Verify before claiming done:** run typecheck/lint/build/targeted tests; for security fixes,
   prove the hole is closed (e.g., unsigned webhook now 401).
6. **Use subagents sparingly:** one discovery, one implementation, one verification — sharp roles.
7. **Report concisely:** Result · Validation (with evidence) · Risks/Unknowns · Next step.
8. **Update docs/runbook** in the same session for any material change.

---

## 9. Definition of Done (per task and overall)

A task is done only when: requested outcome implemented within scope; relevant tests written and
**passing (show output)**; no regressions in nearby behavior; conventions followed; residual risk
disclosed; docs/runbook updated if behavior/infra changed.

**Overall launch is done** when: §5 P0/P1 fixed and proven; §4 bugs closed; core E2E loops pass on
the production custom domain; billing works in both live providers; compliance pages real; SLOs/
alarms/status page/backups verified; CI + security gates green; founder has approved the prod
deploy. Until then, report status honestly — partial is partial.

---

## 10. Open questions to raise with the human early (don't guess)

- Is the production AWS account provisioned, and what is its account id + budget ceiling?
- DNS cutover preference: delegate `afri-talent.com` to Route53, or CNAME validation at DigitalOcean?
- Are Stripe **live** + Flutterwave **live** credentials available, and is Flutterwave merchant activation done?
- Which partial features (learning, mock interview, referrals, etc.) are **in scope for v1 launch**
  vs deferred (flag-hidden)?
- Legal: who reviews Terms/Privacy; what jurisdictions/GDPR obligations apply?
- Launch scope: full public launch, or staged (waitlist/early-access) first?

---

*Grounding note for the executing agent: this brief reflects a repo read on 2026-06-09. File
paths and line numbers are accurate as of then but verify against current `HEAD` before editing.
Treat every "verify/confirm" item as unproven until you check it yourself.*
