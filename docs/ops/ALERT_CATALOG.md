# AfriTalent Alert Catalog

## Routing

- `ops-critical` SNS topic: SEV1 and immediate paging scenarios.
- `ops-warning` SNS topic: SEV2 and SEV3 operational degradation.
- Current email subscription target: `alerts_email` Terraform variable.
- Recommended next integration: route `ops-critical` into PagerDuty or Opsgenie and `ops-warning` into Slack plus email.

## Alert Table

| Alarm | Severity | Trigger | Owner | Route | Action |
| --- | --- | --- | --- | --- | --- |
| Backend App Runner 5xx | SEV1 | `5xxStatusResponses > 5` for 10 min | Platform On-Call | `ops-critical` | Open incident immediately |
| Frontend App Runner 5xx | SEV1 | `5xxStatusResponses > 5` for 10 min | Platform On-Call | `ops-critical` | Open incident immediately |
| Public synthetic journey failure | SEV1 | `SuccessPercent < 100` for 10 min | Platform On-Call | `ops-critical` | Open incident immediately |
| RDS CPU saturation | SEV1 | `CPUUtilization > 80%` for 15 min | Platform On-Call | `ops-critical` | Execute DB saturation runbook |
| RDS low free storage | SEV1 | `< 2GB` free storage | Platform On-Call | `ops-critical` | Capacity expansion or traffic reduction |
| Fraud detection wave | SEV1 | `fraud_detections_24h >= 25` | Trust & Safety On-Call | `ops-critical` | Activate scam attack wave runbook |
| Backend p95 latency | SEV2 | `RequestLatency p95 > 2500ms` | Backend Platform | `ops-warning` | Investigate load, DB, slow queries |
| Frontend p95 latency | SEV2 | `RequestLatency p95 > 3000ms` | Frontend Platform | `ops-warning` | Investigate render or upstream dependency issues |
| Backend CPU high | SEV2 | `CPUUtilization > 80%` sustained | Platform | `ops-warning` | Inspect scaling and hot paths |
| Job ingestion stale | SEV2 | `job_ingestion_freshness_minutes > 180` for 30 min | Data Platform | `ops-warning` | Run job ingestion failure runbook |
| Notification delivery failures | SEV2 | `notification_delivery_failure > 10` in 10 min | Messaging Platform | `ops-warning` | Inspect SES, web push, dead letters |
| Moderation queue backlog | SEV3 | `moderation_queue_backlog > 50` | Trust & Safety Ops | `ops-warning` | Rebalance reviewers, triage batch |
| Employer verification backlog | SEV3 | `employer_verification_queue_backlog > 20` | Trust & Safety Ops | `ops-warning` | Rebalance or temporarily tighten intake |

## Ownership Notes

- SEV1 must always have an Incident Commander, Ops Lead, and Communications Lead assigned within 5 minutes.
- SEV2 can begin with the primary service owner, but escalates to Platform On-Call if user-facing impact persists for 15 minutes.
- SEV3 is queue and readiness work unless customer harm or public availability changes, in which case severity is reclassified upward.

