# Incident Severity And Escalation

## Severity Model

| Severity | Definition | Examples | Initial Ack | Update Cadence |
| --- | --- | --- | --- | --- |
| SEV1 | Public outage, severe data risk, payment/auth outage, or active scam wave causing immediate user harm | Site unavailable, login completely failing, checkout broken, DB saturation, large-scale impersonation attack | 5 min | 15 min |
| SEV2 | Major degradation of a core workflow with partial user impact | High latency, notification failures, job ingestion stale, verification failures at scale | 15 min | 30 min |
| SEV3 | Operational risk, queue backlog, or degraded internal support tooling with limited external impact | Moderation backlog, verification queue spike, dead-letter backlog, scheduler flaps | 1 hour | 4 hours |
| SEV4 | Minor issue, localized bug, or low-risk operational anomaly | Non-critical admin error, single-source ingestion failure with manual workaround | Next business block | Daily |

## Incident Roles

- Incident Commander: owns scope, priorities, and decision making.
- Ops Lead: drives mitigation, rollback, scaling, and platform diagnostics.
- Backend Owner: owns API, auth, billing, queue, and scheduler fixes.
- Frontend Owner: owns client impact, CDN/browser issues, and user-facing validation.
- Trust & Safety Lead: owns scam-wave response, moderation policy, and queue triage.
- Communications Lead: owns internal notes, stakeholder updates, and public status text.
- Support Lead: owns ticket macros, VIP customer handling, and inbound issue pattern confirmation.

## Escalation Matrix

| Trigger | Primary | Secondary | Escalate When |
| --- | --- | --- | --- |
| App Runner or synthetic failure | Platform On-Call | Backend + Frontend leads | Not mitigated in 10 min |
| Auth outage | Backend Owner | Platform On-Call | Login or session restoration not underway in 10 min |
| Billing outage | Billing/Backend Owner | Platform On-Call | Checkout or webhook processing blocked for 10 min |
| Email delivery outage | Messaging Owner | Platform On-Call | SES reputation or delivery failure persists 15 min |
| Database saturation | Platform On-Call | Backend Owner | Query/load shedding not reducing saturation in 10 min |
| Scam attack wave | Trust & Safety Lead | Platform On-Call | Fraud spike still climbing after initial holds and throttles |
| Queue or retry failures | Backend Owner | Platform On-Call | Dead-letter backlog grows for 2 consecutive snapshots |

## Escalation Rules

- Any SEV1 immediately pages Platform On-Call and assigns an Incident Commander.
- Any SEV2 that lasts more than 30 minutes becomes an incident channel with explicit roles.
- Any incident affecting payments, auth, or public availability pauses non-essential deploys.
- During launch week, treat backlog alarms tied to trust/safety review as SEV2 if they block customer onboarding.

