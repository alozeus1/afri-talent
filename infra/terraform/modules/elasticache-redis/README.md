# elasticache-redis

Production-ready ElastiCache Redis replication group for AfriTalent.

Provisioned by Wave 1 §2.4 to back JWT revocation (fail-closed when
`REDIS_REQUIRED=true`) and the BullMQ apply-track queues planned for Wave 4.

## What this module creates

- **KMS CMK** with annual rotation, alias `alias/<name_prefix>-redis`. Used
  for at-rest encryption of the cluster and the slow-log CloudWatch group.
- **Secrets Manager secret** `<name_prefix>-redis-auth` containing the
  randomly generated 32-character AUTH token. Encrypted with the module's
  CMK. Read once during deploy to compose the `REDIS_URL`.
- **Subnet group** scoped to the private VPC subnets provided by the caller.
- **Security group** with port 6379/tcp ingress from each
  `ingress_security_group_ids` entry (typically the ECS task SGs).
- **CloudWatch log group** `/aws/elasticache/<name_prefix>-redis/slow-log`
  with 30-day retention.
- **Replication group** (1 primary + N-1 replicas) with:
  - At-rest + transit encryption
  - AUTH token (TLS-only `rediss://` connections)
  - Multi-AZ + automatic failover when `num_cache_clusters > 1`
  - 7-day automated snapshots, 03:00–05:00 UTC backup window
  - Slow-log delivery to the CloudWatch group

## Inputs

| Name | Required | Default | Description |
|---|---|---|---|
| `name_prefix` | yes | — | e.g. `afritalent-dev`, `afritalent-prod` |
| `vpc_id` | yes | — | VPC where the cluster lives |
| `subnet_ids` | yes | — | At least 2 private subnets in different AZs |
| `ingress_security_group_ids` | yes | — | ECS task SGs allowed to connect |
| `node_type` | no | `cache.t4g.micro` | Cache node instance type |
| `num_cache_clusters` | no | `2` | Primary + replicas. 2 enables Multi-AZ |
| `engine_version` | no | `7.1` | Redis major.minor |
| `snapshot_retention_days` | no | `7` | 0 disables backups |
| `tags` | no | `{}` | Merged into every resource |

## Outputs

`primary_endpoint_address`, `reader_endpoint_address`, `port`,
`security_group_id`, `auth_secret_arn`, `auth_secret_name`, `kms_key_arn`.

## Post-apply: writing `REDIS_URL` to SSM

The module deliberately does **not** write the connection URL to SSM. The
caller (typically `scripts/migrate/inject-secrets.sh` or a manual step)
composes the URL after apply and writes it:

```bash
# Inputs (replace per environment)
ENV="dev"            # or prod
NAME_PREFIX="afritalent-${ENV}"
REGION="us-east-1"

AUTH_TOKEN=$(aws secretsmanager get-secret-value \
  --secret-id "${NAME_PREFIX}-redis-auth" \
  --region "${REGION}" \
  --query SecretString --output text)

PRIMARY=$(terraform -chdir=infra/terraform/accounts/dev-new \
  output -raw redis_primary_endpoint)

REDIS_URL="rediss://:${AUTH_TOKEN}@${PRIMARY}:6379"

aws ssm put-parameter \
  --name "/afritalent/${ENV}/REDIS_URL" \
  --value "${REDIS_URL}" \
  --type SecureString \
  --overwrite \
  --region "${REGION}"

# Once verified reachable from a backend task, flip the fail-closed flag:
aws ssm put-parameter \
  --name "/afritalent/${ENV}/REDIS_REQUIRED" \
  --value "true" \
  --type String \
  --overwrite \
  --region "${REGION}"
```

## Cost (us-east-1, May 2026)

- `cache.t4g.micro` × 2: ~$22/month on-demand. Multi-AZ included.
- KMS: $1/month + small per-request fee
- CloudWatch slow-log: ~$0.50/month at typical volume
- Secrets Manager: $0.40/month

≈ **$24/month** for the dev cluster. Bump `node_type` to
`cache.t4g.small` or `cache.r7g.large` for prod once load justifies it.

## Day-2

- **Rotating the AUTH token** is destructive — ElastiCache cannot rotate
  AUTH without a brief connection drop. Plan it during a maintenance
  window: update `random_password.auth_token` seed or replace the resource,
  `terraform apply`, re-run the SSM `put-parameter` step above, force ECS
  deployment.
- **Promoting a replica to primary** during an AZ failure is automatic
  (`automatic_failover_enabled = true`). No application changes needed
  — applications connect via `primary_endpoint_address` which moves with
  the promoted node.
- **Scaling vertically** (node_type change) triggers an in-place upgrade
  with a brief failover. Run during a low-traffic window.
