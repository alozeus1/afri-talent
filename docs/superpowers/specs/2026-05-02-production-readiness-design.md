# AfriTalent Production Readiness — Design Spec

**Date:** 2026-05-02
**Branch:** `agentic-engineering-team-bootstrap`
**Scope:** Full round-trip workflow integrity (employer → candidate) and auth + trust
**Out of scope:** Subscription, payment, Stripe flows

---

## 1. Goal

Get AfriTalent to a state where a real employer can post a job, a real candidate can find and apply to it, and both parties can communicate — without hitting a dead end, a 404, or a silent failure. Auth must work end-to-end for email/password flows. Trust verification must surface failures gracefully where external services are absent.

**Success criteria:**

- An employer can register → onboard → post a job → see that job appear to candidates → receive and act on applications.
- A candidate can register → verify email → find a job → apply → track their application status.
- Either party can initiate a message thread tied to a job/application.
- Auth flows (register, login, email verify, password reset) complete without errors.
- OAuth (Google) fails gracefully when unconfigured, rather than crashing.
- Trust verification upload fails with a clear actionable message when S3 is absent.
- No button click results in a silent no-op or uncaught console error.
- No navigable route results in a 404 for a logged-in user following normal app navigation.

---

## 2. Current State Summary (Audit Findings)

### 2.1 What Works

The backend route layer is comprehensive — every page has a corresponding API route registered in `app.ts`. Core auth, profile, job, and application CRUD are structurally complete and have been verified in the recent staging pass.

**Confirmed working:**
- Auth: register (with role selection), login, logout, email verify, password reset
- Candidate dashboard, profile, browse jobs, job detail, apply, quick apply, view applications, funnel analytics
- Candidate AI tools: resume builder, cover letter, career advisor, career gap, interview prep, Mara chat (with consent modal)
- Candidate utilities: notifications, saved searches, preferences, calendar, learning, salary data, immigration tracker, interview experiences, skills assessments, referrals
- Employer: onboarding wizard, post job, edit/delete job, view applications, update status (REVIEWING/SHORTLISTED/ACCEPTED/REJECTED), analytics, branding, talent search, ATS integrations
- Public: jobs listing, job detail, company directory, company detail + reviews, resources, salaries

### 2.2 Critical Blockers

**BLK-1 — Job moderation bottleneck (employer → candidate round-trip is broken)**
Every job posted by an employer lands in `PENDING_REVIEW` status via the `POST /api/jobs` route and is invisible to candidates until an admin approves it. There is no trusted-employer auto-publish path. With no admin reviewing at launch, the candidate-facing jobs page is permanently empty regardless of how many employers post.

**BLK-2 — Employer-candidate messaging has no entry point**
The messaging system is complete on both backend (`/api/messages/threads`) and frontend (`/messages`, `/messages/[id]`). But neither the employer applications page nor the candidate application tracker has a "Send message" button. There is no way for either party to initiate a thread through normal app navigation. The inbox shows "No messages yet" with no create action.

**BLK-3 — Email verification drops the candidate out of the apply flow**
After verifying email, the verify-email page redirects to `/candidate` (dashboard). A candidate who registers → tries to apply → is told to verify email → verifies → lands on the dashboard has lost the job they were applying to. They must find it manually. This breaks the most common new-user funnel.

### 2.3 Medium Issues

**MED-1 — `application.candidate` join not verified in employer view**
The employer applications page renders `application.candidate?.name` and `application.candidate?.email` using optional chaining. If the `GET /api/applications/job/:jobId` Prisma query does not include the `candidate` relation, these fields silently show as blank. The `locked` field used for paywall gating is also cast via a TypeScript hack rather than a typed API response.

**MED-2 — Saved-search notification links may route to 404**
Ticket 005 is open. Notifications for saved-search job matches emit a link — the exact `href` in the notification payload needs to be verified to point to an existing page (`/candidate/saved-searches`), not a non-existent `/candidate/job-alerts`.

**MED-3 — Company detail page: no "Write a review" UI**
The backend accepts `POST /api/companies/:id/reviews` from authenticated candidates, but the company detail page (`/companies/[id]`) may not render a review submission form. If no form is present, the reviews system is invisible to users.

**MED-4 — Phase4-gated routes may not be handled gracefully in frontend**
Five backend route groups return `503 FEATURE_DISABLED` when their env flag is off: social, salary-negotiation sessions, university-partners admin, employer AI, bots. Any frontend component that calls these without a `try/catch` or graceful empty state will surface an unhandled error.

