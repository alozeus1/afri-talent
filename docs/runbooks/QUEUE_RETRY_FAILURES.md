# Runbook: Queue And Retry Failures

## Trigger

- Scheduler task failures recurring
- Dead-letter backlog increasing
- Notification or webhook retries exhausted

## Immediate Actions

1. Inspect admin dead-letter view and worker state.
2. Identify whether failures are scheduler, email, notification, or webhook related.
3. Stop automatic replays until the root cause is understood.

## Diagnose

- Dead-letter source and reason code
- Retry exhaustion patterns
- Redis availability
- Dependency-specific failures such as SES, Stripe, or external job sources

## Mitigate

- Fix the underlying dependency or code path.
- Replay only idempotent workloads after validation.
- If the failure source is noisy and non-critical, disable that job temporarily.

## Exit Criteria

- Dead-letter backlog stops growing
- Replayed items succeed or are intentionally discarded with notes
- Worker states return to success

