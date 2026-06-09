# Database Restore + DR Runbook

**Scope:** Aurora Serverless v2 PostgreSQL cluster `afritalent-dev-aurora` (and its prod successor when §9.1 lands).
**Last updated:** 2026-05-15 (Wave 8 §9.3)
**Primary owner:** founder (alozeus1@gmail.com)
**On-call escalation:** see `STAGING_RUNBOOK.md` §contacts.

This runbook covers four scenarios:
1. Point-in-time recovery (PITR) within the Aurora retention window
2. Daily-snapshot restore from the AWS Backup primary vault
3. Cross-region recovery from the DR vault (`us-west-2`)
4. Quarterly DR drill — non-destructive, restores into a parallel cluster

For incident triage, see `docs/runbooks/DATABASE_SATURATION.md`. This file is restore mechanics only.

---

## 1. Recovery posture (what we have)

| Layer | Mechanism | Window | Location |
|---|---|---|---|
| PITR | Aurora `backup_retention_period` | 30 days | Same region (`us-east-1`) |
| Daily snapshots | AWS Backup plan `afritalent-dev-backup-plan`, rule `afritalent-dev-daily` 06:00 UTC | 30 days | Primary vault `afritalent-dev-backup-vault` (`us-east-1`) |
| Cross-region copy | Backup plan `copy_action` to DR vault | 30 days | DR vault `afritalent-dev-backup-vault-dr` (`us-west-2`) |
| Final snapshot | Taken automatically on cluster destroy (`skip_final_snapshot = false`) | Permanent until manually deleted | `us-east-1` |

**Encryption:** All recovery points are KMS-encrypted. Primary vault uses CMK `alias/afritalent-dev-backup-vault` (rotation enabled, AWS-managed annual). DR vault uses CMK `alias/afritalent-dev-backup-vault-dr` (rotation enabled). Aurora storage uses CMK `alias/afritalent-dev-aurora`.

**Deletion protection:** `aws_rds_cluster.aurora.deletion_protection = true`. Restore-to-existing requires temporarily flipping this off; restore-into-new is preferred.

---

## 2. PITR — point-in-time recovery (same region)

Use when corruption was introduced within the last 30 days and you know (roughly) when. Cheaper and faster than snapshot restore.

```bash
# 1. Verify the latest restorable time (must be within the 30-day window).
aws rds describe-db-clusters \
  --db-cluster-identifier afritalent-dev-aurora \
  --query 'DBClusters[0].EarliestRestorableTime' \
  --region us-east-1

# 2. Restore to a NEW cluster at the chosen timestamp (UTC, ISO-8601).
aws rds restore-db-cluster-to-point-in-time \
  --db-cluster-identifier afritalent-dev-aurora-restore \
  --source-db-cluster-identifier afritalent-dev-aurora \
  --restore-to-time 2026-05-15T14:30:00Z \
  --use-latest-restorable-time \
  --region us-east-1
# (drop --use-latest-restorable-time if you set --restore-to-time)

# 3. Aurora Serverless v2 requires at least one writer — add it.
aws rds create-db-cluster-instance \
  --db-instance-identifier afritalent-dev-aurora-restore-writer \
  --db-cluster-identifier afritalent-dev-aurora-restore \
  --db-instance-class db.serverless \
  --engine aurora-postgresql \
  --region us-east-1

# 4. Wait for the writer to become available, then validate via psql before swapping.
```

**Cutover (only if validation passes):** update RDS Proxy target to the new cluster, or repoint `DATABASE_URL` SSM parameter and restart ECS backend tasks. Keep the old cluster for ≥ 24 h before destroying.

---

## 3. Snapshot restore from primary vault

Use when PITR isn't enough (older than 30 days, or PITR target cluster is itself corrupt). Recovery points are visible in the AWS Backup console under vault `afritalent-dev-backup-vault`.

