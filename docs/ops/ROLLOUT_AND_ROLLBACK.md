# Staged Rollout And Rollback Plan

## Staged Rollout

### Phase 1: Internal Readiness

- Apply Terraform monitoring resources in `staging`.
- Verify dashboards, alarm subscriptions, synthetic canary, and admin ops overview.
- Run the failure drills from `FAILURE_DRILL_TEST_PLAN.md`.

### Phase 2: Controlled Production Enablement

- Launch with Platform On-Call, Backend Owner, Trust & Safety Lead, and Support Lead staffed.
- Keep a deploy freeze outside the launch change set.
- Watch synthetic success, App Runner 5xx, RDS CPU, and auth/billing custom metrics for the first 2 hours.

### Phase 3: Public Scaling

- Increase traffic sources in waves rather than all at once.
- Review queue backlog, fraud detections, and dead-letter growth every 30 minutes during the first day.
- Review error-budget burn at end of launch day and 24 hours later.

## Rollback Triggers

- Synthetic journey red for 2 periods.
- App Runner 5xx SEV1 alarms fire and persist after first mitigation attempt.
- Login or checkout success rate drops below launch gate.
- Database saturation threatens data integrity or core workflow availability.
- Fraud attack wave exceeds moderation capacity and user harm cannot be contained quickly.

## Rollback Procedure

1. Freeze additional deploys.
2. Identify the last known good image for frontend and backend.
3. Roll back App Runner services to the last known good image tags.
4. Re-check `/health`, `/api/health`, and the public synthetic canary.
5. Verify login, jobs search, billing checkout session creation, and application submission.
6. Post internal and external status updates.
7. Keep the incident open until metrics and customer reports stabilize.

## Roll-Forward Rules

- No roll-forward until the causal change is understood or isolated behind a safe feature/config toggle.
- If the issue touched auth, billing, or trust/safety controls, require explicit Incident Commander sign-off before retrying deployment.

