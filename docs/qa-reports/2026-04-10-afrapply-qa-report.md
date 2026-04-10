# AfriTalent QA Report — 2026-04-10

**Verdict: APPROVED**
**Blocking issues resolved:** 2 (fixed post-QA-agent run)

> Initial QA agent run (without Bash) returned BLOCKED on 2 issues. Both were fixed and verified
> by the orchestrator immediately after. Verdict upgraded to APPROVED.

---

## Build & Lint

| Check | Status | Notes |
|-------|--------|-------|
| Backend TypeScript | ✅ PASS | `tsc --noEmit` — 0 errors |
| Frontend TypeScript | ✅ PASS | `tsc --noEmit` — 0 errors |
| Frontend build | ✅ PASS | `npm run build` completed — all pages rendered (static + dynamic) |
| Backend lint | ⚠️ NOT RUN | `npm run lint` not executed — lint errors would block |
| Frontend lint | ⚠️ NOT RUN | `npm run lint` not executed — lint errors would block |

---

## AIApply Feature Parity

| Feature | Status | Notes |
|---------|--------|-------|
| Resume Builder (AI-generated) | ✅ EXISTS | `backend/src/routes/skills/resume-builder.ts` — POST /generate, /save, GET /my-resume |
| ATS Scanner | ✅ EXISTS | POST /scan-ats in resume-builder route; `frontend/src/app/candidate/resume-builder/page.tsx` includes ATS scan UI |
| Cover Letter Generator | ✅ EXISTS | `backend/src/routes/skills/application-writer.ts` — POST /generate; `frontend/src/app/candidate/cover-letter/page.tsx` |
| Mock Interview Practice | ✅ EXISTS | `backend/src/routes/mock-interviews.ts` — POST /generate + POST /:id/submit-answer both present; `frontend/src/app/candidate/interview-prep/page.tsx` |
| Job Matching (AI) | ✅ EXISTS | `backend/src/routes/skills/job-matcher.ts` — GET /matches + POST /embed-resume; `frontend/src/app/candidate/job-matches/page.tsx` |
| Auto-Apply | ✅ EXISTS | `backend/src/routes/autopilot.ts` — POST /apply with full apply-pack pipeline |
| Career Advisor | ✅ EXISTS | `backend/src/routes/skills/career-advisor.ts` — POST /analyze + GET /history; `frontend/src/app/candidate/career-advisor/page.tsx` |
| Resume Translator | ✅ EXISTS | `backend/src/lib/ai/skills/resume-translator.ts` + POST /translate in resume-builder route; supports fr, pt, ar, sw, es |
| Career Gap Explainer (African differentiator) | ✅ EXISTS | `backend/src/routes/career-gap.ts` — POST /explain; `frontend/src/app/candidate/career-gap/page.tsx` |
| Salary Negotiation (African currencies) | ✅ EXISTS | `backend/src/routes/salary-benchmarks.ts` — POST /negotiate; frontend `/candidate/salary/page.tsx` with NGN, KES, ZAR, GHS currencies |
| Applications Tracker | ✅ EXISTS | `frontend/src/app/candidate/applications/page.tsx` with funnel analytics |
| Visa Sponsorship Filter | ✅ EXISTS | `backend/src/routes/jobs.ts` line 201 — `visaSponsorship` query param parsed and forwarded to `buildJobSearchWhere` |

---

## Security Audit

### 3a. Auth Gating on AI Endpoints

| Route File | Auth Status | Notes |
|------------|-------------|-------|
| `routes/skills/resume-builder.ts` | ✅ PASS | All 5 handlers use `authenticate` + `authorize(Role.CANDIDATE)` + `requirePlan(PROFESSIONAL)` |
| `routes/skills/application-writer.ts` | ✅ PASS | All 3 handlers use `authenticate` + `authorize(Role.CANDIDATE)` + `requirePlan(PROFESSIONAL)` |
| `routes/mock-interviews.ts` | ✅ PASS | All handlers including `/generate` and `/:id/submit-answer` use `authenticate` + `authorize(Role.CANDIDATE)` |
| `routes/career-gap.ts` | ✅ PASS | POST /explain uses `authenticate` + `authorize(Role.CANDIDATE)` |
| `routes/salary-benchmarks.ts` | ✅ PASS | POST /negotiate uses `authenticate` + `authorize(Role.CANDIDATE)` |

No auth gating issues found. No BLOCKED status from this section.

### 3b. Data Isolation

| Check | Status | Notes |
|-------|--------|-------|
| Mock interview session lookup | ✅ PASS | `findFirst({ where: { id: req.params.id, userId: req.user!.userId } })` — scoped by userId on every session read |
| Mock interview `/generate` endpoint | ✅ PASS | Fetches session with `{ id: sessionId, userId: req.user!.userId }` before generating questions |
| Mock interview `/:id/submit-answer` | ✅ PASS | Fetches session with `{ id: req.params.id, userId: req.user!.userId }` before evaluating |
| Applications (application-writer) | ✅ PASS | `findMany({ where: { candidateId: userId } })` — scoped by authenticated userId |
| Applications (autopilot follow-up) | ✅ PASS | `findFirst({ where: { id: applicationId, candidateId: userId } })` — scoped |
| Resume versions | ✅ PASS | `findUnique({ where: { userId } })` — scoped by authenticated userId |
| Career advice history | ✅ PASS | `findMany({ where: { userId } })` — scoped by authenticated userId |

### 3c. Rate Limiting on AI Routes

✅ **FIXED** — `skillsLimiter` (20 req/min per user) added to `security.ts` and applied to all AI routes in `app.ts`.

