# AfriTalent × AIApply Orchestration Plan
**Date:** 2026-04-09  
**Lead:** Orchestrator Agent  
**Status:** ACTIVE — Agent team spawned

---

## 0. CODEBASE AUDIT SUMMARY

**What already exists (DO NOT duplicate):**

| Domain | File | Status |
|--------|------|--------|
| Resume Builder API | `backend/src/routes/skills/resume-builder.ts` | EXISTS — audit & extend |
| Application Writer API | `backend/src/routes/skills/application-writer.ts` | EXISTS — audit & extend |
| Career Advisor API | `backend/src/routes/skills/career-advisor.ts` | EXISTS — audit & extend |
| Job Matcher API | `backend/src/routes/skills/job-matcher.ts` | EXISTS — audit & extend |
| Auto-Apply (Autopilot) | `backend/src/routes/autopilot.ts` | EXISTS — extend batch logic |
| Mock Interviews | `backend/src/routes/mock-interviews.ts` | EXISTS — extend feedback |
| Jobs Board | `backend/src/routes/jobs.ts` | EXISTS — add filters |
| Immigration / Visa | `backend/src/routes/immigration.ts` | EXISTS — expand |
| Salary Negotiation | `backend/src/routes/salary-negotiation.ts` | EXISTS — expand |
| Salary Reports | `backend/src/routes/salary-reports.ts` | EXISTS — expand |
| Resume Parser | `backend/src/routes/resume-parser.ts` | EXISTS — integrate |
| Auth | `backend/src/routes/auth.ts` | EXISTS — do not modify |
| Billing | `backend/src/routes/billing.ts` | EXISTS — tie into premium gates |

**First principle: EXTEND, never duplicate. Every agent must audit the existing file before writing new code.**

---

## 1. OBJECTIVE

Build AfriTalent into a production-ready, SEO-optimized, Africa-first job platform that matches and surpasses AIApply's feature set, differentiated by:
- Africa-specific visa/immigration support
- Local salary data with currency awareness
- African market job board aggregation
- Career gap assistant
- Community/social proof
- Tiered freemium pricing for African markets (Flutterwave + Stripe)

---

## 2. PHASE BREAKDOWN

### PHASE 1 — Foundation Audit (Days 1-2)
**Goal:** Know exactly what's built and what's missing.  
**Agents:** Backend Architect, Database Agent

- [ ] Audit all existing skills routes — does each endpoint respond? Are they wired to AI?
- [ ] Audit Prisma schema — what models exist, what's missing?
- [ ] Audit frontend — which pages exist under `frontend/src/app/`?
- [ ] Identify all gaps vs AIApply feature parity list (Section 6 of AIAPPLY_ANALYSIS.md)
- [ ] Output: `docs/plans/2026-04-09-gap-analysis.md`

---

### PHASE 2 — Database & Schema (Days 2-3)
**Goal:** All new schemas migrated before backend writes new routes.  
**Agent:** Database Agent (MUST complete before Backend Architect writes new routes)

New models needed (check schema first — may already exist):
- `ResumeVersion` — optimized resume storage with ATS/match scores
- `CoverLetterVersion` — version history per job
- `AutoApplyBatch` — batch tracking (status: queued|in_progress|completed|failed)
- `InterviewSession` — mock interview sessions + answers
- `AtsReport` — ATS scan results and scores
- `CompanyInsight` — crowdsourced company reviews/interview data
- `SalaryBenchmark` — role/country/currency salary data

Deliverable: Prisma migrations run cleanly on staging, `npx prisma generate` passes.

---

### PHASE 3 — Core Feature APIs (Days 3-6)
**Goal:** Close all gaps in existing skills routes; add missing endpoints.  
**Agent:** Backend Architect (waits on Phase 2 schema)

