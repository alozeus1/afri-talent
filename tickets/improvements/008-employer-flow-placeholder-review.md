# Employer Flow Placeholder Review

- Problem: Employer onboarding, company directory, trust, and application review
  pages must avoid fake placeholder proof while still being useful.
- Expected behavior: Empty states are honest and actionable; registered employer
  data appears where available; premium prompts are clear but not misleading.
- Affected area: employer dashboard, company directory, onboarding, trust,
  applications, billing prompts.
- Assigned agent: Product Manager Agent with UI/UX Engineer Agent.
- Risk level: Medium.
- Acceptance criteria: Placeholder/demo content is removed or labeled; empty
  states include next actions; paid gating copy is accurate.
- Test plan: Manual copy audit and Playwright assertions for directory and
  employer application pages.
- Human approval requirement: Required before merge for product copy changes.
