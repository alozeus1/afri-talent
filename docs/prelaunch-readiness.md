# Prelaunch Readiness

Status: controlled early-access readiness pass in progress.

## Completed Changes

- Replaced public proof areas with honest early-access messaging.
- Removed placeholder company directory cards that could be mistaken for real employers.
- Added safe OAuth diagnostics and clearer callback failure handling.
- Hardened phone OTP delivery behavior for missing SMS provider config.
- Hid broken browser push controls when VAPID keys are absent.
- Clarified gated AI job match plan messaging.
- Replaced raw UUID-first cover letter flow with a searchable job picker and advanced manual fallback.
- Added resume builder profile prefill without silently overwriting drafts.
- Added resume upload support to AI Assistant using extracted text preview.
- Grounded Mara with AfriTalent product knowledge and no-fabrication rules.
- Added notification relevance feedback.

## Baseline Checks Before Changes

- Backend dependency install check: passed.
- Frontend dependency install check: passed with existing extraneous transitive packages.
- Backend lint: failed on `backend/src/workers/job-matcher.ts` regex escape, plus warnings.
- Frontend lint: passed with warnings.
- Backend typecheck: passed.
- Frontend typecheck: passed.
- Backend tests: passed outside sandbox; sandbox blocked Supertest listen with `EPERM`.
- Frontend unit tests: passed.
- Backend build: passed.
- Frontend build: passed with existing Recharts warning.
- Baseline Playwright: failed mainly because local auth rate limiting returned 429 during repeated login tests.

## High-Confidence Areas Not To Disturb

- Cookie-based auth and protected route guards.
- Existing AI resume analysis, job matching, apply pack, Mara, and guardrails.
- Localized `[locale]` route wrappers.
- Candidate profile persistence and dashboard flows.
- Trust Center core APIs and evidence model.
- Notification relevance threshold, title/role filtering, and flood prevention.

## Intentionally Deferred

- Real testimonials.
- Real employer reviews.
- Verified partner logos.
- Public success metrics.
- Public company directory content beyond verified employer data.

## Current Risk Assessment

P0:
- Full Playwright real-user pass still needs to be rerun after this patch set.

P1:
- External credentials for Google OAuth, SMS, SES, VAPID, Stripe, and semantic retrieval still need environment-level validation.
- Company reviews/admin moderation should stay hidden from public proof until real verified employers exist.

P2:
- Broader accessibility polish across every route.
- More visual regression coverage for mobile and dark mode.
