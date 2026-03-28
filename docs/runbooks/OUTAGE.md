# Runbook: Public Outage

## Trigger

- Synthetic public journey failing
- Frontend or backend App Runner 5xx SEV1 alarm
- User reports that the site is unavailable

## Immediate Actions

1. Declare incident and assign Incident Commander.
2. Check frontend and backend App Runner service status.
3. Check `/health`, `/api/health`, and synthetic results.
4. Review last deploy and last known good image tags.
5. Decide between rollback and live mitigation inside 10 minutes.

## Diagnose

- Frontend App Runner logs for render/runtime errors
- Backend App Runner logs for boot, dependency, or request errors
- RDS CPU, connections, and free storage
- Recent changes in secrets, image tags, or domains

## Mitigate

- Roll back frontend and/or backend App Runner services if a bad release is suspected.
- If DB is saturated, reduce traffic, pause non-critical jobs, and follow the DB saturation runbook.
- If frontend only is broken, keep backend live and update external status accordingly.

## Exit Criteria

- Synthetic public journey green for two consecutive periods
- `/health` and `/api/health` healthy or degraded only for known non-critical dependency
- No ongoing 5xx alarm

