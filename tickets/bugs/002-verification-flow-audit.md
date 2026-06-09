# Verification Flow Audit

- Problem: Candidate and employer verification flows include uploads, trust
  decisions, and review states that can fail silently or expose confusing errors.
- Expected behavior: Verification pages explain status, accept valid inputs,
  reject invalid inputs clearly, and create review records for admin action.
- Affected area: `backend/src/routes/trust.ts`, employer/candidate trust pages,
  S3 upload signing, admin review workflows.
- Assigned agent: Security Engineer Agent with Backend Engineer Agent.
- Risk level: High.
- Acceptance criteria: Upload signing works with required headers; status updates
  are visible; automated findings do not auto-approve sensitive claims without
  approved rules; failures show actionable messages.
- Test plan: Backend trust route tests, Playwright verification smoke, manual
  review of upload headers.
- Human approval requirement: Required before merge; required before any trust
  scoring or approval rule changes.
