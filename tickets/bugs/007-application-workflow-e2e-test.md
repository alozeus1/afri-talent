# Application Workflow E2E Test

- Problem: Application flows need durable coverage for direct AfriTalent apply
  and employer-site apply behavior.
- Expected behavior: Candidates can apply directly on AfriTalent where enabled,
  and external employer-site applications open the correct URL without creating
  false application records.
- Affected area: job detail page, applications API, employer applications page,
  job post form.
- Assigned agent: QA Tester Agent with Frontend Engineer Agent.
- Risk level: High.
- Acceptance criteria: Playwright covers direct apply, duplicate apply handling,
  external apply link, and employer application visibility/paywall behavior.
- Test plan: Playwright E2E with seeded test candidate/employer and backend API
  assertions where appropriate.
- Human approval requirement: Required before merge; production deploy separate.
