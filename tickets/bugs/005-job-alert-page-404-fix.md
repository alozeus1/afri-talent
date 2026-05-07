# Job Alert Page 404 Fix

- Problem: Job alert or preference links may route users to a missing page.
- Expected behavior: Job alert links resolve to a working candidate preferences
  or alert management page.
- Affected area: notifications, candidate preferences, job alert links, routing.
- Assigned agent: Frontend Engineer Agent with QA Tester Agent.
- Risk level: Medium.
- Acceptance criteria: All job alert CTAs route to existing pages; 404 is not
  shown for normal alert management; unauthenticated users are redirected safely.
- Test plan: Link audit, Playwright route smoke, frontend typecheck.
- Human approval requirement: Required before merge only.
