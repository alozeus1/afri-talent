# Phase 3 Phased Rollout Plan

## Objective

Ship Phase 3 enterprise capabilities with controlled risk, measurable outcomes, and clear rollback paths.

## Release Streams

- Stream A: Core platform changes (schema + API)
- Stream B: Employer-facing UI (ATS + advanced analytics)
- Stream C: Mobile app scaffold and API connectivity
- Stream D: Billing localization metadata and entitlement alignment

## Phase Breakdown

## Phase 0: Pre-Prod Hardening (1-2 sprints)

Goals:

- Apply schema migration in staging
- Validate new route contracts and RBAC behavior
- Verify no regression on critical auth/jobs/application flows

Exit criteria:

- Migration success in staging and clean Prisma client generation
- Smoke tests pass for existing critical endpoints
- Observability dashboards include Phase 3 route/error coverage

## Phase 1: ATS + Analytics Soft Launch (1 sprint)

Scope:

- Enable ATS endpoints for internal employer cohort
- Enable advanced employer analytics endpoint and dashboard UI

Guardrails:

- Feature flag for ATS UI visibility
- Provider-level sync throttling
- Alerting on sync failure rate

Success metrics:

- ATS connection success rate > 95% for supported providers
- ATS sync success rate > 90%
- No increase in P95 jobs endpoint latency beyond agreed SLO

## Phase 2: Mock Interview Beta (1-2 sprints)

Scope:

- Enable candidate mock interview session creation + feedback flow
- Enable privacy and retention controls

Guardrails:

- Candidate-only access enforcement
- Artifact upload limits and retention defaults
- PII redaction enabled by default

Success metrics:

- Session completion rate
- Feedback generation success rate
- Privacy setting update success rate

## Phase 3: Payment Localization Activation (1 sprint)

Scope:

- Activate region metadata in pricing UI
- Europe compliance metadata in invoice/checkout flow
- Africa payment-method roadmap exposure (metadata only)

Guardrails:

- Method-level feature flags by region
- Revenue-impact monitoring by region/currency

Success metrics:

- Checkout conversion neutrality or lift in Europe
- No increase in payment failure rates
- Accurate region/currency rendering in pricing UI

## Phase 4: Mobile Alpha (parallel stream)

Scope:

- Internal alpha on Expo scaffold
- Validate auth + jobs APIs on device networks

Guardrails:

- API base URL environment separation
- Strict error handling for offline/high-latency conditions

Success metrics:

- Auth success on mobile
- Jobs feed load performance targets on low-end devices

## Feature Flags

Recommended flags:

- `feature_ats_integrations`
- `feature_advanced_employer_analytics`
- `feature_mock_interviews`
- `feature_payment_localization_ui`
- `feature_mobile_alpha`

## Rollback Strategy

## API-level rollback

- Disable route access using feature flags and role checks
- Keep data models in place; avoid destructive rollback migrations
- Revert frontend entry points if UI-related incidents occur

## Provider-level rollback

- Disable individual ATS provider sync while keeping other providers active
- Fallback to manual posting pipeline

## Billing rollback

- Revert payment method exposure per region via metadata/flags
- Preserve pricing records and entitlement mappings

## Monitoring & Alerting Plan

Track and alert on:

- `POST /api/ats/connections/:id/sync` failure ratio
- `POST /api/mock-interviews/:id/feedback` error ratio
- `POST /api/analytics/events` validation and ingestion errors
- `GET /api/pricing/payment-localization` latency/error budget

## Post-Deploy Verification Checklist

- `GET /api/health` and `GET /api/ready` healthy
- ATS connection create/list/sync/disconnect happy path works
- Advanced employer analytics endpoint returns non-empty structure
- Mock interview create/feedback/privacy/artifact flow works end-to-end
- Pricing localization endpoint returns Europe and Africa metadata
- Mobile scaffold can authenticate and fetch jobs against target backend
- Existing core endpoints remain healthy (auth, jobs, applications)

## Ownership

- Backend/API: Platform team
- Frontend/Web: Product web team
- Mobile: Mobile platform team
- Billing/Compliance: Billing + finance engineering
- SRE/Operations: Deployment reliability + alerting
