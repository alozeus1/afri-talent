# Runbook — Redis down

**Severity:** P1 if `REDIS_REQUIRED=true`; otherwise P2.
**Last updated:** 2026-05-15 (Wave 9 §10.3).

## Trigger

- Backend logs spike on `ECONNREFUSED <redis-host>:6379` or `ReplyError`.
- BullMQ workers in `backend/src/workers/` stop processing.
- `/api/health` returns degraded with `redis: down`.

## Pre-condition — is Redis enabled?

Per memory note: **ElastiCache Redis is gated behind `REDIS_REQUIRED` (default false).** The module `infra/terraform/modules/elasticache-redis/` exists but is commented out in `accounts/dev-new/main.tf` (see Wave 1 §2.4 block). If Redis was never enabled in this environment, **this runbook does not apply** — the missing cache is by design and degraded `/api/health` is expected.

Verify before triaging:

```bash
aws ssm get-parameter --name /afritalent/dev/REDIS_REQUIRED --region us-east-1 \
  --query 'Parameter.Value' --output text
# If "0" or missing → Redis not enabled, skip this runbook.

aws ssm get-parameter --name /afritalent/dev/REDIS_URL --region us-east-1 --with-decryption \
  --query 'Parameter.Value' --output text 2>&1 | head -1
# If "placeholder" → never wired up.
```

## Immediate triage (assuming Redis IS enabled)

```bash
# 1. ElastiCache cluster state:
aws elasticache describe-replication-groups \
  --replication-group-id afritalent-dev-redis \
  --region us-east-1 \
  --query 'ReplicationGroups[0].{Status:Status,Nodes:NodeGroups[0].NodeGroupMembers[].CurrentRole}'

# 2. Try a TLS ping from a backend task:
TASK=$(aws ecs list-tasks --cluster afritalent-dev --service-name afritalent-dev-backend --region us-east-1 --query 'taskArns[0]' --output text)
aws ecs execute-command --cluster afritalent-dev --task "$TASK" --container backend --interactive \
  --command "redis-cli -u \$REDIS_URL --no-auth-warning ping" --region us-east-1

# 3. Recent worker logs:
aws logs tail /ecs/afritalent-dev/backend --since 5m --region us-east-1 --format short | grep -i redis | tail -30
```

## Common causes

1. **REDIS_URL secret stale** — AUTH token rotated; SSM parameter has the old one. Re-compose from the AWS-managed AUTH secret + primary endpoint (see `modules/elasticache-redis/README.md`).
2. **Security group drift** — backend ECS SG no longer allowed by Redis SG. Compare with TF: `terraform plan` should show no diff.
3. **AZ outage** — ElastiCache failover should be automatic if `num_cache_clusters >= 2`. Check the multi-AZ config.
4. **Memory pressure / eviction storm** — Redis hits maxmemory, BullMQ jobs get evicted. Look at `BytesUsedForCache` vs `maxmemory`.

## Mitigation

- **Stale REDIS_URL:** rewrite the SSM parameter from the AUTH secret + endpoint:
  ```bash
  AUTH=$(aws secretsmanager get-secret-value --secret-id afritalent-dev-redis-auth --region us-east-1 --query 'SecretString' --output text | jq -r .auth)
  HOST=$(aws elasticache describe-replication-groups --replication-group-id afritalent-dev-redis --region us-east-1 --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' --output text)
  aws ssm put-parameter --name /afritalent/dev/REDIS_URL --type SecureString \
    --value "rediss://default:${AUTH}@${HOST}:6379" --overwrite --region us-east-1
  # Restart backend service to pick up:
  aws ecs update-service --cluster afritalent-dev --service afritalent-dev-backend --force-new-deployment --region us-east-1
  ```
- **Memory pressure:** flush non-critical keys (`FLUSHDB` on the cache DB only, NOT BullMQ DB), or scale up `node_type` via TF.
- **AZ outage:** wait for failover; if `num_cache_clusters=1`, escalate to founder for capacity uplift.

## Degraded-mode operation

Backend is designed to operate without Redis (REDIS_REQUIRED=false by default). If Redis is down and recovery is non-trivial:

1. Set SSM `/afritalent/dev/REDIS_REQUIRED = 0`.
2. Force-redeploy backend.
3. Disable BullMQ-backed workers gracefully (autopilot, periodic resyncs). Synchronous request flow still works.
4. Apply Agent submissions queue stops; founder pauses outbound apply runs until restored.

## Escalation

- **5 minutes if REDIS_REQUIRED=true:** page founder.
- **15 minutes:** flip to degraded-mode (above) and post status-page update.

## References

- `infra/terraform/modules/elasticache-redis/README.md`
- `infra/terraform/accounts/dev-new/main.tf:106-117` — the gated module block.
- `backend/src/lib/redis.ts`
