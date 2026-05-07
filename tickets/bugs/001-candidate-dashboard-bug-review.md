# Candidate Dashboard Bug Review

- Problem: Candidate dashboard flows have had recent regressions around auth
  loading, profile null states, and dashboard actions.
- Expected behavior: Authenticated candidates can load the dashboard, see current
  status, and navigate to profile, jobs, applications, learning, and AI tools
  without crashes or incorrect redirects.
- Affected area: `frontend/src/app/candidate`, `frontend/src/lib/auth-context.tsx`,
  candidate API calls.
- Assigned agent: QA Tester Agent with Frontend Engineer Agent.
- Risk level: Medium.
- Acceptance criteria: Dashboard loads for a test candidate; no auth redirect
  loop; empty/null profile state is handled; main actions are visible and usable.
- Test plan: Run targeted Playwright candidate dashboard smoke test and frontend
  typecheck; add regression coverage for any reproduced bug.
- Human approval requirement: Required before merge; production deploy requires
  separate approval.