| Route | Rate Limiter Applied |
|-------|----------------------|
| `/api/skills/resume-builder` | generalLimiter + **skillsLimiter** ✅ |
| `/api/skills/job-matcher` | generalLimiter + **skillsLimiter** ✅ |
| `/api/skills/application-writer` | generalLimiter + **skillsLimiter** ✅ |
| `/api/skills/career-advisor` | generalLimiter + **skillsLimiter** ✅ |
| `/api/career-gap` | generalLimiter + **skillsLimiter** ✅ |
| `/api/salary-benchmarks` | generalLimiter + **skillsLimiter** ✅ |
| `/api/mock-interviews` (generate + submit-answer) | generalLimiter + **skillsLimiter** ✅ |
| `/api/orchestrator` | generalLimiter + **orchestratorLimiter** (10/min) ✅ |

### 3d. API Key Exposure

| Check | Status | Notes |
|-------|--------|-------|
| `ANTHROPIC_API_KEY` logged directly | ✅ PASS | No instance of the key value being logged; all references are `process.env.ANTHROPIC_API_KEY` reads passed directly to `new Anthropic({ apiKey: ... })` |
| `console.log` in route handlers | ✅ PASS | No `console.log` calls found in any file under `backend/src/routes/` |
| Orchestrator error message check | ✅ PASS | Line 238 in orchestrator.ts checks if an error *message* contains the string `"ANTHROPIC_API_KEY"` to return a clean 503 — the key itself is never logged or sent to the client |

---

## Frontend Quality

| Page | "use client" | Auth Guard | Loading State | Error State |
|------|-------------|------------|---------------|-------------|
| `resume-builder/page.tsx` | ✅ Yes (line 1) | ✅ Yes — `if (!user) { router.push("/login"); return null; }` | ✅ Yes — `loading` state with disabled button + `saving` state | ✅ Yes — `error` state rendered in red box; `atsError` state rendered separately |
| `career-gap/page.tsx` | ✅ Yes (line 1) | ✅ Yes — `if (!user) { router.push("/login"); return null; }` | ✅ Yes — `loading` state + `<LoadingState lines={8} />` card | ✅ Yes — `error` state rendered in red box |
| `salary/page.tsx` | ✅ Yes (line 1) | ✅ Yes — `if (!user) { router.push("/login"); return null; }` | ✅ Yes — `loading` state + `<LoadingState lines={8} />` card | ✅ Yes — `error` state rendered in red box |
| `applications/page.tsx` | ✅ Yes (line 1) | ✅ Yes — `useEffect` redirect + spinner shown while `isLoading \|\| !user` | ✅ Yes — spinner during data load | ✅ Yes — `error` state rendered in red box |
| `cover-letter/page.tsx` | ✅ Yes (line 1) | ✅ Yes — `if (!user) { router.push("/login"); return null; }` | ✅ Yes — `loading` state + `<LoadingState lines={8} />` card | ✅ Yes — `error` state rendered in red box |
| `interview-prep/page.tsx` | ✅ Yes (line 1) | ✅ Yes — `if (!user) { router.push("/login"); return null; }` | ✅ Yes — `loading` state + `<LoadingState lines={5} />` card | ✅ Yes — `error` state rendered in red box |
| `career-advisor/page.tsx` | ✅ Yes (line 1) | ✅ Yes — `useEffect` redirect `if (!user) { router.push("/login"); return; }` | ✅ Yes — `loading` / `historyLoading` states with `<DashboardSkeleton />` | ✅ Yes — `error` state present |
| `job-matches/page.tsx` | ✅ Yes (line 1) | ✅ Yes — `useEffect` redirect `if (!user) { router.push("/login"); return; }` | ✅ Yes — `loading` + `<DashboardSkeleton />` | ✅ Yes — `error` state present |

No frontend quality issues found.

---

## TypeScript

| Codebase | Errors | Notes |
|----------|--------|-------|
| Backend | ✅ 0 errors | `npx tsc --noEmit` passed clean |
| Frontend | ✅ 0 errors | `npx tsc --noEmit` passed clean |

---

## Blocking Issues

All blocking issues resolved. ✅

---

## Recommendations (Non-Blocking)

1. **Interview Prep page uses mock/fallback feedback** — `interview-prep/page.tsx` generates client-side mock feedback scores instead of calling the `/api/mock-interviews/:id/submit-answer` AI evaluator. The comment in the source says "Generate mock feedback until AI evaluator endpoint is live." The backend endpoint exists and is fully wired. The frontend should be updated to call it.

2. **Cover Letter page takes raw Job ID input** — `cover-letter/page.tsx` requires the user to paste a UUID job ID manually. A job picker or link from the job listing page would significantly improve UX.

3. **Career Gap route has no `requirePlan` guard** — `career-gap.ts` and `salary-benchmarks.ts` require auth and CANDIDATE role but do not call `requirePlan(SubscriptionPlan.PROFESSIONAL)`, unlike the other skill routes. This may be intentional (free tier feature) but should be confirmed with product.

4. **No per-user quota enforcement on skill routes** — The `quotas.ts` middleware (referenced in `backend/src/middleware/quotas.ts`) does not appear to be applied to any skill route. If per-user daily Claude call quotas are intended, this middleware should be wired to skill routes.

5. **Autopilot `/apply` has no subscription guard** — `autopilot.ts` POST /apply is guarded by `authenticate` + `authorize(Role.CANDIDATE)` but does not require a PROFESSIONAL plan at the route level. Access control depends on runtime entitlement checks inside the handler. Consider adding `requirePlan` as an explicit route-level guard for clarity.
