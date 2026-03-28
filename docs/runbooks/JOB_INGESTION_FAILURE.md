# Runbook: Job Ingestion Failure

## Trigger

- `job_ingestion_freshness_minutes` exceeds threshold
- Scheduler task failures for `aggregator` or `job-matcher`

## Immediate Actions

1. Check worker state and dead letters in admin ops overview.
2. Review aggregator logs and source-specific errors.
3. Run manual `/api/aggregator/sync` in staging or controlled production context if appropriate.

## Diagnose

- Last successful sync timestamp
- External source errors or schema drift
- Redis lock state and scheduler failures

## Mitigate

- Restart or redeploy backend if worker state is stale due to process issues.
- Disable failing upstream sources temporarily if one source is poisoning the cycle.
- Execute manual sync after fix and verify freshness metric drops.

## Exit Criteria

- Freshness under threshold
- No new scheduler failure events
- Manual or automatic sync completes successfully