**MED-5 — Skills assessments page empty on fresh deployment**
`/api/skills-assessments/available` returns what is seeded in the database. On a clean deploy, this returns an empty array. The page renders but offers nothing to take. Needs seeded assessment data or a note directing users elsewhere.

**MED-6 — Blog page shows empty (wrong content source)**
`/blog` fetches `/api/resources?category=Weekly%20Hiring%20Trends`. No resources of that category are seeded. The page renders with no content and no authoring UI for candidates or employers to create it.

### 2.4 Auth + Trust Gaps

**AUTH-1 — Google OAuth requires env vars (P1 before launch)**
Needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. Callback page is hardened — fails gracefully with actionable messaging — but the sign-in button leads to an error until these are provisioned.

**AUTH-2 — S3 document uploads required for trust verification**
Candidate and employer trust verification require an S3 bucket for document uploads. Without it, uploads fail. The verification pages surface errors appropriately (hardened in prelaunch pass) but the workflow cannot complete end-to-end.

**AUTH-3 — Phone OTP requires SMS provider**
Twilio or equivalent must be configured for `POST /api/trust/candidate/phone/request-otp` to deliver codes. Hardened for missing config — shows actionable error — but the phone verification trust step cannot complete.

**AUTH-4 — Trust admin queue needs human coverage at launch**
Verification submissions from both candidates and employers land in the admin trust queue (`/api/admin/trust/verification-queue`). Without a human reviewing the queue, verification stays `PENDING` indefinitely. Needs a launch-day ops SLA.

---

## 3. Fix Architecture

### Phase A — Critical Blockers (implement first, highest ROI)

#### A1: Job moderation — fast-approve path for admins + auto-publish for verified employers

**Problem:** `POST /api/jobs` sets status `PENDING_REVIEW` unconditionally. At launch day 1, no employer has a VERIFIED trust badge yet, so the auto-publish rule alone solves nothing until at least one employer completes verification.

**Two-part solution:**

*Part 1 — Admin one-click approve (day 1 fix):*
- In `backend/src/routes/admin.ts`, ensure the job review endpoint (`PUT /api/admin/jobs/:id/review`) accepts `{ action: "APPROVE" }` and sets `status = PUBLISHED` in a single request.
- Confirm the admin jobs UI at `/admin` surfaces the pending jobs queue with an "Approve" button per job.
- If the button is missing or calls a different endpoint, add it.

*Part 2 — Auto-publish for verified employers (day 2+ fix):*
- In `backend/src/routes/jobs.ts` post handler (~line 368), after job creation, query the employer's `trustBadge` from `employerProfile`.
- If `trustBadge` is `VERIFIED` or higher: update the job status to `PUBLISHED` immediately and emit ops event `auto_published_trusted_employer`.
- If not verified: keep `PENDING_REVIEW` and include a field `pendingReason: "Your job is in review. Verified employers publish instantly."` in the 201 response so the frontend can surface it.
- No schema migration required — `status` and `trustBadge` fields already exist.

**Files:** `backend/src/routes/jobs.ts` (~line 368), `backend/src/routes/admin.ts` (review handler), `frontend/src/app/admin/page.tsx` (pending jobs queue UI)

#### A2: Employer-candidate messaging entry points

**Problem:** No UI to start a message thread from either side.

**Solution:** Add "Send message" CTAs in two places.

*Employer side — applications page (`frontend/src/app/employer/jobs/[id]/applications/page.tsx`):*
- Add a "Message candidate" button per application card.
- On click: call `POST /api/messages/threads` with `{ jobId, recipientId: candidateUserId }`.
- On success: route to `/messages/[newThreadId]`.
- Disable the button if `candidateAccessLocked` is true.

*Candidate side — applications page (`frontend/src/app/candidate/applications/page.tsx`):*
- Add a "View messages" or "Message employer" link per application card.
- Check if a thread exists for this job/application pair; if so link to it, if not offer to start one.
- Call `GET /api/messages/threads` and filter by `jobId` to find existing thread.

**Backend check:** Confirm `POST /api/messages/threads` accepts `recipientId` and `jobId`, and that the thread creation in `messages.ts` correctly links the job. Verify the thread response includes `id` for routing.

**Files:** `frontend/src/app/employer/jobs/[id]/applications/page.tsx`, `frontend/src/app/candidate/applications/page.tsx`, `backend/src/routes/messages.ts` (verify schema)

#### A3: Post-verification return-to flow

**Problem:** Email verify success → redirect to `/candidate` dashboard, losing the job URL.

**Solution:** Store `returnTo` before redirecting to verify email, restore after verification.

