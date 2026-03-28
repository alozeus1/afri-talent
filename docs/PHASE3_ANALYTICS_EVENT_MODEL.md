# Phase 3 Analytics Event Model

## Purpose

Define a unified event taxonomy for acquisition, activation, conversion, retention, and employer pipeline analytics that can power product dashboards and future warehouse exports.

## Source of Truth

- Ingestion route: `POST /api/analytics/events`
- Model reference endpoint: `GET /api/analytics/model`
- Storage table: `AnalyticsEvent`
- Category enum: `AnalyticsEventCategory`

## Event Envelope

Each event item in `events[]` follows:

```json
{
  "category": "ACQUISITION",
  "eventName": "signup_started",
  "sessionId": "sess_...",
  "path": "/register",
  "referrer": "https://google.com",
  "properties": {
    "variant": "control",
    "provider": "google"
  },
  "occurredAt": "2026-03-28T12:34:56.000Z"
}
```

Server-derived fields:

- `userId` (if authenticated)
- `ipHash`
- `userAgent`
- `receivedAt`

## Category Taxonomy

- `ACQUISITION`: traffic source, landing, signup starts, OAuth starts/completions
- `ACTIVATION`: profile completion, first meaningful action (post/apply)
- `ENGAGEMENT`: repeated usage behavior
- `CONVERSION`: checkout and plan-selection funnel
- `RETENTION`: recurring return behavior and sustained value events
- `MONETIZATION`: pricing interactions, upgrades, renewals
- `EMPLOYER_PIPELINE`: employer hiring pipeline status changes and outcomes
- `SYSTEM`: technical events and instrumentation health

## Naming Convention

Use `snake_case` and keep names action-oriented:

- Preferred: `signup_started`, `checkout_started`, `application_status_changed`
- Avoid: `buttonClicked`, `screen1`, `event123`

## Required vs Optional Fields

Required:

- `category`
- `eventName`

Recommended:

- `sessionId`
- `path`
- `properties`
- `occurredAt`

## Canonical Event Set

### Candidate Funnel

- `landing_view`
- `signup_started`
- `signup_completed`
- `email_verified`
- `profile_completed`
- `first_application_submitted`
- `return_visit_7d`

### Employer Funnel

- `employer_signup_started`
- `employer_signup_completed`
- `employer_profile_completed`
- `first_job_posted`
- `first_application_reviewed`
- `application_status_changed`
- `offer_sent`
- `candidate_hired`

### Monetization Funnel

- `pricing_page_view`
- `plan_selected`
- `checkout_started`
- `checkout_succeeded`
- `subscription_activated`
- `subscription_renewed`
- `upgrade_clicked`

### ATS + Integrations

- `ats_connection_created`
- `ats_sync_started`
- `ats_sync_succeeded`
- `ats_sync_failed`

### Mock Interview

- `mock_interview_created`
- `mock_interview_feedback_generated`
- `mock_interview_privacy_updated`
- `mock_interview_artifact_uploaded`

## High-Value Event Properties

Shared recommended properties:

- `role` (`CANDIDATE`, `EMPLOYER`)
- `locale` (`en`, `fr`, `pt`, `ar`)
- `region` (`AFRICA`, `EUROPE`, `ROW`)
- `device_type` (`mobile`, `desktop`)
- `experiment_key` and `experiment_variant`

Event-specific examples:

- `plan_selected`: `plan`, `interval`, `region`, `currency`, `amount_minor`
- `application_status_changed`: `from_status`, `to_status`, `job_id`
- `ats_sync_succeeded`: `provider`, `pulled_jobs`, `created_jobs`, `updated_jobs`

## Data Quality Rules

- Drop events with missing required fields
- Enforce enum categories at API boundary
- Keep `eventName` max length ≤120 chars
- Keep payload batch size ≤50 events/request

## Privacy Controls

- No raw IP stored; only SHA-256 hash
- No sensitive PII in `properties`
- Keep user consent controls aligned with privacy policy and regional law

## Dashboard Mapping

### Funnel Dashboard

- Signup conversion: `signup_completed / signup_started`
- Candidate activation: `profile_completed / signup_completed`
- Employer activation: `first_job_posted / employer_signup_completed`

### Employer Posting Performance

- Applications per posting
- Shortlist and acceptance rates
- Time-to-first-application and average review time

### Candidate Pipeline Metrics

- Application stage distribution
- Stage throughput and drop-off
- Time-to-decision

## Retention + Storage Policy

- Hot storage in primary Postgres for 90 days
- Archive/export to warehouse/object storage for long-range analytics (next iteration)
- Build scheduled cleanup strategy after warehouse ETL is live

## Validation Checklist

- Verify frontend emits expected events via network tab
- Validate `/api/analytics/events` returns `202`
- Confirm records in `AnalyticsEvent`
- Confirm admin summary endpoint reflects newly ingested events
