# QA Test Plan

## Current Automated Coverage

- Backend unit/API tests: `backend/src/__tests__/` with Vitest and Supertest.
- Frontend unit tests: Jest through `frontend npm run test:unit:ci`.
- Playwright E2E: `frontend/e2e/`.
- Lighthouse mobile performance: `frontend npm run test:perf:lighthouse`.

## Smoke Areas

- Homepage loads.
- Signup and login pages load.
- Candidate dashboard loads for test candidate credentials.
- Candidate profile and verification flows load.
- Job search and job detail pages load.
- Application workflow works for AfriTalent direct-apply jobs.
- Employer dashboard, onboarding, job post, trust, and applications pages load.
- 404 page behaves correctly.
- Mobile viewport has usable navigation and no severe overlap.

## Regression Areas

- Auth/session restore and role redirects.
- Candidate profile save and optional field clearing.
- Resume upload and job matching.
- Direct application and employer-site application paths.
- Learning progress persistence.
- Employer document upload and verification review queue.
- Company directory search across registered employers and seeded companies.
- Mara AI answers for jobs and application status.

## Test User Rules

- Use environment variables for test credentials.
- Do not hardcode real user credentials.
- Do not run tests against production unless explicitly approved.
