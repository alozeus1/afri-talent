# Runbook: Database Saturation

## Trigger

- RDS CPU or free storage SEV1 alarms
- Elevated App Runner latency with DB contention symptoms

## Immediate Actions

1. Declare incident if core flows are affected.
2. Check RDS CPU, connections, free storage, and recent query-heavy deploys.
3. Pause or throttle non-essential background work if needed.

## Diagnose

- Slow query patterns from application logs
- Traffic spike vs code-path regression
- Migration or vacuum-related load
- Background scheduler cycles overlapping with user traffic

## Mitigate

- Roll back query-heavy release.
- Reduce worker concurrency or disable non-essential scheduled tasks temporarily.
- Scale DB class or storage if capacity-driven.

## Exit Criteria

- CPU back under threshold
- Core user flows recovered
- No active DB saturation alarm

