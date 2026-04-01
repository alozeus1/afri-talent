# Go / No-Go Checklist (Phase 1/2)

Execution date: 2026-03-28

## Build + Test Gates
- [x] Backend unit/integration suite passes (`npm test` in `backend`).
- [ ] Frontend unit suite passes (`npm run test:unit` in `frontend`).
  - Note: targeted suites pass; full Jest run currently OOM.
- [ ] Playwright API + UI suites pass (`npm test` in `frontend` with required services running).
  - Current: API pass, UI has failing assertions (404, i18n routing, mobile keyboard focus).
- [ ] No skipped critical-path E2E tests in release branch run.
  - Current: 1 skip in mobile-drawer test for desktop project (expected), no critical API skips.

## Functional Gates
- [x] Candidate journey validated: signup/login, job browse, apply, verification gating.
- [x] Employer journey validated: signup, job posting, billing upgrade attempt.
- [x] Pricing region selection and checkout path validated.
- [x] OpenAPI docs available and current.
- [x] Google for Jobs schema emitted only for active jobs.

## Security + Compliance Gates
- [x] Unverified-user abuse paths blocked where required.
- [x] OAuth linking edge cases validated.
- [x] Webhook signature verification validated.
- [x] Rate limiting validated on auth/verification endpoints.
- [ ] Demo credentials hidden in production build.
  - Requires production build verification in staging/prod-like env.
- [ ] No new critical dependency/security advisories without mitigation.

## Performance + UX Gates
- [x] Core pages render skeleton/loading states under slow network.
- [x] Mobile drawer/hamburger behavior validated.
- [ ] 404 page and error states validated.
  - Failing in desktop+mobile UI suite.
- [ ] Lighthouse thresholds met (or waived with documented rationale).
  - Hard assertions pass, but TTI/LCP warnings require waiver or optimization.

## Operational Gates
- [ ] Rollback plan documented and tested.
- [x] Feature flags/env vars reviewed for prod safety.
  - Included migration + `E2E=1` test-mode run notes in release report.
- [ ] Monitoring dashboards and alerts green.
- [ ] Runbooks updated for any changed release behavior.

## Sign-off
- [ ] QA Lead sign-off
- [ ] Engineering Lead sign-off
- [ ] Product sign-off
- [ ] Release Manager approval

Decision:
- `GO` only if all mandatory gates above are complete and no open `P0/P1`.
- Otherwise `NO-GO` with action owners and new target date.

Current decision:
- `NO-GO` (open UX/accessibility defects + incomplete full frontend unit gate).