*Where the candidate tries to apply and hits the email-not-verified gate:*
- The `JobApplyPanel` component (or wherever the 403 `EMAIL_NOT_VERIFIED` is caught) should `sessionStorage.setItem('verifyReturnTo', window.location.href)` before redirecting to `/verify-email` or `/candidate` prompts.

*In `frontend/src/app/verify-email/page.tsx`:*
- After `setStatus("success")`, read `sessionStorage.getItem('verifyReturnTo')`.
- If present: clear it and redirect there instead of hardcoded `/candidate`.
- If absent: redirect to `/candidate` (existing behavior).

**Files:** `frontend/src/app/verify-email/page.tsx`, `frontend/src/components/jobs/job-apply-panel.tsx` (or wherever unverified apply is caught)

---

### Phase B — Medium Issues

#### B1: Verify `application.candidate` join in backend

**Check:** Read `backend/src/routes/applications.ts` at the `GET /job/:jobId` handler.
- Confirm `prisma.application.findMany` includes `include: { candidate: { select: { name: true, email: true, id: true } } }`.
- If missing: add the include.
- Type the `locked` field properly — remove the cast hack, add `locked?: boolean` to the Application type returned by that endpoint, or derive it from the subscription entitlements check already in the route.

**Files:** `backend/src/routes/applications.ts` (~line 313)

#### B2: Fix saved-search notification link

**Check:** Read `backend/src/lib/notifications/dispatcher.ts` (or wherever saved-search notifications are dispatched).
- Find the `href` field in the notification payload for saved-search match events.
- Confirm it points to `/candidate/saved-searches` (which exists) not `/candidate/job-alerts` (which does not).
- If wrong: update the href.

**Files:** `backend/src/lib/notifications/dispatcher.ts` or notification worker

#### B3: Company detail — add review submission form

**Check:** Read `frontend/src/app/companies/[id]/page.tsx` bottom section.
- If there is no review form: add a collapsible "Write a review" form (ratings 1-5 per dimension + pros/cons + job title).
- Submit to `POST /api/companies/:id/reviews` (auth required, CANDIDATE role).
- Show the form only to authenticated candidates; hide for employers and unauthenticated users.

**Files:** `frontend/src/app/companies/[id]/page.tsx`

#### B4: Phase4 503 graceful handling audit

**Check:** Read the following specific pages and confirm each `catch` block sets an error state and renders a graceful empty/disabled UI rather than throwing an unhandled error:
- `frontend/src/app/candidate/salary/page.tsx` — calls `/api/salary-benchmarks/negotiate`
- `frontend/src/app/employer/integrations/page.tsx` — check for any employer-AI calls
- `frontend/src/app/[locale]/employer/integrations/page.tsx` — same
- Any component importing `salaryNegotiation`, `social`, or `employerAi` from `@/lib/api` (run `grep -r "salaryNegotiation\|employerAi\|social\." frontend/src --include="*.tsx"`)

For each page found: if the catch block does `console.error` only (no state update), change it to `setError(message)` and render an inline "This feature is not available right now" card.

**Files:** Named pages above + grep-identified files

#### B5: Skills assessments — seed available assessments

**Action:** First confirm how `GET /api/skills-assessments/available` is implemented — read `backend/src/routes/skills-assessments.ts`.
- If it queries a DB table: add seed entries in `backend/prisma/seed.ts` for these skill names: `"JavaScript"`, `"TypeScript"`, `"Python"`, `"SQL"`, `"React"`, `"Node.js"`, `"Data Analysis"`, `"Communication"`, `"Project Management"`, `"Problem Solving"`.
- If it returns a hardcoded list: expand that list to include the above 10 entries and ensure it is exported as a constant, not inlined.
- The `SkillAssessment` Prisma model likely has `skillName` as the key field — seed each as `{ skillName: "JavaScript", level: "intermediate", ... }` matching whatever fields the model requires.

**Files:** `backend/src/routes/skills-assessments.ts`, `backend/prisma/seed.ts`

#### B6: Blog — add early-access placeholder or redirect

**Action:** The `/blog` page should either:
- Show an "Early access — check back soon" state with a subscribe form, OR
- Redirect to `/resources` which has real content via the resources API.

The current empty state looks like a broken page.

**Files:** `frontend/src/app/blog/page.tsx`

---

### Phase C — Auth + Trust

#### C1: Google OAuth env var documentation and graceful degradation

