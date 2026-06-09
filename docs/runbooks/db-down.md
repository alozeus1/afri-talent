# Runbook — Database down

**Severity:** P1.
**Last updated:** 2026-05-15 (Wave 9 §10.3).

## Trigger

- RDS Proxy alarms (when Wave 9.5 wires them).
- Backend logs flooded with `ECONNREFUSED` / `Connection terminated unexpectedly` against `afritalent-dev-rds-proxy.proxy-c3mldqa7xfbn.us-east-1.rds.amazonaws.com`.
- `/api/health` returns 503 with `database: down`.
- Aurora `ServerlessDatabaseCapacity` at 0 for >10 min when traffic is present (auto-pause stuck).

## Immediate triage

```bash
# 1. Aurora cluster status:
aws rds describe-db-clusters \
  --db-cluster-identifier afritalent-dev-aurora \
  --region us-east-1 \
  --query 'DBClusters[0].{Status:Status,Activity:ActivityStreamStatus,ServerlessCapacity:ServerlessV2ScalingConfiguration}'

# 2. Writer instance state:
aws rds describe-db-instances \
  --db-instance-identifier afritalent-dev-aurora-writer \
  --region us-east-1 \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Class:DBInstanceClass}'

# 3. RDS Proxy reachability:
aws rds describe-db-proxies --db-proxy-name afritalent-dev-rds-proxy --region us-east-1 \
  --query 'DBProxies[0].{Status:Status,Endpoint:Endpoint}'

# 4. Recent Performance Insights — top wait events:
# AWS console → RDS → afritalent-dev-aurora-writer → Monitoring → Performance Insights
```

## Common causes

1. **Auto-pause stuck on cold start** — Aurora Serverless v2 with `min_acu=0` can take ~30s to wake. If frontend doesn't retry, surfaces as "down". Usually transient.
2. **Master credential rotation broke the proxy** — RDS Proxy uses the AWS-managed Secrets Manager secret. If founder manually rotated outside of `manage_master_user_password=true`, proxy auth fails.
3. **Connection storm exhausting RDS Proxy connection limit** — backend leaked Prisma connections, or a runaway worker.
4. **Aurora storage filled** — Serverless v2 auto-scales storage, but I/O quotas can throttle. Look at `EBSIOBalance%` in Performance Insights.
5. **Aurora was destroyed** — should be impossible (deletion_protection=true), but check `aws rds describe-db-clusters` returns the cluster at all.

## Mitigation

- **Auto-pause stuck:** hit `/api/health` 2-3 times to force a connection. If still failing after 60s, escalate.
- **Credential drift:** verify the Secrets Manager secret backing the proxy:
  ```bash
  aws rds describe-db-clusters --db-cluster-identifier afritalent-dev-aurora --region us-east-1 \
    --query 'DBClusters[0].MasterUserSecret.SecretArn'
  ```
  Force-rotate via `aws rds modify-db-cluster --apply-immediately`. **Founder approval required.**
- **Connection storm:** restart backend ECS service (drops all sessions):
  ```bash
  aws ecs update-service --cluster afritalent-dev --service afritalent-dev-backend --force-new-deployment --region us-east-1
  ```
- **Storage / IO throttling:** temporarily raise `aurora_max_acu` in `accounts/dev-new/terraform.tfvars` and apply. Founder approval required.

## Restore from backup (last resort — destructive)

See `docs/runbooks/db-restore.md` for the full restore procedure (PITR, snapshot, cross-region). Two human approvers required.

## Escalation

- **2 minutes elapsed, still 5xx-ing:** page founder.
- **10 minutes:** consider restore from PITR (`db-restore.md` §2).
- **30 minutes, data integrity unclear:** incident commander mode, see [OUTAGE.md].

## References

- `docs/runbooks/db-restore.md` — restore procedures and DR drill schedule.
- `docs/DATABASE_SATURATION.md` — for connection-pool-saturation variants.
- `STAGING_RUNBOOK.md` — Aurora cluster identifiers, secrets, endpoints.
