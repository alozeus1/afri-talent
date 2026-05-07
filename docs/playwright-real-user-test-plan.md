# Playwright Real User Test Plan

Use this plan after readiness fixes and before public early access.

## Setup

- Backend running on `http://localhost:4000`
- Frontend running on `http://localhost:3000`
- Seed/test user available from `frontend/e2e/fixtures/auth.ts`
- Local OTP preview may use `TEST_SMS_OTP_PREVIEW=1`

## Candidate Journey

1. Visit homepage and verify honest early-access messaging.
2. Register or log in as a candidate.
3. Complete/update candidate profile and reload to confirm persistence.
4. Open dashboard and use primary quick actions.
5. Open Trust Center and test phone OTP in safe test mode.
6. Upload or paste resume in AI Assistant and run analysis.
7. Search jobs and filter by remote, visa, relocation, and role.
8. Open job detail and save/unsave.
9. Confirm AI match access or clear plan-gate messaging.
10. Generate an Apply Pack where plan allows.
11. Open Cover Letter and select a job from the picker.
12. Open Resume Builder and confirm profile prefill.
13. Open notifications, mark read, and submit relevance feedback.
14. Open alert preferences, saved searches, applications tracker, pricing, and company directory.
15. Test forgot-password safe generic messaging.
16. Test mobile viewport, dark mode, and at least one non-English locale route.

## Public Proof Checks

- No fake testimonials.
- No fake company reviews.
- No fake employer counts.
- No fake partner logos.
- Company directory empty state is honest when no verified employers exist.
- Mara does not claim employer partnerships unless verified data is present.

## Reporting

Retain the Playwright HTML report and screenshots/videos for failures. Classify remaining failures as P0 launch blockers, P1 launch improvements, or P2 follow-up.
