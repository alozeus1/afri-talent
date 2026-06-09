# AfriTalent Architecture

## Application Stack

- Frontend: Next.js App Router, React, TypeScript.
- Backend: Express, TypeScript, Prisma.
- Database: PostgreSQL.
- Auth: custom JWT issued by the backend and stored in HttpOnly cookies, with
  password login, Google OAuth, GitHub OAuth, and role-aware UI/API checks.
- AI services: backend AI skill/orchestration modules, including Mara product
  knowledge and candidate/application assistance.
- Testing: Vitest/Supertest for backend, Jest for frontend units, Playwright for
  E2E, Lighthouse CI for performance/accessibility signals.

## Runtime Stack

- Shared non-prod runtime: AWS App Runner for frontend/backend.
- Images: Amazon ECR.
- Data: Amazon RDS PostgreSQL.
- Files: S3 uploads.
- Secrets: AWS Secrets Manager.
- Infrastructure as code: Terraform in `infra/terraform`.
- CI/CD: GitHub Actions.

## Key Boundaries

- `frontend/` owns user-facing routes, layouts, forms, dashboards, and E2E tests.
- `backend/` owns API routes, auth, Prisma models, background workers, matching,
  trust logic, uploads, and service integrations.
- `infra/terraform/` owns AWS resources and must not be applied without human
  approval.
- `.github/workflows/` owns CI/CD automation and must keep production-impacting
  jobs behind approval gates.

## Current Integration Notes

- `develop` is the staging integration branch and can trigger shared staging
  deployment workflows.
- `main` is reserved for production promotion.
- Production is not considered fully launched.
- Runtime migrations currently run through the backend deployment path for
  staging; destructive migrations require explicit human approval.
