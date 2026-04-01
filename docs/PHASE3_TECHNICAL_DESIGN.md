# Phase 3 Technical Design (Enterprise Foundation)

## Document Purpose

This document captures the enterprise-ready technical architecture for Phase 3 and maps directly to implemented code and API surfaces.

## Scope

1. Mobile app foundation reusing existing APIs
2. ATS integrations (Greenhouse, Lever, Workable)
3. AI video mock interviews with feedback + privacy/storage controls
4. Employer subscription tier alignment for new capabilities
5. Advanced analytics dashboard (funnel, posting performance, candidate pipeline)
6. Regional payment localization (Europe-first with Africa methods roadmap)

## Architecture Overview

### System Components

- Web frontend (`frontend/`): Next.js App Router, cookie/session auth usage, employer analytics + ATS UI
- Mobile app (`mobile/`): Expo scaffold with API client against existing backend
- API backend (`backend/`): Express + Prisma monolith exposing new Phase 3 route groups
- Data layer: PostgreSQL via Prisma, with new models for ATS sync, mock interview sessions, and analytics events
- Billing + entitlements: Regional pricing + plan entitlement matrix (DB-backed with safe defaults)

### Design Principles

- Reuse existing auth/session posture and avoid parallel auth stacks
- Keep source-system integration state auditable (sync run records)
- Treat interview data as sensitive by default (retention + PII controls)
- Keep analytics ingestion append-only, low-latency, and resilient
- Roll out via feature gates and tier-entitlement checks

## Data Model Changes

Implemented in `backend/prisma/schema.prisma` and migration:

- `backend/prisma/migrations/20260328170000_add_phase3_enterprise_foundation/migration.sql`

### New Enums

- `ATSProvider`: `GREENHOUSE`, `LEVER`, `WORKABLE`
- `ATSConnectionStatus`: `ACTIVE`, `ERROR`, `DISCONNECTED`
- `ATSSyncStatus`: `QUEUED`, `RUNNING`, `SUCCESS`, `PARTIAL`, `FAILED`
- `MockInterviewStatus`: `DRAFT`, `PROCESSING`, `READY`, `ARCHIVED`
- `MockInterviewVisibility`: `PRIVATE`, `TEAM_SHARED`
- `MockInterviewArtifactType`: `VIDEO`, `AUDIO`, `TRANSCRIPT`, `FEEDBACK_JSON`
- `AnalyticsEventCategory`: `ACQUISITION`, `ACTIVATION`, `ENGAGEMENT`, `CONVERSION`, `RETENTION`, `MONETIZATION`, `EMPLOYER_PIPELINE`, `SYSTEM`

### New Models

- `ATSConnection`: per-employer provider linkage, encrypted credentials, status, metadata, sync timestamps
- `ATSSyncRun`: immutable sync execution history + counters + errors
- `MockInterviewSession`: interview metadata, transcript, scoring, retention, visibility, status
- `MockInterviewArtifact`: storage key registry for media/artifacts
- `AnalyticsEvent`: event ingestion table for product metrics

### Entitlement Extensions

`PlanEntitlement` now includes:

- `atsIntegrations`
- `videoMockInterviews`
- `pipelineExports`
- `brandedCareerPage`
- `advancedFunnelMetrics`

## Backend/API Design

### ATS Integrations

Route: `backend/src/routes/ats.ts` mounted at `/api/ats`

Endpoints:

- `GET /api/ats/connections`
- `POST /api/ats/connections`
- `DELETE /api/ats/connections/:id`
- `POST /api/ats/connections/:id/sync`

Key behavior:

- Employer-only RBAC
- Access/refresh token encryption at rest (`backend/src/lib/secure-string.ts`)
- Provider adapters in `backend/src/lib/ats/providers.ts`
- Idempotent job upsert with source IDs and sync-run metrics

### Mock Interviews

Route: `backend/src/routes/mock-interviews.ts` mounted at `/api/mock-interviews`

Endpoints:

