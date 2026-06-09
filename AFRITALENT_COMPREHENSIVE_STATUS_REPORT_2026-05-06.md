# AfriTalent — Comprehensive Status & Pre-Launch Audit Report

**Date:** May 6, 2026
**Branch Audited:** `agentic-engineering-team-bootstrap` (uncommitted changes) vs `develop` (staging)
**Environment:** AWS App Runner (us-east-1) — Shared Staging
**Report Type:** Full-Stack Health, Security, Market Position, Product Integration

---

## TL;DR — Executive Summary

AfriTalent is **functionally stable on staging** but **not yet safe for public production deployment**. The backend builds, tests, and typechecks cleanly. The frontend compiles and passes unit tests. However, **four critical security findings** (live API keys on disk, hardcoded JWT fallback, missing OAuth state validation, unverified Apple ID tokens) must be resolved immediately. The AI application flow still lacks a human-review gate, and the resume/cover-letter UX has significant gaps that undermine the premium value proposition.

**Staging is suitable for UAT and investor demos today. Production launch should be blocked until the Critical & High items in this report are cleared.**

---

## 1. What's Fixed (Recent Wins on `develop`)

| Fix | Commit / Date | Impact |
|-----|--------------|--------|
| Backend rate limit raised + session pollers bypassed | `410c53c` (Apr 29) | Stopped 429 errors on normal page navigation |
| Candidate null-profile crash fixed | `a30ab56` (Apr 29) | New users no longer see `TypeError` on first dashboard load |
| Auth-loading race fixed on 8 candidate pages | `a30ab56` (Apr 29) | Eliminated redirect loops for authenticated users |
| Job hydration mismatch (React #418) fixed | `cf35759` (Apr 29) | Public jobs page no longer logs SSR errors |
| Landing page Lighthouse 100/100/96/100 | `2168210` / `6a906be` (Apr 30) | Performance, A11y, SEO all at top scores |
| Product knowledge module included | `cd2b79c` (May 1) | Fixed backend build failure from missing `product-knowledge.ts` |
| UI refactor (shadcn + radix + Geist) fully merged | `2a51db8` | TypeScript fully green on `develop` |
| Staging deploy pipeline restored | Multiple (Apr 7–May 1) | Backend/frontend images build, push, and deploy successfully |
| Billing provider routing live | `9cec26c` (Apr 8) | Stripe + Flutterwave checkout endpoints operational in staging |
| Semantic retrieval foundation landed | `9cec26c` (Apr 8) | Code exists; not yet deployed or indexed at scale |

---

## 2. What's Working

### Backend
- ✅ Build, lint, typecheck, and **263 vitest tests** all pass.
- ✅ Admin RBAC with granular `AdminPermission`s and audit logging.
- ✅ Rate limiting on auth, registration, password reset, OTP, AI skills, and orchestrator.
- ✅ Bot protection (honeypot + timing + UA detection) on auth endpoints.
- ✅ Prisma migration chain reconciled; staging boots with auto-migrations.
- ✅ Redis (ElastiCache Serverless) connected; health checks report `redis=connected`.
- ✅ S3 uploads bucket encrypted, versioned, and blocking public access.
- ✅ Stripe + Flutterwave webhooks configured and handling events.
- ✅ Job ingestion from Greenhouse and Lever restored after NAT gateway repair.

### Frontend
- ✅ Next.js 16 build generates 71 pages cleanly.
- ✅ TypeScript zero errors across the entire frontend.
- ✅ 97 Jest unit tests passing.
- ✅ Auth callback has safe hardcoded redirects (no open-redirect vulnerability).
- ✅ Cover letter tone selector is wired to the API.
- ✅ Job matches now render explanations, verified-employer badges, and visa pills (BACKLOG-1 largely addressed).

### Infrastructure
- ✅ AWS App Runner services (backend + frontend) are `RUNNING`.
- ✅ GitHub Actions OIDC federation (no long-lived AWS credentials).
- ✅ Terraform state managed in S3 + DynamoDB.
- ✅ CloudWatch Synthetics canary operational.

---

## 3. What's Broken / What's Critical

### 🔴 CRITICAL — Block Production Launch

| ID | Issue | Location | Consequence | Effort |
|----|-------|----------|-------------|--------|
| **CRIT-1** | **Live API keys exposed on disk** | `backend/.env` (OpenAI, Anthropic, Africa's Talking) | Financial drain, data exfiltration, SMS abuse | **Immediate rotation** |
| **CRIT-2** | **Hardcoded JWT fallback secret** | `backend/src/lib/jwt.ts:10` | If `JWT_SECRET` is missing, tokens are trivially forgeable | **1 hour** |
| **CRIT-3** | **Missing OAuth `state` validation** | `backend/src/routes/oauth.ts` | Google OAuth CSRF / account linking attacks | **4 hours** |
| **CRIT-4** | **Apple ID token not cryptographically verified** | `backend/src/routes/oauth.ts` | Complete authentication bypass for Apple sign-in | **4 hours** |
| **CRIT-5** | **AI application flow has NO human review/approval gate** | `backend/src/routes/orchestrator.ts`, `application-writer.ts` | Users' accounts can auto-apply to jobs without consent; compliance risk | **2 days** |

### 🟠 HIGH — Pre-Production Blockers

| ID | Issue | Location | Consequence | Effort |
|----|-------|----------|-------------|--------|
| **HIGH-1** | **Zero CSRF protection** | Entire backend | Authenticated users visiting malicious sites can have requests forged | **1 day** |
| **HIGH-2** | **Dependency vulnerabilities (backend)** | `backend/package.json` | 7 moderate/low CVEs (XSS, XML injection, DoS) | **Half day** |
| **HIGH-3** | **Dependency vulnerabilities (frontend)** | `frontend/package.json` | 7 moderate CVEs (XSS, HTML injection, DoS) | **Half day** |
| **HIGH-4** | **S3 IAM policy prefix mismatch** | `infra/terraform/modules/s3/main.tf` | Verification doc uploads may fail (policy only allows `resumes/*`) | **2 hours** |
| **HIGH-5** | **Resume builder: no per-section editing** | `frontend/src/app/candidate/resume-builder/page.tsx` | Users get a giant textarea; cannot edit individual sections (BACKLOG-3) | **2–3 days** |
| **HIGH-6** | **Cover letter: no save to backend** | `frontend/src/app/candidate/cover-letter/page.tsx` | Edited drafts are lost on refresh (BACKLOG-4) | **1 day** |
| **HIGH-7** | **Stripe test-mode end-to-end not validated** | `backend/src/routes/billing.ts` | Paid flows untested; could break on first real checkout | **1 day** |
| **HIGH-8** | **Flutterwave KYC incomplete** | Flutterwave dashboard | Africa payment flows blocked by provider | **Vendor-dependent** |
| **HIGH-9** | **No per-skill kill switches** | `backend/src/routes/skills/*.ts` | Cannot disable a single misbehaving AI feature without killing all skills | **Half day** |
| **HIGH-10** | **Quality rubric not wired into generate handlers** | `backend/src/routes/skills/application-writer.ts` | AI output quality is unvalidated before reaching users | **Half day** |

### 🟡 MEDIUM — Fix Within 30 Days of Launch

- **E2E Health:** 5 Playwright failures with zero trace artifacts; root cause unknown.
- **Accessibility:** Missing label associations, clickable `<div>` cards without `role="button"`, no `aria-pressed` on toggles.
- **Performance:** AI Assistant page is 1,501 lines; inline re-computations in resume builder; dynamic Tailwind classes at risk of purge.
- **CORS:** `null` origin allowed in production; `ALLOWED_ORIGIN_REGEX` allows unvalidated regex injection.
- **Redis token blocklist:** Fail-open during outages.
- **No malware scanning** on PDF/DOCX uploads.
- **Terraform reconciliation:** Broader drift outside App Runner repairs still pending.
- **Semantic retrieval:** Deployed in code but not validated at staging scale.

### 🟢 LOW — Nice to Have

- 50 backend ESLint warnings (unused vars).
- 10 frontend lint warnings (`<img>` vs `<Image />`, unused imports).
- Helmet `crossOriginEmbedderPolicy` disabled.
- Health check leaks commit SHA and release version.
- `bcrypt` cost factor is 10 (recommend 12).

---

## 4. Backend Deep Audit Summary

**Build/Test Grade: A**

- `npm run build` ✅
- `npx tsc --noEmit` ✅
- `npm run lint` ✅ (50 warnings, 0 errors)
- `npm test` ✅ (263 tests passed)

**Uncommitted Changes on Current Branch:**

| File | Change Summary |
|------|----------------|
| `backend/.env.example` | Added OAuth redirect URI docs, `SES_REGION`, `TEST_SMS_OTP_PREVIEW` |
| `backend/src/__tests__/oauth-email-api.test.ts` | New OAuth diagnostics test (safe, no secret leakage) |
| `backend/src/middleware/security.ts` | Test-env bypasses for rate limiters; raised test caps to 1000 |
| `backend/src/routes/notifications.ts` | New `PUT /:id/feedback` endpoint with Zod validation |
| `backend/src/routes/oauth.ts` | Named error codes, structured errors, new `GET /diagnostics` endpoint |
| `backend/src/routes/trust.ts` | Africa's Talking SMS OTP integration, 60s resend cooldown, masked phone numbers |

**Assessment:** The branch changes are safe improvements. They do **not** introduce new security regressions, but they also do **not** close any of the critical security gaps identified above.

---

## 5. Frontend Deep Audit Summary

**Build/Test Grade: A**

- `npm run build` ✅ (71 pages)
- `npx tsc --noEmit` ✅ (0 errors)
- `npm run lint` ✅ (10 warnings, 0 errors)
- `npm run test:unit:ci` ✅ (97 tests)

**Playwright E2E Grade: C**

- Last run: **failed** (5 unknown failures, no trace files)
- Cannot diagnose without re-running with `trace: 'retain-on-failure'`.

**Key UX Gaps:**

1. **Resume Builder** — Still monolithic. AI output is one giant `<textarea>`. No per-section editing. No DOCX/PDF export. No proactive `PremiumGate` for non-PRO users.
2. **Cover Letter** — Editable textarea exists, but **no save endpoint**. Drafts are lost on refresh.
3. **AI Assistant** — 1,501-line page component. Dynamic Tailwind classes risk purge in production. `alert()` used for run-history details.
4. **Language Switcher** — Both `onInput` and `onChange` fire, causing double navigation.

---

## 6. Security Audit Summary

A full security audit report has been written to:

📄 **`docs/SECURITY_AUDIT_REPORT_2026-05-06.md`**

**Top-Line Metrics:**

| Severity | Count |
|----------|-------|
| Critical | 4 |
| High | 4 |
| Medium | 6 |
| Low | 4 |

**Immediate Actions Required (Before Any Production Deploy):**

1. **Rotate all live API keys** in `backend/.env` (OpenAI, Anthropic, Africa's Talking).
2. **Remove the hardcoded JWT fallback** in `jwt.ts`.
3. **Add OAuth `state` validation** for Google sign-in.
4. **Verify Apple ID token signatures** against Apple's JWKS.
5. **Implement CSRF protection** (Double Submit Cookie recommended for cross-domain setup).
6. **Run `npm audit fix`** in both `backend/` and `frontend/`.
7. **Fix S3 IAM policy** to include `trust/*` prefix.

**Positive Controls (Do Not Regress):**

- Gitleaks CI active; `.env` files correctly gitignored.
- S3 encrypted with KMS, versioning on, public access blocked.
- RDS not publicly accessible, storage encrypted.
- Comprehensive rate limiting and bot protection on auth.
- Password reset tokens hashed server-side and single-use.

---

## 7. Market Analysis — AI Automated Job Application & Resume Landscape

### 7.1 Competitive Matrix (2026)

| Competitor | Core Model | AI Resume | AI Cover Letter | Auto-Apply | ATS Focus | Price | Africa / Visa Focus |
|------------|-----------|-----------|-----------------|------------|-----------|-------|---------------------|
| **Sprout** | Swipe-to-apply + tailored docs | ✅ High | ✅ High | ✅ One-swipe | ✅ | Free / Premium | ❌ |
| **Oaki** | Full automation (search → tailor → apply) | ✅ High | ✅ High | ✅ True auto-apply | ✅ | Subscription | ❌ |
| **Careerswift** | All-in-one lifecycle | ✅ | ✅ | ✅ Review-before-apply | ✅ | €9.99/wk | ❌ |
| **LazyApply** | Volume spray-and-pray | ❌ Generic | ❌ Generic | ✅ Bulk | ❌ | $99–$249 lifetime | ❌ |
| **LoopCV** | Set-it-and-forget-it loops | ❌ Templated | ❌ Templated | ✅ Daily automation | ❌ | Subscription | ❌ |
| **Teal** | Job tracker + resume matching | ✅ Partial | ❌ | ❌ Manual only | ✅ Partial | $9/wk | ❌ |
| **Jobscan** | Deep ATS scanner | ❌ (scanner only) | ❌ | ❌ | ✅ Deepest | $49.95/mo | ❌ |
| **Kickresume** | GPT-4 resume + design templates | ✅ | ✅ | ❌ | ✅ | $7–$24/mo | ❌ |
| **Rezi** | Real-time ATS scoring | ✅ | ❌ | ❌ | ✅ | $29/mo or $149 lifetime | ❌ |
| **AIApply** | Budget auto-apply | ✅ Medium | ✅ | ✅ Basic | ❌ | $29/mo | ❌ |
| **PitchMeAI** | Resume + recruiter outreach | ✅ | ✅ | ❌ | ✅ | $22/mo | ❌ |

### 7.2 Market Gaps AfriTalent Can Own

1. **African Talent + Global Employer Bridge** — No competitor specifically targets African candidates seeking remote/visa-friendly global roles. This is AfriTalent's core differentiator.
2. **Trust-First Verification** — Competitors are anonymous. AfriTalent's candidate authenticity layer (verification queue, trust badges) builds employer confidence.
3. **Visa Sponsorship & Relocation Filtering** — Competitors focus on generic remote work. AfriTalent's visa-friendly job aggregation is unique.
4. **AI Application Assistant WITH Review Gate** — Most auto-apply tools spray applications. AfriTalent can be the **first to combine AI speed with human approval** (trust + quality).
5. **Premium Template Bundles as Subscription Perk** — Kickresume and Rezi charge for templates. AfriTalent can bundle ATS-compliant templates into the PRO subscription, creating perceived value beyond AI generation.

### 7.3 Where AfriTalent Is Behind

- **Semantic search quality** — Competitors like Jobscan and Rezi have mature ATS scoring. AfriTalent's retrieval layer is code-complete but unproven at scale.
- **Auto-apply volume** — LazyApply and LoopCV pitch "apply while you sleep." AfriTalent's autopilot exists but lacks the review gate and batch UX polish.
- **Design polish** — Kickresume and Canva offer beautiful templates. AfriTalent's resume builder outputs plain text only (no DOCX/PDF export).
- **Market awareness** — Sprout, Teal, and Oaki have 100k+ users. AfriTalent is pre-launch.

### 7.4 Strategic Recommendation

**Position AfriTalent as:**
> *"The only AI job platform built for African talent to access verified, visa-friendly global opportunities — with trust, transparency, and human-in-the-loop AI applications."*

**Priority features to outcompete:**
1. **Human-review gate for auto-apply** (differentiator vs LazyApply/Spray-and-pray)
2. **ATS template bundle integration** (differentiator vs plain-text AI builders)
3. **Verified employer badges + visa filter** (differentiator vs generic remote job boards)
4. **DOCX/PDF export** (table stakes — every resume builder must have this)

---

## 8. Premium Digital Resume Template Bundle — Integration Plan

### 8.1 Current Resume Section Health

| Component | State |
|-----------|-------|
| Resume Builder | Functional, plain-text output only, monolithic editing |
| Cover Letter | Functional, editable, **no save** |
| ATS Scanner | Backend exists, UI embedded in builder |
| Premium Gate UI | Exists but **not proactively used** in resume flows |
| AI Generation | Claude-powered, returns structured sections |
| Storage | `UserResume` table (JSON + rawText), `pdfUrl` unused |

### 8.2 Product Decision: Tier Gating

| Tier | Template Access |
|------|-----------------|
| **FREE** | Preview only (thumbnails, descriptions). No downloads. |
| **BASIC** | 1 download per month (teaser to drive PRO upgrade). |
| **PROFESSIONAL** | Unlimited downloads + "Use with my data" auto-fill. |

### 8.3 Phased Implementation

#### Phase 1: Gated Template Gallery (Quick Win — ~3–4 days)

1. **Schema:** Add `ResumeTemplate`, `TemplateFile`, and `TemplateDownload` tables.
2. **Backend:** `GET /api/skills/resume-templates` (list) + `GET /:id/download` (presigned S3 URL).
3. **Frontend:** New `/candidate/resume-templates` gallery page with template cards.
4. **Discovery:** Add links from dashboard, resume-builder ("Use a premium template" CTA), and resumes page.
5. **Assets:** Upload DOCX templates + thumbnail PNGs to S3.

#### Phase 2: Auto-Fill Integration (~4–5 days)

1. **DOCX Templating Engine:** Integrate `docx-templates` or `docx` npm library.
2. **Backend:** `POST /api/skills/resume-templates/:id/fill` — merges candidate profile data into DOCX placeholders.
3. **Frontend:** "Use with my data" CTA on template cards; "Export as DOCX" from resume-builder.

#### Phase 3: ATS-Driven Recommendations (~3–4 days)

1. **Backend:** Enhance ATS scanner to output `recommendedTemplateTags` based on job type/level.
2. **Frontend:** "Templates recommended for this role" section post-ATS-scan.
3. **Analytics:** Track conversion from scan → template download.

### 8.4 Schema Additions

```prisma
model ResumeTemplate {
  id           String   @id @default(uuid())
  name         String   @db.VarChar(120)
  description  String   @db.Text
  thumbnailUrl String   @db.VarChar(500)
  tags         String[] @default([])
  bestFor      String[] @default([])
  minPlan      SubscriptionPlan @default(PROFESSIONAL)
  sortOrder    Int      @default(0)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  files        TemplateFile[]
  downloads    TemplateDownload[]
}

model TemplateFile {
  id            String   @id @default(uuid())
  templateId    String
  template      ResumeTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  format        String   @db.VarChar(20) // DOCX, PDF, GOOGLE_DOCS, CANVA
  s3Key         String?  @db.VarChar(500)
  externalUrl   String?  @db.VarChar(500)
  fileSizeBytes Int?
  createdAt     DateTime @default(now())
}

model TemplateDownload {
  id           String   @id @default(uuid())
  userId       String
  templateId   String
  template     ResumeTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  format       String   @db.VarChar(20)
  source       String   @db.VarChar(40)
  downloadedAt DateTime @default(now())
  @@index([userId])
  @@index([templateId])
}
```

### 8.5 Entitlement Update

```typescript
// backend/src/lib/billing/entitlements.ts
interface Entitlements {
  // ... existing fields ...
  templateDownloadsPerMonth: number | null; // null = unlimited
}

const DEFAULT_ENTITLEMENTS = {
  FREE:         { templateDownloadsPerMonth: 0,   /* ... */ },
  BASIC:        { templateDownloadsPerMonth: 1,   /* ... */ },
  PROFESSIONAL: { templateDownloadsPerMonth: null, /* ... */ },
};
```

### 8.6 Immediate Next Steps for Templates

1. **Gather assets** — Convert existing Etsy templates to DOCX + generate thumbnail PNGs.
2. **Create migration** for `ResumeTemplate`, `TemplateFile`, `TemplateDownload`.
3. **Build Phase 1 gallery** behind `PROFESSIONAL` gate to validate demand before investing in DOCX auto-fill.
4. **Add `PremiumGate` to resume-builder** for non-PRO users (prevents 403-toast frustration).

---

## 9. Minimum Launch Package — Effort Roll-Up

Based on the `AFRITALENT_PREMIUM_QUALITY_BACKLOG.md` and the audits above, here is the minimum work required to move from "staging UAT" to "public beta":

### Wave 1: Security & Safety (1–2 days)

| Task | Effort | Owner |
|------|--------|-------|
| Rotate leaked API keys (OpenAI, Anthropic, Africa's Talking) | 2h | DevOps |
| Remove hardcoded JWT fallback | 1h | Backend |
| Add OAuth `state` validation (Google) | 4h | Backend |
| Verify Apple ID token signatures | 4h | Backend |
| Implement CSRF protection | 1 day | Backend + Frontend |
| `npm audit fix` backend + frontend | 2h | Full-stack |
| Fix S3 IAM policy prefix | 1h | DevOps |

### Wave 2: Editing & Consent (5–6 days)

| Task | Effort | Owner |
|------|--------|-------|
| Resume builder: per-section in-place editing (BACKLOG-3) | 2–3 days | Frontend |
| Cover letter: save draft to backend (BACKLOG-4) | 1 day | Full-stack |
| AI application flow: explicit review & approval gate (BACKLOG-2) | 2 days | Full-stack |

### Wave 3: Explanations & Trust (3–4 days)

| Task | Effort | Owner |
|------|--------|-------|
| Job matches: surface explanation + verified badge + visa pill (BACKLOG-1 finish) | 1–2 days | Full-stack |
| Surface "AI vs template" source pill (BACKLOG-12) | 2h | Frontend |
| Integrate quality rubric into generate handlers (BACKLOG-6) | 4h | Backend |

### Wave 4: Premium Value & Infrastructure (4–5 days)

| Task | Effort | Owner |
|------|--------|-------|
| Phase 1: Premium template gallery (gated downloads) | 3–4 days | Full-stack |
| Per-skill kill switches (BACKLOG-7) | 4h | Backend |
| Per-route rate limiter on `/api/skills/*` (BACKLOG-11) | 4h | Backend |
| Stripe test-mode end-to-end validation (BACKLOG-9) | 1 day | Full-stack |
| Fix 5 Playwright E2E failures + add trace artifacts | 1–2 days | QA / Frontend |

**Total Minimum Package:** **~13–17 eng-days** (excluding Flutterwave KYC which is vendor-blocked).

---

## 10. Recommendations

1. **Do NOT deploy to production** until Wave 1 (security) is fully closed. The four critical findings are genuine pre-launch blockers.
2. **Merge the current branch to `develop` cautiously** — the uncommitted changes (OAuth diagnostics, SMS OTP, notification feedback) are safe and improve UX, but they should be validated on staging before any prod consideration.
3. **Run a fresh Playwright pass** with `trace: 'retain-on-failure'` immediately; 5 unknown failures are unacceptable for a production launch.
4. **Validate Stripe test-mode checkout** end-to-end this week; billing is a controlled release item and must work before any paid marketing.
5. **Start Phase 1 of the template gallery** as soon as Wave 1 closes. It is the highest-leverage premium feature that differentiates AfriTalent from plain AI resume builders.
6. **Update `STAGING_RUNBOOK.md`** after every material live change, per repo rules.

---

## Appendix: References

- `STAGING_RUNBOOK.md` — Live environment state and AWS resource names
- `AFRITALENT_LAUNCH_READINESS_2026-04-29.md` — Last QA pass on `develop`
- `AFRITALENT_PREMIUM_QUALITY_BACKLOG.md` — 25 ranked backlog items
- `docs/SECURITY_AUDIT_REPORT_2026-05-06.md` — Detailed security findings
- `AGENT_BOOTSTRAP.md` — Project snapshot and delivery model
- `AGENTS.md` — Repository rules and deployment handoff
