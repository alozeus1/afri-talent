# Failure Drill Test Plan

## Goal

Validate that AfriTalent can detect, route, mitigate, and communicate high-risk failures before public launch.

## Drill Cadence

- Weekly in staging during launch preparation.
- Monthly once production stabilizes.
- Immediately after major changes to auth, billing, trust/safety queues, or deploy architecture.

## Required Drills

| Drill | How To Simulate | Expected Detection | Success Criteria |
| --- | --- | --- | --- |
| Public outage | Break frontend route or point canary to bad path in staging | Synthetic canary + 5xx alarm | Incident declared, rollback decision made in under 10 min |
| Auth outage | Disable auth secret or break login flow in staging | Login failure metric spike, support verification | Login issue contained and comms sent |
| Payment outage | Break Stripe key or webhook secret in staging | Billing failure metrics, webhook failures | Checkout failure detected, rollback or config fix executed |
| Email delivery outage | Use invalid SES sender or block outbound delivery | Notification failure metric, SES reputation monitoring | Email outage runbook followed, fallback messaging in place |
| Job ingestion failure | Break one source or halt scheduler task | Job ingestion freshness alarm | Manual sync and remediation executed |
| Scam attack wave | Seed suspicious trust events and abuse reports | Fraud detection wave alarm | Auto-holds, throttles, and communications launched |
| Verification queue overload | Seed pending verification artifacts | Verification backlog alarm | Triage plan and SLA prioritization executed |
| Database saturation | Run load or reduce DB capacity in staging | RDS alarm | DB saturation runbook executed safely |
| Retry/dead-letter failure | Force repeated notification or scheduler task failures | Dead-letter backlog and scheduler failure metrics | Dead-letter inspection and replay decision made |

## Evidence To Capture

- Alarm timestamp
- Acknowledgement timestamp
- Incident role assignment timestamp
- Mitigation start and complete timestamps
- Customer comms draft time
- Root cause notes
- Follow-up backlog items

## Drill Exit Criteria

- Alarm fired as expected.
- Owning role acknowledged inside SLA.
- Runbook was sufficient without improvising undocumented steps.
- Recovery path was clear and reproducible.
- Follow-up actions were logged for any surprise or missing automation.

