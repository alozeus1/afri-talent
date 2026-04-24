# AfriTalent Phase 1 — Gap Analysis
**Date:** 2026-04-10  
**Author:** Orchestrator Agent (Phase 1 audit)  
**Status:** COMPLETE — feeds Phases 2–7

---

## AUDIT METHODOLOGY

Full read of every relevant file. No assumptions. Status = what actually exists in code, not what docs claim.

---

## 1. BACKEND ROUTES AUDIT

### 1.1 `backend/src/routes/skills/resume-builder.ts`

| Endpoint | Status | Notes |
|----------|--------|-------|
| `POST /generate` | ✅ EXISTS | Calls `buildResume()`, PROFESSIONAL gate |
| `POST /save` | ✅ EXISTS | Upserts `UserResume`, fires embedding |
| `GET /my-resume` | ✅ EXISTS | Returns saved resume |
| `POST /scan-ats` | ❌ MISSING | Need ATS keyword + format check |
| `POST /translate` | ❌ MISSING | Need multilingual resume (EN/FR/PT/AR/SW) |
| `GET /versions/:candidateId` | ❌ MISSING | Version history list |

**Response format issue:** Returns `{ resume: result }` — not standardized. Should become `{ success, data, metadata }`.

**Import note:** Uses `import { z } from "zod"` — must update to `import { z } from "zod/v4"`.

---

### 1.2 `backend/src/routes/skills/application-writer.ts`

| Endpoint | Status | Notes |
|----------|--------|-------|
| `POST /generate` | ✅ EXISTS | Generates cover letter from saved resume + job |
| `POST /submit` | ✅ EXISTS | Creates `Application` record |
| `GET /my-applications` | ✅ EXISTS | Paginated application list |
| Tone selector | ❌ MISSING | No `tone` param (formal/conversational/executive) |
| Job URL parsing | ❌ MISSING | Can only use `jobId`, not paste URL |
| Version history | ❌ MISSING | No `CoverLetterVersion` model to persist history |

**Response format issue:** Returns `{ coverLetter, source }` — not standardized.

---

### 1.3 `backend/src/routes/skills/career-advisor.ts`

| Endpoint | Status | Notes |
|----------|--------|-------|
| `POST /analyze` | ✅ EXISTS | Full career analysis |
| `GET /history` | ✅ EXISTS | Past sessions |
| Career gap explainer | ❌ MISSING | Different concern — no endpoint to reframe gaps |

**Status:** Largely complete. Gap: no dedicated career gap tool.

---

### 1.4 `backend/src/routes/skills/job-matcher.ts`

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /matches` | ✅ EXISTS | Semantic match + fallback |
| `POST /embed-resume` | ✅ EXISTS | On-demand re-embedding |
| Culture fit scoring | ❌ MISSING | Currently skill/semantic only |
| Batch matching | ❌ MISSING | No bulk match-by-filters endpoint |
| Growth potential | ❌ MISSING | No career trajectory analysis |

---

### 1.5 `backend/src/routes/autopilot.ts`

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /status` | ✅ EXISTS | Full agent status |
| `GET /matches` | ✅ EXISTS | Already returns `visaSponsorship`, `salaryMin/Max` |
| `POST /settings` | ✅ EXISTS | Automation preferences |
| `GET /pipeline` | ✅ EXISTS | Task queue + resume versions |
| `POST /resume-builder` | ✅ EXISTS | Synthesize resume version |
| `POST /follow-up/:id` | ✅ EXISTS | Follow-up drafts |
| `POST /interview-prep/:id` | ✅ EXISTS | Interview prep pack |
| `POST /apply` | ✅ EXISTS | On-demand apply with AI cover letter |
| `POST /batch` | ❌ MISSING | Bulk apply to N filtered jobs |
| `GET /batch/:batchId` | ❌ MISSING | Batch status tracking |

**Key finding:** `/apply` already handles single AI-assisted application end-to-end including follow-up + interview prep. Batch (`/batch`) is the only true gap here.

---

