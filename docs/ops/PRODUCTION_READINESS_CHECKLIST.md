# Production Readiness Checklist

## Operational Readiness Gate

- [ ] `terraform validate` passes for the target environment.
- [ ] CloudWatch dashboards are deployed and reviewed by Platform and Trust & Safety leads.
- [ ] All SNS alarm subscriptions are confirmed and tested.
- [ ] Synthetic canary is green for at least 24 hours.
- [ ] Backend `/health`, `/ready`, and `/live` all return expected responses.
- [ ] Admin ops overview returns ingestion freshness, backlog counts, worker states, and dead-letter summary.
- [ ] Stripe webhook idempotency is verified with replay tests.
- [ ] Redis is configured in the launch environment.
- [ ] SES sender identity and reputation alarms are configured and tested.
- [ ] Sentry backend alerts are routed to the on-call destination.
- [ ] Runbooks are linked in the incident channel template and support handbook.

## Support Ownership Checklist

- [ ] Primary Platform On-Call named for launch week.
- [ ] Secondary Platform backup named for launch week.
- [ ] Trust & Safety queue owner named for launch week.
- [ ] Support Lead named for launch week.
- [ ] Executive escalation contact documented.

## Launch-Day Command Center

- [ ] Open a shared incident/launch room 30 minutes before the launch window.
- [ ] Freeze unrelated deploys.
- [ ] Confirm last known good rollback image tags for frontend and backend.
- [ ] Confirm DB backup freshness and RDS free storage.
- [ ] Confirm synthetic canary green.
- [ ] Confirm billing test transaction and webhook success in staging on launch day.
- [ ] Confirm moderation backlog is below threshold.
- [ ] Confirm employer verification backlog is below threshold.
- [ ] Confirm support macros and status page drafts are prepared.

## Post-Deploy Verification Checklist

- [ ] Frontend root loads successfully from the live URL.
- [ ] Backend `/health` and `/api/health` return healthy or explicitly degraded with known dependency context.
- [ ] `GET /api/jobs?limit=5` returns successfully.
- [ ] Candidate login works.
- [ ] Candidate signup works.
- [ ] Email verification send and verify flow works.
- [ ] Employer job publish works for a verified employer.
- [ ] Candidate application submission works.
- [ ] Billing checkout session creation works.
- [ ] Stripe webhook completion updates subscription state.
- [ ] Notification creation and at least one delivery channel succeed.
- [ ] No new dead-letter entries appear after smoke verification.

