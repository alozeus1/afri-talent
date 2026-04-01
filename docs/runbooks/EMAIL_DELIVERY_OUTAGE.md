# Runbook: Email Delivery Outage

## Trigger

- Notification delivery failures spike
- SES bounce or complaint rate alarms
- Users stop receiving verification or status emails

## Immediate Actions

1. Confirm which email type is affected.
2. Check SES sender identity and reputation dashboard.
3. Inspect email dead-letter entries and recent backend email logs.

## Diagnose

- SES reputation metrics
- `notification_delivery_failure` metric
- Dead letters with `email_send_failed`
- Template-specific failures such as account verification or job match

## Mitigate

- Fix SES sender identity or credential issues.
- Pause non-essential campaigns or digests if complaint rate is high.
- Use in-app notifications as the primary fallback where possible.

## Exit Criteria

- Verification email send succeeds
- One other transactional email template succeeds
- Bounce and complaint metrics stable

