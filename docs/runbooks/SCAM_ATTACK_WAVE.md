# Runbook: Scam Attack Wave

## Trigger

- `fraud_detections_24h` alarm
- Rapid increase in abuse reports, impersonation, or off-platform contact attempts

## Immediate Actions

1. Declare SEV1 if active user harm is likely.
2. Freeze risky employer or candidate cohorts with auto-holds or temporary throttles.
3. Assign Trust & Safety Lead and Communications Lead.

## Diagnose

- Admin trust risk queue
- Abuse reports queue
- Recent trust risk events and repeated reason codes
- Common domains, IP ranges, employer names, or message patterns

## Mitigate

- Tighten trust thresholds temporarily.
- Pause public posting for suspicious employer cohorts if needed.
- Increase manual review coverage.
- Post scam-warning banners if a pattern is visible to users.

## Exit Criteria

- Fraud rate returning to baseline
- Queue backlog under control
- User-facing mitigations communicated and reviewed

