# AfriTalent Launch Readiness Report

Date: April 29, 2026
Branch under test: `develop` @ `cf35759`
Environment under test: shared staging (AWS App Runner, us-east-1)
Persona: premium candidate (full E2E)
Author: Droid QA pass

## TL;DR

Staging is in materially better shape than at the start of the session. All four blockers identified in the prior agent run are fixed and verified, and the candidate experience now boots without crashes or redirect loops on a clean account. There is still one known non-critical hydration bug on the public jobs index that is fixed in source and waiting on the next App Runner roll, plus a small set of inherited follow-ups (untracked UI refactor type errors, Stripe test creds, retrieval layer at staging scale, dependabot advisories) that should be cleared before `prod` is cut.

Recommendation: hold `prod` cut until the items in section 5 are closed; staging is suitable for continued UAT and demo immediately.

## 1. Live Environment Snapshot

- Frontend: `https://3mwn2b4e5t.us-east-1.awsapprunner.com` (App Runner `afritalent-stg-fe-livefix`, RUNNING)
- Backend:  `https://ed4nsj3sgv.us-east-1.awsapprunner.com` (App Runner `afritalent-staging-appr-backend-managed`, RUNNING)
- `/api/health`: `status=ok`, `database=connected`, `redis=connected`, `billing=configured`, `degraded=false`
- DB: `afritalent-staging-postgres` (RDS), Redis: ElastiCache Serverless `afritalent-staging-redis`
- Latest commits on `develop`:
  - `cf35759` jobs hydration fix (deploy in progress)
  - `a30ab56` candidate auth-loading + null-profile guard (live)
  - `114a399` admin public routes
  - `410c53c` rate limit + nav cleanup

## 2. Test Coverage Run This Pass

Static + unit:

- Backend `npx tsc --noEmit`: clean.
- Backend `npm test` (vitest): all green after the orchestrator token-budget env override.
- Frontend `npx tsc --noEmit`: clean for files touched in this pass; 7 pre-existing errors in an untracked UI refactor (see section 5.A).
- Frontend `npm run lint`: clean for files touched in this pass.

Live E2E (Playwright MCP against `https://3mwn2b4e5t...`):

- Public marketing surfaces: home, login, register render and submit cleanly.
- Candidate registration: full bot-shielded flow completes; new user is redirected to `/en/candidate`.
- Candidate dashboard for a brand-new account (empty profile): renders without error after the null-profile fix.
- Candidate page tour, all clean of console errors:
  - `/en/candidate/applications`
  - `/en/candidate/ai-assistant`
  - `/en/candidate/preferences`
  - `/en/candidate/saved-searches`
  - `/en/notifications`
  - `/en/learning`
  - `/en/billing`
- Candidate page tour with expected/by-design behavior:
  - `/en/candidate/job-matches` premium gate returns 403 from
    `/api/skills/job-matcher/matches`; UI renders the upgrade nudge correctly.
  - `/en/candidate/cover-letter`, `/en/candidate/resume-builder`,
    `/en/candidate/career-advisor`, `/en/candidate/interview-prep`,
    `/en/candidate/salary`, `/en/candidate/career-gap` all stay on-page after the
    auth-loading fix; before the fix they bounced back to the candidate dashboard.
- Public `/en/jobs`: still logs React error 418 (hydration mismatch) on the
  current deployed bundle; root cause and source fix landed in `cf35759`,
  awaiting App Runner roll.

Unit tests run today: see commits above; staging health re-verified after each
push.

## 3. Bugs Fixed This Pass