**Action:**
- Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` to `docs/env-required.md` with instructions (already partially done in `docs/oauth-setup.md`).
- Confirm login page hides the "Sign in with Google" button (or shows it as disabled with tooltip) when `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` is not set.
- If the button is always visible: add a check so it shows a clear "Not configured in this environment" message rather than a confusing error flow.

**Files:** `frontend/src/app/login/page.tsx`, `frontend/src/app/register/page.tsx`, `docs/env-required.md`

#### C2: S3 document upload — verify error surface and add guidance

**Action:**
- Confirm `POST /api/trust/employer/artifacts` and `POST /api/trust/candidate/artifacts` return a clear `400` or `503` with a message like "Document upload is not available in this environment" when S3 is not configured.
- Add an inline banner on the trust verification pages: "Document upload requires environment configuration. Contact your administrator if this persists."
- Ensure the banner is conditional on an error response, not always visible.

**Files:** `backend/src/routes/trust.ts` (artifact upload handlers), `frontend/src/app/candidate/trust/page.tsx`, `frontend/src/app/employer/trust/page.tsx`

#### C3: Phone OTP — confirm graceful degradation on missing SMS provider

**Action:**
- Verify `POST /api/trust/candidate/phone/request-otp` returns a clear error (not 500) when SMS provider is not configured.
- Verify the frontend shows that error message to the user rather than a generic spinner timeout.

**Files:** `backend/src/routes/trust.ts` (phone OTP handler), `frontend/src/app/candidate/trust/page.tsx`

#### C4: Launch ops runbook — trust queue SLA

**Action:** Add a section to `STAGING_RUNBOOK.md` and `docs/ops/` covering:
- Who reviews the trust verification queue at launch.
- What the expected turnaround SLA is.
- How to access the admin trust queue (`/admin/trust`).
- What constitutes an approvable vs. rejectable submission.

**Files:** `STAGING_RUNBOOK.md`, `docs/ops/trust-review-runbook.md` (new)

---

## 4. Implementation Order

Execute in this sequence to maximize unblocking ROI:

| Wave | ID | Fix | Risk | Est. Effort |
|------|----|-----|------|-------------|
| 1 | A1 | Auto-publish for verified employers | Low | Small |
| 1 | A3 | Post-verify returnTo flow | Low | Small |
| 1 | B1 | Verify application.candidate join | Low | Tiny |
| 2 | A2 | Messaging entry points (employer + candidate) | Medium | Medium |
| 2 | B2 | Fix saved-search notification link | Low | Tiny |
| 2 | B3 | Company review submission form | Low | Small |
| 3 | B4 | Phase4 503 graceful handling audit | Low | Small |
| 3 | B5 | Seed skills assessments | Low | Small |
| 3 | B6 | Blog empty state | Low | Tiny |
| 4 | C1 | OAuth graceful degradation | Low | Small |
| 4 | C2 | S3 upload error surface | Low | Small |
| 4 | C3 | Phone OTP degradation verify | Low | Tiny |
| 4 | C4 | Trust ops runbook | None | Small |

---

## 5. Out of Scope

- Subscription / Stripe / billing flows
- Phase4-gated features (social, employer AI, bots, salary negotiation sessions)
- ATS integrations (structurally complete, untested)
- Real content seeding (blog posts, interview experiences, immigration templates) beyond assessment seed
- Mobile responsiveness polish
- Accessibility audit

---

## 6. Verification Criteria Per Fix

| Fix | How to verify |
|-----|--------------|
| A1 | Employer with `VERIFIED` trust badge posts a job → job appears in candidate job listing immediately |
| A2 | Employer clicks "Message candidate" on applications page → thread created → routed to `/messages/[id]` |
| A3 | Candidate registers → attempts apply → prompted to verify email → verifies → redirected back to job detail page |
| B1 | Employer opens applications page → candidate name and email render correctly for all applications |
| B2 | Saved-search notification → click link → lands on `/candidate/saved-searches` (not 404) |
| B3 | Authenticated candidate visits `/companies/[id]` → sees "Write a review" form → submits → review appears |
| B4 | Pages calling Phase4-gated APIs with flags off show empty/disabled state, no console errors |
| B5 | `/candidate/skills` page shows at least 10 available assessments to take |
| B6 | `/blog` shows early-access state or redirects to `/resources` |
| C1 | Login page with no Google env vars: button is hidden or shows "not configured" tooltip |
| C2 | Trust verification upload with no S3: clear inline error, no 500 |
| C3 | Phone OTP request with no SMS provider: clear inline error, no spinner timeout |
| C4 | `STAGING_RUNBOOK.md` and ops runbook updated |