```bash
# 1. List recent recovery points.
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name afritalent-dev-backup-vault \
  --by-resource-type Aurora \
  --max-results 30 \
  --region us-east-1

# 2. Start a restore job. The IAM role is created by the backup-dr module.
ROLE_ARN=$(terraform -chdir=infra/terraform/accounts/dev-new output -raw github_oidc_role_arn) # use the Backup service role from `terraform output`
RP_ARN="arn:aws:rds:us-east-1:108188564905:cluster-snapshot:awsbackup-job-..."  # from step 1

aws backup start-restore-job \
  --recovery-point-arn "$RP_ARN" \
  --iam-role-arn "$(aws iam get-role --role-name afritalent-dev-backup-service-role --query 'Role.Arn' --output text)" \
  --metadata file://restore-metadata.json \
  --resource-type Aurora \
  --region us-east-1

# restore-metadata.json minimum keys (full schema: aws backup get-recovery-point-restore-metadata):
#   "DBClusterIdentifier":  "afritalent-dev-aurora-restore"
#   "Engine":               "aurora-postgresql"
#   "EngineVersion":        "15.8"
#   "VpcSecurityGroupIds":  "<sg-aurora-id>"
#   "DBSubnetGroupName":    "afritalent-dev-aurora-subnets"
```

After restore, add a writer instance as in §2 step 3 and validate.

---

## 4. Cross-region recovery from DR vault (`us-west-2`)

Use when the entire `us-east-1` region is unavailable, or when a region-scoped attack (eg. malicious actor with primary-region credentials) compromises both Aurora and the primary vault.

Cross-region recovery requires the DR vault, KMS access, and a VPC in `us-west-2`. The current dev-new stack does **not** stand up a permanent `us-west-2` network — DR recovery is a one-time operation that creates network resources on demand.

```bash
# 1. List DR recovery points.
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name afritalent-dev-backup-vault-dr \
  --by-resource-type Aurora \
  --max-results 30 \
  --region us-west-2

# 2. Decide on a DR VPC. Options:
#    (a) Restore into the default VPC's subnets (fastest, dev-only).
#    (b) Run `infra/terraform/modules/vpc` standalone against us-west-2 to mint
#        a fresh isolated network (recommended for prod DR drills).
#
# 3. Start the restore. The restore-metadata.json must point at us-west-2
#    subnets, security groups, and the DR-region KMS CMK arn.
#    KmsKeyId in metadata MUST be the us-west-2 CMK created by module.backup_dr.

# 4. Promote the restored cluster: add writer, populate SSM in us-west-2,
#    cutover DNS (TTL 60s during DR drills).
```

**Acceptance for cross-region recovery:** restored cluster reports `available`, app can read/write via temporary connection string within **4 hours** of starting the procedure (RTO). Data loss bounded by **24 hours** (RPO; daily backup cadence).

---

## 5. Quarterly DR drill (scheduled)

**Frequency:** every quarter. **Duration:** ~3 hours wall-clock. **Disruption:** none — drill is non-destructive (restores into a parallel cluster that is destroyed at the end).

### Drill calendar (assigned + dated)

| Quarter | Drill window | Owner |
|---|---|---|
| Q3 2026 | 2026-07-15 (Wed) 10:00-13:00 UTC | founder |
| Q4 2026 | 2026-10-14 (Wed) 10:00-13:00 UTC | founder |
| Q1 2027 | 2027-01-14 (Wed) 10:00-13:00 UTC | founder |
| Q2 2027 | 2027-04-15 (Wed) 10:00-13:00 UTC | founder |

Reschedule by editing this table; do not let a quarter slip without a recorded reason.

### Drill procedure

1. **T-1 day:** founder posts drill notice to team Slack. Confirm DR-vault recovery points exist (`aws backup list-recovery-points-by-backup-vault --backup-vault-name afritalent-dev-backup-vault-dr --region us-west-2`).
2. **T+0:00:** start cross-region restore per §4 into a *temporary* cluster `afritalent-dev-aurora-drill-YYYYMMDD`.
3. **T+0:45:** create writer instance, wait for `available`.
4. **T+1:00:** connect with psql via a one-off bastion or AWS SSM session and run the **validation suite**:
   - `\dt` → schema present (User, Job, Application tables exist)
   - `SELECT COUNT(*) FROM "User";` → row count matches a recent production telemetry baseline within 5%
   - `SELECT MAX("createdAt") FROM "Application";` → within 24 hours of drill start time (RPO check)
   - One read query against the largest tenant — latency < 1 s