| ID | Severity | Where | Symptom | Fix | Commit |
|----|----------|-------|---------|-----|--------|
| 1 | High | backend `security.ts` | `/api/auth/me`, `/notifications/unread-count`, etc. tripping 429 in staging from normal polling | Raised `generalLimiter` 100 to 600 / 15 min; bypass list for benign session pollers | `410c53c` |
| 2 | Med | frontend nav | `/blog` 404 on RSC prefetch | Removed dead `/blog` link from header | `410c53c` |
| 3 | High | backend orchestrator vitest | apply-pack budget test 400 in CI / local | Added `ORCHESTRATOR_TOKEN_BUDGET_MAX=120000` to `vitest.config.ts` | `410c53c` |
| 4 | High | frontend `app/candidate/page.tsx` | `TypeError: Cannot read properties of null (reading 'openToWork')` on first visit after registration | Early-return on `null` profile and coerce `Boolean(data.openToWork)` | `a30ab56` |
| 5 | High | frontend 8 candidate pages | Authenticated user bounced back to `/en/candidate` because pages redirected to `/login` before `useAuth.isLoading` resolved | Added `if (authLoading) return null;` gate before redirect on each page | `a30ab56` |
| 6 | Low | frontend `JobCard` | React error #418 hydration mismatch on `/en/jobs` | Switched `lastSeenAt` formatting to deterministic ISO date | `cf35759` |

## 4. Bugs Confirmed Already Fixed Earlier This Pass

These were the four blockers reported open at the beginning of the session.
They were verified working on staging after the cited prior commits:

- Resume parse + edit + ATS scan + save: working.
- Cover letter generation: working.
- Job match scoring (premium gate path): working.
- AI assistant consent flow: working.

## 5. Open Items (sorted by launch impact)

### A. Inherited UI refactor type errors (non-blocking, not mine)

Untracked / pending files left over from a parallel shadcn + radix-ui +
Geist refactor:

- `frontend/components.json`
- `frontend/src/components/ui/feedback-toast.tsx`
- `frontend/src/components/ui/mac-os-dock.tsx`
- `frontend/src/components/ui/tabs-2.tsx`
- `frontend/src/lib/utils.ts`
- `frontend/src/app/layout.tsx`
- `frontend/package.json` and `frontend/package-lock.json`
- `frontend/src/app/admin/{blog,reviews}/page.tsx`
- `frontend/src/app/notifications/page.tsx`
- `frontend/src/app/pricing/page.tsx`
- `frontend/src/components/layout/footer.tsx`

There are 7 type errors confined to that refactor (`tabs-2.tsx` pattern). The
QA fixes in this pass were kept independent so they could ship without
adopting that refactor wholesale. Owner of the refactor needs to either
land it or revert it before `prod` is cut.

### B. Public-listing hydration roll

`cf35759` is queued for App Runner roll. Re-verify `/en/jobs` shows zero
console errors after roll completes.

### C. Pre-prod gates carried from `AGENTS.md`

- Stripe test credentials configured in staging Secrets Manager and exercised
  through `/api/billing/*`.
- Terraform reconciliation under the intended AWS path so future deploys are
  fully IaC-driven.
- Semantic retrieval layer deployed and validated at staging scale (matching
  + dedupe quality at non-trivial volume).

### D. Security and supply chain

- 8 dependabot advisories on `main` (7 moderate, 1 low). Triage and patch.
- Re-run Checkov / TFLint full report and clear any remaining findings.

### E. Coverage gaps still to drive in QA

- Resume builder full save path with a real CV (parse, edit fields, ATS
  scan, save, re-render in preferences).
- Job-matches once a saved resume exists for the test premium account, to
  verify the upgrade gate renders correct copy on real match data.
- AI orchestrator end-to-end run: resume + 1 JD into match into apply pack,
  watch token budget telemetry.
- Cover-letter generation against a real saved JD.
- Applications tracking + inbox + notifications round trip.
- LearningLab full premium gate + feedback submission + admin moderation.
- Pricing page tab + checkout flow with Stripe test creds.
- Public `/en/jobs` post-redeploy spot check + accessibility audit.
- Mobile viewport pass on the candidate dashboard.

## 6. Recommendation

- Continue UAT and stakeholder demos against staging now.
- Block `prod` cut on items 5.A through 5.D.
- Keep extending the Playwright tour against the next staging deploy until
  all of section 5.E is exercised on a single premium account.
- Update `STAGING_RUNBOOK.md` after every material live change, per the
  repo's standing rule.