- `GET /api/mock-interviews`
- `POST /api/mock-interviews`
- `GET /api/mock-interviews/:id`
- `POST /api/mock-interviews/:id/feedback`
- `POST /api/mock-interviews/:id/privacy`
- `POST /api/mock-interviews/:id/artifacts`

Key behavior:

- Candidate-only access model
- Transcript + score capture with deterministic summary generation
- Optional PII redaction and retention-window updates
- Artifact registry decoupled from object storage provider

### Analytics Event Platform

Route: `backend/src/routes/analytics-events.ts` mounted at `/api/analytics`

Endpoints:

- `POST /api/analytics/events`
- `GET /api/analytics/model`
- `GET /api/analytics/summary` (admin)

Key behavior:

- Batch ingestion up to 50 events/request
- Optional auth support for anonymous + signed-in traffic
- IP hash capture (no raw IP persistence)

### Employer Advanced Analytics

Route extension in `backend/src/routes/employer-analytics.ts`:

- `GET /api/employer/analytics/advanced`

Provides:

- Funnel steps + step-to-step conversion
- Posting performance metrics (application rates, time-to-first-application)
- Candidate pipeline metrics (including avg review time)

### Regional Payments Localization

Route extension in `backend/src/routes/pricing.ts`:

- `GET /api/pricing/payment-localization`

Provides:

- Region currency/tax/payment metadata
- Europe VAT/invoicing metadata
- African methods roadmap metadata

## Mobile App Foundation

Scaffold implemented in `mobile/` (Expo):

- Existing auth endpoints reused (`/api/auth/login`, `/api/auth/me`, `/api/auth/logout`)
- Jobs listing/detail reused (`/api/jobs`)
- Dashboard shell for candidate roadmap expansion

Current files:

- `mobile/App.tsx`
- `mobile/src/lib/api.ts`
- `mobile/.env.example`

## Frontend Integration

### API Client Extensions

`frontend/src/lib/api.ts` now exposes:

- `ats` API client
- `mockInterviews` API client
- `analyticsEventsApi` API client
- `pricing.paymentLocalization()`
- `employerAnalytics.advanced()`

### New Employer UI Surface

- `frontend/src/app/employer/integrations/page.tsx` (ATS management)
- `frontend/src/app/[locale]/employer/integrations/page.tsx` (localized route)

### Analytics Dashboard Enhancement

- `frontend/src/app/employer/analytics/page.tsx` now renders advanced funnel/posting/pipeline metrics

## Security & Privacy Controls

- ATS credentials encrypted at rest (`AES-256-GCM` via `ATS_TOKEN_ENCRYPTION_KEY`)
- Interview sessions default to private visibility
- Configurable interview retention (`MOCK_INTERVIEW_RETENTION_DAYS`)
- PII redaction utilities for transcript processing
- Analytics IP hashing to reduce direct-identification risk

## Environment Variables (Phase 3)

Added in `backend/.env.example`:

- `WORKABLE_COMPANY_TOKENS`
- `ATS_TOKEN_ENCRYPTION_KEY`
- `MOCK_INTERVIEW_RETENTION_DAYS`

## Operational Considerations

### Reliability

- ATS sync writes explicit run records (`ATSSyncRun`) to support retries and diagnostics
- Provider failures mark connection status (`ERROR`) without deleting integration records

### Scaling Path

- Move sync execution from request path to background queue workers
- Partition analytics event storage and add retention/archive policy
- Add object storage lifecycle policies for interview artifacts

### Observability

Recommended metrics/alerts:

- ATS sync success rate and p95 duration
- Mock interview processing completion rate
- Analytics ingest error rate
- Payment localization endpoint error rate

## Known Gaps / Next Iterations

- Async ATS sync worker + retry backoff queue
- Signed URL + encryption-key management for video artifact uploads
- Entitlement enforcement middleware on each premium route
- Warehouse export pipeline for analytics events
- Mobile secure token persistence + biometric unlock