### 1.6 `backend/src/routes/mock-interviews.ts`

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /` | ✅ EXISTS | List sessions |
| `POST /` | ✅ EXISTS | Create session (manual title + optional question set) |
| `GET /:id` | ✅ EXISTS | Get session |
| `POST /:id/feedback` | ✅ EXISTS | Save scores + transcript |
| `POST /:id/privacy` | ✅ EXISTS | Retention settings |
| `POST /:id/artifacts` | ✅ EXISTS | Upload recording |
| `POST /generate` | ❌ MISSING | **AI question generation by role/difficulty** |
| `POST /:id/submit-answer` | ❌ MISSING | **AI answer evaluation (STAR scoring, feedback)** |

**Key finding:** The session infrastructure is solid. What's missing is the AI-driven question generation and answer evaluation layer — the "brain" of mock interview prep.

---

### 1.7 `backend/src/routes/jobs.ts`

| Filter/Field | Status | Notes |
|-------------|--------|-------|
| `visaSponsorship` | ✅ EXISTS | Full filter and schema |
| `salaryMin/Max` | ✅ EXISTS | Full filter and schema |
| `country` | ✅ EXISTS | |
| `remote` | ✅ EXISTS | |
| `matchScore` in response | ⚠️ PARTIAL | Available in autopilot `/matches` but not in main `/jobs` endpoint |
| AI-ranked sort | ❌ MISSING | Jobs sorted by publishedAt, not match score |

---

### 1.8 Missing Routes (no equivalent exists)

| Route | Purpose |
|-------|---------|
| `backend/src/routes/career-gap.ts` | Career gap explainer + reframing tool |
| `backend/src/routes/salary-benchmarks.ts` | African market salary data by role/country/currency |
| ATS scan endpoint | Either extend resume-builder or new route |
| Resume translator endpoint | Either extend resume-builder or new route |

---

## 2. PRISMA SCHEMA AUDIT

### 2.1 Models that EXIST (do not recreate)

| Model | Notes |
|-------|-------|
| `UserResume` | User's saved resume (rawText + structured content) |
| `CandidateResumeVersion` | Autopilot-generated tailored versions with score/keywords |
| `MockInterviewSession` + `MockInterviewArtifact` | Full mock interview infrastructure |
| `SalaryNegotiationSession` | Salary negotiation records |
| `CompanyReview` + `CompanyRatingAggregate` | Company reviews and ratings |
| `SalaryReport` | Salary data (crowdsourced) |
| `ImmigrationProcess` + `ImmigrationStep` | Visa/immigration workflows |
| `CareerAdvice` | Career advisor session history |
| `JobAlert` | Job match alerts with `matchScore` |
| `SavedSearch` | Saved job searches with `visaSponsorship` filter |
| `Job` | Has `visaSponsorship` (enum), `salaryMin`, `salaryMax`, `currency` |
| `Application` | Applications with status, coverLetter, cvUrl |

### 2.2 Models that MUST BE ADDED

| Model | Status | Priority |
|-------|--------|----------|
| `AtsReport` | ❌ MISSING | P1 — needed for scan-ats endpoint |
| `CoverLetterVersion` | ❌ MISSING | P1 — needed for cover letter version history |
| `AutoApplyBatch` | ❌ MISSING | P1 — needed for batch autopilot |
| `SalaryBenchmark` | ❌ MISSING | P2 — African market salary data |
| `CareerGapSession` | ❌ MISSING | P2 — career gap analysis history |

### 2.3 Models close enough to reuse (no new model needed)

| Need | Use instead |
|------|------------|
| Resume version storage | `CandidateResumeVersion` (already has score, keywords, content) |
| Interview session | `MockInterviewSession` (already exists with questionSet field) |
| Company insights | `CompanyReview` + `CompanyRatingAggregate` (already exists) |

---

## 3. AI LIB AUDIT

### 3.1 Files that EXIST in `backend/src/lib/ai/skills/`

| File | Function | Status |
|------|----------|--------|
| `resume-builder.ts` | `buildResume(input)` | ✅ Full Claude implementation |
| `application-writer.ts` | `writeCoverLetter(input)` | ✅ Full Claude + template fallback |
| `career-advisor.ts` | `analyseCareer(input)` | ✅ Full Claude implementation |
| `job-matcher.ts` | `findJobMatches()`, `embedUserResume()` | ✅ Semantic + keyword matching |

### 3.2 Other AI files in `backend/src/lib/ai/`

| File | Purpose | Status |
|------|---------|--------|
| `cover-letter.ts` | Quick cover letter (autopilot use) | ✅ EXISTS |
| `claude.ts` | Anthropic client setup | ✅ EXISTS |
| `orchestrator/` | Multi-agent orchestrator | ✅ EXISTS |

### 3.3 AI functions MISSING (must create)

| File | Function(s) | Priority |
|------|-------------|----------|
| `skills/ats-scanner.ts` | `scanResumeAts(resumeText, jobDesc)` | P1 |
| `skills/interview-question-generator.ts` | `generateInterviewQuestions(role, difficulty, count)` | P1 |
| `skills/interview-answer-evaluator.ts` | `evaluateInterviewAnswer(question, answer, expectedPoints)` | P1 |
| `skills/resume-translator.ts` | `translateResume(resumeText, targetLanguage)` | P2 |
| `skills/career-gap-explainer.ts` | `explainCareerGap(resume, gapDates, context)` | P2 |
| `skills/salary-negotiator.ts` | `generateNegotiationGuidance(role, location, offeredSalary)` | P2 |

**All existing AI files use:**
- `claude-sonnet-4-6` via env var `AI_QUALITY_MODEL`
- `MOCK_AI=1` stub path
- `AI_DISABLED=1` kill switch
- `import Anthropic from "@anthropic-ai/sdk"` (not AI SDK)
- Own `import { z } from "zod"` (needs update to `"zod/v4"`)

---

## 4. FRONTEND PAGES AUDIT

### 4.1 Pages that EXIST

| Route | Status | Quality Gap |
|-------|--------|-------------|
| `/candidate/resume-builder` | ✅ EXISTS | Simple form — no split-pane preview, no ATS score, no template selector |
| `/candidate/career-advisor` | ✅ EXISTS | Functional |
| `/candidate/job-matches` | ✅ EXISTS | Shows matches |
| `/candidate/applications` | ✅ EXISTS | Timeline view |
| `/candidate/skills` | ✅ EXISTS | Skills management |
| `/interviews` | ✅ EXISTS | Mock interview sessions |
| `/salaries` | ✅ EXISTS | Salary data page |
| `/immigration` | ✅ EXISTS | Immigration/visa page |
| `/companies/[id]` | ✅ EXISTS | Company detail |
| `/jobs` | ✅ EXISTS | Job board |
| `/pricing` | ✅ EXISTS | Pricing page |

### 4.2 Pages MISSING

| Route | Priority | Purpose |
|-------|----------|---------|
| `/candidate/cover-letter` | P1 | Cover letter generator with preview |
| `/candidate/interview-prep` | P1 | AI question gen + answer evaluation |
| `/tools/career-gap` | P2 | Career gap explainer |
| `/insights/salary` | P2 | African market salary benchmarks |
| `/candidate/autopilot/batch` | P2 | Batch apply tracking |

### 4.3 Pages that exist but need significant UX upgrade

| Route | Current State | Needed Upgrade |
|-------|--------------|----------------|
| `/candidate/resume-builder` | Single-pane form | Split pane editor + live preview + ATS score + template selector |
| `/interviews` | List view only | AI question generation + answer evaluation UI |
| `/jobs` | Basic list | Match score badges, visa sponsorship highlight |

---

## 5. FRONTEND COMPONENTS AUDIT

### 5.1 UI components that EXIST (`/components/ui/`)

`badge.tsx`, `button.tsx`, `card.tsx`, `input.tsx`, `retry-button.tsx`, `skeleton.tsx`

### 5.2 Domain components that EXIST

| Component | Location |
|-----------|----------|
| `application-writer-modal.tsx` | `/components/skills/` |
| Auth forms, employer forms, job cards | `/components/auth/`, `/components/employer/`, `/components/jobs/` |

### 5.3 Components MISSING (must build)

| Component | Priority | Purpose |
|-----------|----------|---------|
| `ATSScoreDisplay.tsx` | P1 | Donut/bar ATS score visualization |
| `MatchScoreDisplay.tsx` | P1 | Green badge if score > 80% |
| `ResumePreview.tsx` | P1 | Render formatted resume (live preview pane) |
| `TemplateSelector.tsx` | P1 | 3-5 template styles (Harvard, Modern, Creative) |
| `InterviewQuestionCard.tsx` | P1 | Question display with AI feedback section |
| `SocialProof.tsx` | P2 | Testimonials + user count + company logos |
| `PremiumGate.tsx` | P2 | Upsell modal for free-tier users hitting limits |
| `SalaryChart.tsx` | P2 | Role/country salary comparison chart |
| `CurrencySelector.tsx` | P2 | NGN/KES/ZAR/GHS/USD switch |
| `LoadingState.tsx` | P1 | AI operation skeleton screens |

---

## 6. AFRICAN DIFFERENTIATOR GAP

| Differentiator | Status | Notes |
|----------------|--------|-------|
| Visa sponsorship job filter | ✅ EXISTS | In schema + jobs route |
| African salary data | ⚠️ PARTIAL | `SalaryReport` model exists, no benchmark API |
| Currency awareness (NGN/KES/ZAR) | ⚠️ PARTIAL | `currency` field on Job, no FX conversion |
| Career gap explainer | ❌ MISSING | |
| Local job board aggregation | ❌ MISSING | Jobs come from aggregator but no Africa-specific sources |
| Entry-level resume template | ❌ MISSING | No template variants yet |
| Cultural interview guidance | ❌ MISSING | |
| Multilingual UI (FR/PT) | ⚠️ PARTIAL | `SupportedLocale` enum has EN/FR/PT/AR, but UI/prompts EN-only |

---

## 7. PRIORITIZED WORK ORDER FOR AGENTS

### Database Agent — Phase 2 (Days 2-3)

Add to `schema.prisma`:

```
1. AtsReport        — P1, blocks resume-builder scan-ats endpoint
2. CoverLetterVersion — P1, blocks application-writer version history
3. AutoApplyBatch   — P1, blocks autopilot /batch endpoint
4. SalaryBenchmark  — P2, blocks salary insights page
5. CareerGapSession — P2, blocks career-gap route
```

---

### AI Integration Agent — Phase 4 (Days 3-6, parallel)

Create in `backend/src/lib/ai/skills/`:

```
1. ats-scanner.ts               — P1
2. interview-question-generator.ts — P1
3. interview-answer-evaluator.ts   — P1
4. resume-translator.ts         — P2
5. career-gap-explainer.ts      — P2
6. salary-negotiator.ts         — P2
```

**Pattern to follow:** Same as existing `resume-builder.ts` — MOCK_AI path, AI_DISABLED guard, Claude client, `zod/v4` validation.

---

### Backend Architect — Phase 3 (Days 3-6, after Phase 2)

**Extend existing files:**

| File | Add |
|------|-----|
| `skills/resume-builder.ts` | `POST /scan-ats`, `POST /translate`, `GET /versions/:candidateId` |
| `skills/application-writer.ts` | `tone` param on `/generate`, version persistence to `CoverLetterVersion` |
| `skills/job-matcher.ts` | Batch match endpoint |
| `autopilot.ts` | `POST /batch`, `GET /batch/:batchId` |
| `mock-interviews.ts` | `POST /generate` (AI questions), `POST /:id/submit-answer` (AI evaluation) |

**New files (only if no equivalent):**
- `backend/src/routes/career-gap.ts`
- `backend/src/routes/salary-benchmarks.ts`

**Response format:** All NEW/extended endpoints must use:
```json
{ "success": true, "data": {}, "metadata": { "model": "claude-sonnet-4-6", "processingTime": 0 } }
```
Existing endpoints: leave response format unchanged (avoid regressions).

---

### Frontend Architect — Phase 5 (Days 4-8)

**Upgrade existing pages:**

| Page | Upgrade |
|------|---------|
| `/candidate/resume-builder` | Add split-pane preview + ATS score + template selector |
| `/interviews` | Add AI question gen UI + answer submission + feedback card |
| `/jobs` | Add match score badges + visa sponsorship highlight |

**Build new pages:**

| Page | Priority |
|------|----------|
| `/candidate/cover-letter` | P1 |
| `/candidate/interview-prep` | P1 |
| `/tools/career-gap` | P2 |
| `/insights/salary` | P2 |

**Build missing components (all P1 unless noted):**
`ATSScoreDisplay`, `MatchScoreDisplay`, `ResumePreview`, `TemplateSelector`, `InterviewQuestionCard`, `LoadingState`, `PremiumGate` (P2), `SocialProof` (P2)

---

## 8. WHAT IS ALREADY SOLID (DO NOT TOUCH)

- Auth (`routes/auth.ts`, `middleware/auth.ts`) — complete, don't modify
- Billing/subscriptions — `billing.ts`, `entitlements.ts` — complete
- Autopilot single-apply flow — `autopilot.ts /apply` is production-ready
- Job board core — `jobs.ts` has visa/salary filters already wired
- AI client setup — `lib/ai/claude.ts` is the established pattern
- Prisma client — `lib/prisma.js` — use as-is
- Existing skills AI functions — all four work and have MOCK_AI paths

---

## 9. AGENT DEPENDENCY MAP

```
Database Agent (Phase 2)
  └─ adds: AtsReport, CoverLetterVersion, AutoApplyBatch, SalaryBenchmark
      └─ unblocks: Backend Architect for /scan-ats, /batch, cover letter versions

AI Integration Agent (Phase 4, parallel with Phase 3)
  └─ adds: ats-scanner.ts, interview-question-generator.ts, interview-answer-evaluator.ts
      └─ unblocks: Backend Architect for /scan-ats, mock-interviews /generate, /submit-answer

Backend Architect (Phase 3, after Phase 2 + uses Phase 4 functions)
  └─ extends routes, wires AI functions to routes
      └─ unblocks: Frontend Architect Phase 5B (consume APIs)
      └─ unblocks: QA Agent (test endpoints)

Frontend Architect (Phase 5A now, 5B after Phase 3)
  └─ 5A: audit + stub pages (no backend dependency)
  └─ 5B: wire hooks to real APIs

QA Agent (Phase 7, after Phase 3 + 5)
  └─ validates everything end-to-end
```

---

*Gap analysis complete. Database Agent should begin Phase 2 immediately. AI Integration Agent can begin Phase 4 prompts in parallel without waiting for DB.*
