# Runbook — API down

**Severity:** P1.
**Last updated:** 2026-05-15 (Wave 9 §10.3).

## Trigger

This runbook fires for any of:

- **Alarm `afritalent-dev-slo-api-5xx-rate`** — Backend 5xx rate exceeded 0.1% over 5 minutes. (SLO #1 — see `infra/terraform/modules/observability/alarms.tf`.)
- **Alarm `afritalent-dev-slo-api-latency-p95`** — Backend p95 latency exceeded 500 ms over 10 minutes. (SLO #2.)
- Synthetic monitor for `/api/health` failing.
- Founder/user report: "API is down" or "I can't log in."

## Immediate triage (in order)

```bash
# 1. Is the load balancer healthy?
aws elbv2 describe-target-health \
  --target-group-arn $(terraform -chdir=infra/terraform/accounts/dev-new output -raw target_group_backend_arn 2>/dev/null) \
  --region us-east-1

# 2. Are backend tasks running?
aws ecs describe-services \
  --cluster afritalent-dev \
  --services afritalent-dev-backend \
  --region us-east-1 \
  --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount}'

# 3. Direct hit to a healthy task (bypass ALB):
curl -fsS https://afritalent-dev-alb-25816556.us-east-1.elb.amazonaws.com/api/health || echo "ALB→backend path is broken too"

# 4. Recent backend logs (last 5 min):
aws logs tail /ecs/afritalent-dev/backend --since 5m --region us-east-1 --format short | tail -50
```

## Common causes

1. **Bad image** — last deploy crashes on startup. `aws ecs describe-tasks` shows tasks in `STOPPED` with reason `Essential container in task exited`.
2. **Database connection storm** — RDS Proxy `ClientConnectionFailures` spiking; usually a DATABASE_URL secret rotation that didn't propagate.
3. **ANTHROPIC_API_KEY revoked / rate-limited** — agents fail, but `/api/health` should still pass. If health passes but agent routes 503, it's API-side.
4. **NAT instance failure** — outbound calls to Stripe/SES/Anthropic fail. Check `aws ec2 describe-instances --filters 'Name=tag:Name,Values=afritalent-dev-nat'`.
5. **CloudFront origin issue** — ALB is healthy but CloudFront cache poisoned. Test direct ALB URL (step 3) to isolate.

## Mitigation

- **Bad image:** force a rollback to the previous task definition.
  ```bash
  PREV_TASK_DEF=$(aws ecs describe-services --cluster afritalent-dev --services afritalent-dev-backend --region us-east-1 --query 'services[0].deployments[?status==`PRIMARY`]|[0].taskDefinition' --output text | sed 's/:[0-9]*$/:'"$(( $(echo $PREV | grep -oE ':[0-9]+$' | tr -d ':') - 1))"'/')
  aws ecs update-service --cluster afritalent-dev --service afritalent-dev-backend --task-definition "$PREV_TASK_DEF" --region us-east-1
  ```
- **DB connection storm:** restart backend service to pick up fresh DATABASE_URL.
  ```bash
  aws ecs update-service --cluster afritalent-dev --service afritalent-dev-backend --force-new-deployment --region us-east-1
  ```
- **NAT instance failure:** see [database-saturation.md] for NAT recovery — same pattern.
- **CloudFront cache:** create an invalidation: `aws cloudfront create-invalidation --distribution-id <id> --paths "/api/*"`.

## Escalation

- **5 minutes elapsed, no mitigation working:** page founder.
- **15 minutes, customers reporting:** post to status page (`status.afri-talent.com`) — Component "API" → Degraded.
- **30 minutes, data loss suspected:** start incident commander mode, see [OUTAGE.md].

## References

- `STAGING_RUNBOOK.md` — current AWS resource names.
- `docs/DATABASE_SATURATION.md` — for DB-flavored variants.
- `infra/terraform/modules/observability/alarms.tf` — alarm definitions.
