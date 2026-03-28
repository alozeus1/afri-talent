# Recommended Tooling Integration

## Already Implemented In This Layer

- AWS CloudWatch alarms and dashboards for App Runner, RDS, synthetic monitoring, and backend-derived operational metrics
- CloudWatch Synthetics public journey canary
- Backend structured operational events and snapshot logging
- Redis-backed dead-letter and worker-state support
- Sentry backend error capture

## Recommended Next Integrations Before Full Public Launch

### Tier 1: Required

- PagerDuty or Opsgenie
  - Route `ops-critical` to paging escalation instead of email-only.
- CloudWatch RUM or Sentry Browser Performance
  - Required for geography, device, Core Web Vitals, and release-health segmentation.
- Atlassian Statuspage or equivalent
  - Required for clean external incident communication.

### Tier 2: Strongly Recommended

- Stripe health and webhook monitoring
  - Use Stripe Health Alerts and webhook delivery dashboards for payment-layer confirmation.
- SES reputation dashboard review ritual
  - Monitor bounce and complaint rates weekly and after campaigns.
- Slack incident automation
  - Auto-create incident rooms and pin runbook links.

### Tier 3: Useful Once Scale Increases

- Central warehouse export for SLO analytics
  - Persist operational metrics in a warehouse for longer trend analysis.
- Dedicated queue system
  - BullMQ or SQS-based workers for async reliability beyond single-service schedulers.

## Tooling Decision Notes

- CloudWatch is the best fit for the current App Runner + RDS architecture and now serves as the primary operations plane.
- Browser RUM is the missing piece for geography/device performance, which server-side metrics cannot provide accurately.
- Pager-based escalation is the biggest remaining launch blocker if the team expects 24x7 response.

