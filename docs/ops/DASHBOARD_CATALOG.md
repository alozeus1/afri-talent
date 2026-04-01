# AfriTalent Dashboard Catalog

## Implemented CloudWatch Dashboards

### 1. Platform Overview

Terraform name pattern:

- `afritalent-<environment>-platform-overview`

Widgets:

- App Runner request volume and 5xx for frontend and backend
- Frontend and backend latency and CPU
- Core product flow metrics:
  - signup success
  - login success
  - billing checkout success
  - job publish success
  - application submission success
  - notification failures
- Operational backlogs:
  - job ingestion freshness
  - moderation backlog
  - employer verification backlog
  - fraud detections
  - dead-letter backlog
- Database health and public synthetic success

### 2. Application Ops

Terraform name pattern:

- `afritalent-<environment>-application-ops`

Widgets:

- Auth, verification, and billing event counters
- Jobs, applications, and notification event counters
- Backend error log table
- Frontend error log table
- Fraud detections and dead-letter event stream
- Auth and billing event stream

## Admin Support Endpoints

These are designed to back internal support dashboards or admin pages:

- `GET /api/admin/operations/overview`
- `GET /api/admin/operations/dead-letters`

`/api/admin/operations/overview` exposes:

- ingestion freshness
- moderation and verification queue backlog
- abuse backlog
- fraud detections in the last 24h
- Redis health
- worker state summary
- dead-letter counts by source

## Visibility Gap To Close Before Full Launch

Performance by geography and device is not complete from server-side telemetry alone.

Before a full public launch, add one of:

- CloudWatch RUM for browser geography, device, and page-load segmentation
- Sentry Browser Performance with release health and device breakdown

Until that browser RUM layer is added, use server-side latency plus synthetic monitoring as the launch gate.