**EXTEND (don't recreate):**

| Route File | What to Audit/Add |
|------------|-------------------|
| `skills/resume-builder.ts` | Add: `/generate`, `/scan-ats`, `/translate`, `/versions/:candidateId` |
| `skills/application-writer.ts` | Add: tone selector, version history, job URL parsing |
| `skills/job-matcher.ts` | Add: culture fit score, growth potential, batch matching |
| `autopilot.ts` | Add: `/batch`, `/batch/:id`, batch customization |
| `mock-interviews.ts` | Add: `/generate`, `/submit-answer`, feedback scoring |
| `jobs.ts` | Add: `visaSponsorship`, `salaryMin/Max`, `matchScore` filters |

**NEW routes (only if no existing equivalent):**
- `backend/src/routes/skills/resume-translator.ts` (if not in resume-builder)
- `backend/src/routes/career-gap.ts`
- `backend/src/routes/company-insights.ts`
- `backend/src/routes/salary-benchmarks.ts`

Standard response format for ALL endpoints:
```json
{
  "success": true,
  "data": {},
  "metadata": {
    "model": "claude-sonnet-4-6",
    "processingTime": 1234,
    "matchScore": 0.87,
    "atsScore": 0.92
  }
}
```

---

### PHASE 4 — AI Prompt Library (Days 3-6, parallel with Phase 3)
**Goal:** Quality AI prompts powering all features.  
**Agent:** AI Integration Agent (parallel with Backend Architect)

Prompt modules in `backend/src/lib/ai/prompts/`:
- `resume-optimizer.ts` — ATS-optimized resume rewrite
- `cover-letter-generator.ts` — personalized, tone-aware letters
- `interview-question-generator.ts` — role/difficulty-specific questions
- `interview-answer-evaluator.ts` — STAR method scoring + feedback
- `job-matcher.ts` — skill extraction + culture fit
- `career-gap-explainer.ts` — reframe gaps positively
- `salary-negotiator.ts` — market-aware negotiation guidance
- `ats-scanner.ts` — keyword gap analysis

Model: `claude-sonnet-4-6` (primary), fallback to `claude-haiku-4-5-20251001`  
All prompts must return valid JSON — validate with Zod before returning to route.

---

### PHASE 5 — Frontend Pages & Components (Days 4-8)
**Goal:** All core pages built and matching design system.  
**Agent:** Frontend Architect (can start Phase 5A in parallel with Phase 3)

**Phase 5A — Audit existing pages first:**
```
frontend/src/app/
frontend/src/components/
```

**Pages to build/verify:**
| Route | Component | Priority |
|-------|-----------|----------|
| `/tools/resume-builder` | ResumeEditor + ResumePreview + TemplateSelector | P1 |
| `/tools/cover-letter` | CoverLetterGenerator | P1 |
| `/dashboard/jobs` | JobFilters + JobCard + MatchScoreDisplay | P1 |
| `/tools/interview-prep` | MockInterviewInterface + FeedbackReport | P1 |
| `/applications` | ApplicationTimeline | P2 |
| `/insights/salary` | SalaryCharts + CurrencySelector | P2 |
| `/tools/career-gap` | CareerGapExplainer | P2 |
| `/companies/[id]` | CompanyInsights | P3 |

**Shared components:**
- `ATSScoreDisplay.tsx` — donut/bar score visualization
- `MatchScoreDisplay.tsx` — green badge if score > 80%
- `SocialProof.tsx` — testimonials, user count, company logos
- `LoadingState.tsx` — skeleton screens for AI operations
- `PremiumGate.tsx` — upsell modal for free-tier users

Design system: match existing Tailwind config + shadcn/ui. Mobile-first. Lighthouse > 90.

---

### PHASE 6 — Infrastructure & Env (Days 5-7)
**Goal:** All new env vars, secrets, monitoring, CI/CD updates.  
**Agent:** Infrastructure Agent (parallel with Phase 4/5)

Tasks:
- Add to `.env.example`: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, feature flags
- Verify Secrets Manager has `ANTHROPIC_API_KEY` under `afritalent-staging/app-secrets`
- Add CloudWatch dashboards: AI API latency, auto-apply credit usage, error rates
- Update `deploy-apprunner.yml`: add Prisma migration validation step
- Add billing alerts: $100/day AI API cost threshold
- Ensure `ENABLE_AUTO_APPLY`, `ENABLE_INTERVIEW_PREP` feature flags are wired

Do NOT apply Terraform until Backend Architect approves API surface.

---

### PHASE 7 — QA & Deployment Readiness (Days 8-10)
**Goal:** All features validated, security audited, performance benchmarked.  
**Agent:** QA/Reviewer Agent (after Phase 3+5 complete)

QA checklist:
- [ ] All API endpoints return correct shapes (unit + integration tests)
- [ ] Resume generation < 5s, job board load < 2s, ATS scan < 3s
- [ ] All endpoints require auth (except public)
- [ ] No user can access another user's data
- [ ] Rate limiting verified
- [ ] API keys never logged
- [ ] Mobile responsive (375px, 768px, 1440px)
- [ ] Lighthouse score > 90
- [ ] TypeScript: `npx tsc --noEmit` passes (both frontend and backend)
- [ ] `npm run lint` passes (both)
- [ ] `npm run build` passes (both)

Output: `docs/qa-reports/2026-04-09-afrapply-qa-report.md` with APPROVED/BLOCKED verdict.

---

## 3. AGENT RESPONSIBILITIES & FILE OWNERSHIP

| Agent | Owns | Must NOT touch |
|-------|------|----------------|
| Backend Architect | `backend/src/routes/skills/*`, route extensions | Frontend, infra, Prisma schema |
| Frontend Architect | `frontend/src/app/*`, `frontend/src/components/*` | Backend routes, Prisma, infra |
| AI Integration Agent | `backend/src/lib/ai/prompts/*`, `backend/src/lib/ai/*.ts` | Routes (provides functions only), frontend |
| Database Agent | `backend/prisma/schema.prisma`, `backend/prisma/migrations/*` | Routes, frontend, AI prompts |
| Infrastructure Agent | `.env.example`, `infra/terraform/*`, `.github/workflows/*` | App code, Prisma, frontend |
| QA Agent | `docs/qa-reports/*`, `docs/qa-plans/*` | Production code (read-only + test files) |

**Conflict rule:** Any file touching two domains → Orchestrator approves before merge.

---

## 4. DEPENDENCY ORDER

```
Phase 1 (Audit)
    ↓
Phase 2 (Database) ←── Must complete before Phase 3
    ↓
Phase 3 (Backend APIs) ←── Must complete before Phase 7
Phase 4 (AI Prompts)  ←── Parallel with Phase 3
Phase 5 (Frontend)    ←── Can start 5A (audit) immediately; 5B waits on Phase 3
Phase 6 (Infra)       ←── Parallel with Phase 3/4/5
    ↓
Phase 7 (QA) ←── Only after Phase 3 + 5 complete
```

---

## 5. SUCCESS CRITERIA

| Metric | Target | Measured by |
|--------|--------|-------------|
| Resume generation | < 5s end-to-end | QA Agent load test |
| Job board page load | < 2s | Lighthouse |
| ATS scan | < 3s | QA Agent |
| Auto-apply 100 jobs | < 60s | QA Agent |
| Lighthouse score | > 90 | Frontend Architect + QA |
| TypeScript errors | 0 | `tsc --noEmit` |
| Test coverage | > 80% | QA report |
| Mobile responsive | Pass all breakpoints | QA Agent |
| SEO: meta tags | All pages have title/description/OG | Frontend Architect |

---

## 6. AFRICAN DIFFERENTIATORS TO PRIORITIZE

These are NOT in AIApply — build these as AfriTalent competitive moat:

1. **Visa sponsorship filter** — jobs with visa support highlighted
2. **African currency-aware salary benchmarks** — NGN, KES, ZAR, GHS, USD
3. **Career gap explainer** — reframes gaps for African economic context
4. **Local job board aggregation** — Jobberman, LinkedIn Africa, local boards
5. **Entry-level / fresh grad resume template** — Africa has large early-career population
6. **Cultural interview guidance** — UK vs US vs Canada vs Africa-based hiring norms
7. **Freemium pricing** — 2-3 free docs/month, $5-8/month Pro (not $49/month)

---

## 7. COMMUNICATION PROTOCOL

- **Lead → Teammate:** Task assignment via this plan + direct message
- **Teammate → Lead:** Progress updates at each phase gate
- **Teammate → Teammate:** Database Agent notifies Backend Architect when migrations are ready
- **Frontend ↔ Backend:** Frontend Architect reads Backend Architect's API docs before wiring hooks
- **All → QA:** Tag QA Agent when a phase is complete and ready for review

---

## 8. PROGRESS TRACKER

| Phase | Agent | Status | Blocker |
|-------|-------|--------|---------|
| 1. Audit | Backend + DB | ⏳ Pending | — |
| 2. Database | Database Agent | ⏳ Pending | Waits on audit |
| 3. Backend APIs | Backend Architect | ⏳ Pending | Waits on Phase 2 |
| 4. AI Prompts | AI Integration Agent | ⏳ Pending | Parallel with 3 |
| 5. Frontend | Frontend Architect | ⏳ Pending | 5A parallel, 5B waits on 3 |
| 6. Infrastructure | Infrastructure Agent | ⏳ Pending | Parallel |
| 7. QA | QA Agent | ⏳ Pending | Waits on 3+5 |

---

*Update this tracker as phases complete. Commit changes with: `docs: update orchestration progress [phase N]`*
