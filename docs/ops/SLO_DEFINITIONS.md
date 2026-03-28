# AfriTalent SLO Definitions

## Principles

- No SLO is backed by one signal alone.
- User-error outcomes are tracked separately from platform-attributable failures.
- Moderation holds are measured separately from platform failures.
- Error budgets are reviewed weekly during launch month and monthly after launch stabilization.

## Service SLOs

| Surface | SLI | SLO Target | Measurement Source | Owner | Alerting |
| --- | --- | --- | --- | --- | --- |
| Site availability | Successful public synthetic journey checks / total public journey checks | `99.95%` monthly | CloudWatch Synthetics public canary + App Runner 5xx alarms | Platform | SEV1 |
| Job search latency | `p95` response time for `GET /api/jobs` | `<= 1500ms` steady-state, page on `> 2500ms` | `job_search_latency` operational metric + App Runner request latency | Backend Platform | SEV2 |
| Login success | Successful platform-attributable logins / successful + platform-failure logins | `99.5%` weekly | `login_success`, `login_failure` operational metrics | Identity / Backend | SEV2 |
| Signup success | Successful registrations / successful + platform-failure registrations | `99.0%` weekly | `signup_success`, `signup_failure` operational metrics | Growth Platform | SEV2 |
| Verification flows | Successful email verification completions / successful + platform-failure verification attempts | `98.5%` weekly | `verification_email_sent`, `verification_verify_success`, `verification_verify_failure` | Trust Platform | SEV2 |
| Billing checkout success | Completed paid checkouts / successful sessions created | `>= 97.0%` weekly | `billing_checkout_session_success`, `billing_checkout_success`, Stripe webhooks | Billing / Backend | SEV2 |
| Job posting publish success | Immediate publishes for eligible employers / total qualified publish attempts | `>= 99.0%` weekly | `job_publish_success`, `job_publish_failure`; holds tracked separately | Employer Platform | SEV2 |
| Application submission success | Successful candidate submissions / successful + platform-failure attempts | `99.5%` weekly | `application_submission_success`, `application_submission_failure`; holds tracked separately | Candidate Platform | SEV2 |
| Notification delivery | Delivered notifications / attempted notifications by channel | In-app `99.9%`, email `97.0%`, push `95.0%` | `notification_delivery_success`, `notification_delivery_failure`, SES reputation metrics | Messaging Platform | SEV2 |
| Job ingestion freshness | Minutes since last successful external job sync | `<= 180 min` steady-state | `job_ingestion_freshness_minutes` snapshot metric | Data Platform | SEV2 |

## Queue And Safety Guardrails

| Guardrail | Target | Source | Owner |
| --- | --- | --- | --- |
| Moderation queue backlog | `< 50` open items | `moderation_queue_backlog` snapshot metric | Trust & Safety Ops |
| Employer verification backlog | `< 20` open items | `employer_verification_queue_backlog` snapshot metric | Trust & Safety Ops |
| Fraud detections | Review spike if `>= 25` in rolling 24h | `fraud_detections_24h` snapshot metric | Trust & Safety On-Call |
| Dead-letter backlog | `0` steady-state, investigate if `> 5` for 15 min | `dead_letter_backlog` snapshot metric | Platform |

## Error Budget Rules

- Burn `> 20%` of monthly error budget in a day: freeze non-essential deploys and review incidents.
- Burn `> 50%` of monthly error budget in a week: require platform sign-off before new public-facing launches.
- Any SEV1 tied to auth, billing, or public availability triggers an immediate release hold until post-incident verification passes.

## Support Ownership Model

- Platform On-Call owns App Runner, RDS, CloudWatch, synthetic journeys, scheduler health, and deploy rollback.
- Backend Platform owns API latency, auth, billing integrations, verification flow health, and notification pipeline.
- Trust & Safety Ops owns moderation backlogs, fraud spikes, verification queue health, and scam attack response.
- Support Lead owns customer-impact triage, known-issue tracking, and external incident updates once approved by Incident Command.