5. **T+1:30:** record outcome in `docs/runbooks/db-restore-drill-log.md` (create on first drill):
   - drill date, owner, restore start/end times, validation result, any deviations
6. **T+2:00:** destroy the drill cluster (`aws rds delete-db-cluster --db-cluster-identifier afritalent-dev-aurora-drill-YYYYMMDD --skip-final-snapshot --region us-west-2`) and delete its writer instance.
7. **T+2:30:** post drill summary to team Slack. If any step exceeded its budget by >50%, file a P3 to investigate before next drill.

### Pass/fail criteria

A drill **passes** when all of:
- Cross-region restore completes within RTO (4 h).
- Validation suite returns expected schema + row counts.
- Drill cluster destroyed cleanly within the same maintenance window.

A drill **fails** when any of:
- Restore exceeds 4 h or errors out unrecoverably.
- Validation reveals missing/corrupt data.
- Drill cluster leaks (still running 24 h after drill end).

Failure escalates to a P2 corrective-action ticket; do not declare DR healthy until a follow-up drill passes.

---

## 6. Restore-to-existing-cluster (DESTRUCTIVE — last resort)

**Do not use this path during a normal incident.** Restoring on top of the live cluster is irreversible and requires temporarily disabling deletion protection. Restore-to-new (§2 / §3 / §4) is always preferred; cut traffic over after validation.

If you must, the steps are:
1. Take a manual snapshot of the live cluster *first*: `aws rds create-db-cluster-snapshot --db-cluster-identifier afritalent-dev-aurora --db-cluster-snapshot-identifier pre-restore-$(date +%Y%m%dT%H%M%S) --region us-east-1`.
2. Disable deletion protection via Terraform (set `aurora_deletion_protection = false`, apply).
3. Delete the live cluster (`aws rds delete-db-cluster ...`), then restore to the original identifier from §3.
4. Re-enable deletion protection in Terraform.

This path is documented for completeness only. Two human approvers required.

---

## 7. KMS rotation status

| Key alias | Rotation | Notes |
|---|---|---|
| `alias/afritalent-dev-aurora` | Enabled (annual, AWS-managed) | Aurora storage + Performance Insights |
| `alias/afritalent-dev-backup-vault` | Enabled (annual) | Primary AWS Backup vault |
| `alias/afritalent-dev-backup-vault-dr` | Enabled (annual) | DR (`us-west-2`) Backup vault |
| `alias/afritalent-dev-uploads-...` | Enabled (annual) | S3 uploads bucket |
| `alias/afritalent-dev-ssm` | Enabled (annual) | SSM SecureString parameters |

AWS-managed KMS rotation is a 365-day automatic re-key. No human action required; verify the boolean stays `true` on every Terraform apply.

---

## 8. Founder action checklist

- [ ] Calendar invite for each quarterly drill date (§5) on the founder Google Calendar, 3 h block, with this runbook URL in the description.
- [ ] First drill executed by **2026-07-15** (within 30 days of Wave 8 acceptance per §9.4).
- [ ] Drill log file `docs/runbooks/db-restore-drill-log.md` created after the first drill and updated each quarter.
- [ ] On the cluster's first restore-to-existing event, document the actual wall-clock RTO and update §4's "RTO 4 hours" if the empirical number is materially different.

---

## 9. References

- AWS Backup developer guide — restoring an Aurora cluster: <https://docs.aws.amazon.com/aws-backup/latest/devguide/restoring-rds.html>
- Aurora PITR mechanics: <https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/USER_PIT.html>
- `infra/terraform/modules/backup-dr/` — the module that provisions the vaults, plan, role, and KMS keys this runbook depends on.
- `infra/terraform/modules/aurora-serverless/` — the module that owns PITR retention and deletion protection.
- `STAGING_RUNBOOK.md` — live environment state and AWS resource names.
