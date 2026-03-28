# AfriTalent Operations

This directory is the source of truth for production-readiness operations artifacts.

Core docs:

- `SLO_DEFINITIONS.md`
- `ALERT_CATALOG.md`
- `DASHBOARD_CATALOG.md`
- `INCIDENT_SEVERITY_AND_ESCALATION.md`
- `INCIDENT_TEMPLATES.md`
- `PRODUCTION_READINESS_CHECKLIST.md`
- `ROLLOUT_AND_ROLLBACK.md`
- `FAILURE_DRILL_TEST_PLAN.md`
- `TOOLING_RECOMMENDATIONS.md`
- `BILLING_RECONCILIATION_OPERATIONS.md`

Runbooks live in `docs/runbooks/`.

Implemented platform support surfaces:

- Admin ops overview: `GET /api/admin/operations/overview`
- Admin dead-letter inspection: `GET /api/admin/operations/dead-letters`
- Backend health endpoints: `/health`, `/api/health`, `/ready`, `/api/ready`, `/live`, `/api/live`
- CloudWatch dashboards: `<project>-<env>-platform-overview`, `<project>-<env>-application-ops`

Operational assumptions:

- App Runner is the current compute runtime for frontend and backend.
- RDS PostgreSQL is the only production database.
- Redis remains an optional but strongly recommended dependency for token revocation, locks, idempotency, and operational dead-letter state.
- Geography/device performance visibility needs browser-side RUM to be complete; the server-side ops layer now exists, and the recommended RUM integrations are captured in `TOOLING_RECOMMENDATIONS.md`.
