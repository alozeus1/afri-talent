# Cost Anomaly Investigation - June 7, 2026

## Live Account Correction

Follow-up live-account investigation confirmed that the relevant anomaly was in
AWS account `108188564905`, not only the old/shared account. Use local AWS CLI
profile `afritalent` for this account:

```bash
AWS_PROFILE=afritalent aws sts get-caller-identity
```

The profile resolved to `arn:aws:iam::108188564905:user/AdminUser` during this
investigation.

## Live Account Findings

AWS Cost Anomaly Detection returned the following material anomalies for account
`108188564905`:

| Service | Anomaly window | Impact / actual spend | Primary root cause |
| --- | --- | ---: | --- |
| Amazon VPC | May 8-May 28 | $183.12 | `USE1-VpcEndpoint-Hours` |
| Amazon RDS | May 8-May 11 | $15.56 | RDS Proxy ASv2 + Aurora Serverless v2 I/O-Optimized ACU |
| ECS | May 8-May 15 | $12.80 | Fargate vCPU/GB hours |
| ELB | May 8-May 16 | $4.52 | ALB hourly/LCU baseline after stack creation |
| KMS | May 8-May 19 | $1.98 | KMS usage above new-stack baseline |
| CloudWatch | May 13-May 16 | $1.90 | monitors/logs around stack activation |

The largest and still-running cost driver is VPC endpoint hourly cost:

- May 2026: `USE1-VpcEndpoint-Hours` cost `$201.60` for `20,160` endpoint-hours.
- June 1-June 7, 2026: `USE1-VpcEndpoint-Hours` cost `$56.88` for `5,688`
  endpoint-hours.
- Current run rate is about `$9/day` for VPC endpoints alone.

Root cause in Terraform:

- `infra/terraform/modules/vpc/main.tf` creates 12 interface VPC endpoints:
  `ecr.api`, `ecr.dkr`, `logs`, `ssm`, `ssmmessages`, `ec2messages`,
  `secretsmanager`, `sts`, `kms`, `sqs`, `states`, and `events`.
- Each interface endpoint is deployed across all 3 private subnets/AZs.
- At roughly `$0.01` per endpoint-AZ-hour, the baseline is about
  `12 endpoints * 3 AZs * 24h * $0.01 = $8.64/day`, before data processing.
- Gateway endpoints for S3 and DynamoDB are not the issue; those are free.

June 1-June 7 account-level actual spend was already `$112.421`, with Cost
Explorer forecasting `$489.282` for June.

Top June 1-June 7 services:

| Service | June-to-date cost |
| --- | ---: |
| Amazon VPC | $59.24 |
| Amazon RDS | $30.92 |
| Tax | $6.95 |
| ECS | $3.90 |
| ELB | $3.56 |
| KMS | $2.17 |
| WAF | $1.98 |
| AWS Config | $0.70 |

Budget issue:

- Account budget `My Monthly Cost Budget` is active at `$100` and shows actual
  June spend `$112.421`, forecast `$489.282`.
- Terraform budget `afritalent-dev-monthly-cost` is configured at `$150` but
  currently reports `$0` because its tag filter is literally
  `user:Project${var.project_tag_value}`.
- Cost Explorer tag filters for `Project=afritalent` also returned `$0`, which
  indicates the cost-allocation tag is not active and/or the Terraform budget
  filter string is malformed.

RDS cost notes:

- Aurora cluster `afritalent-dev-aurora` was Serverless v2, I/O-Optimized,
  `min_capacity=0`, `max_capacity=4`, 30-day backup retention, deletion
  protection on before the follow-up remediation.
- RDS Proxy `afritalent-dev-rds-proxy` is available and generated the larger RDS
  fixed cost line: `$18.96` from June 1-June 7 and `$67.22` in May.
- Aurora Serverless v2 I/O-Optimized usage cost `$11.89` from June 1-June 7 and
  `$45.74` in May.
- CloudWatch evaluation for June 1-June 7 showed `VolumeReadIOPs` at `0` and
  low write activity for this build-phase environment, so Aurora Standard is
  the better fit until real testing starts.
- AWS Backup vaults have daily primary and cross-region recovery points, but
  observed backup storage cost is small relative to RDS Proxy and ACU usage.

Operational note:

- ECS service `afritalent-dev-backend` currently has desired count `1` and
  running count `0`; recent service events show deployment failures from May 16.
  This is not the main cost driver, but it affects environment health.

## Recommended Live-Account Fixes

These require explicit approval before changing infrastructure:

1. Reduce interface endpoint count or AZ coverage for dev. For example, keep
   required endpoints for image pulls/logs/secrets/exec paths and remove
   low-use endpoints such as `sqs`, `states`, and `events` if Lambda/public AWS
   API paths do not need private subnet access.
2. Consider a dev-mode network profile: fewer private subnets for endpoints,
   NAT instance plus only S3/DynamoDB gateway endpoints, or conditional endpoint
   creation by service.
3. Review whether RDS Proxy is necessary for the current low-traffic dev stack;
   it is a major fixed RDS cost line.
4. Fix `infra/terraform/modules/budgets/main.tf` so the budget filter resolves
   to `user:Project$afritalent`, and activate the `Project` cost-allocation tag
   in AWS Billing if it is not already active.
5. Investigate and repair the backend ECS service health separately; desired
   `1` / running `0` means the live backend is not settled.

## Remediation Applied

Terraform has been updated to make interface VPC endpoints configurable in
`infra/terraform/modules/vpc` and to set `interface_endpoints = []` for the
`dev-new` stack. This keeps the free S3 and DynamoDB gateway endpoints, while
private subnet egress falls back to the already-running `t4g.nano` NAT instance.

The targeted apply was approved and completed on June 7, 2026:

```bash
cd infra/terraform/accounts/dev-new
AWS_PROFILE=afritalent terraform apply \
  -auto-approve \
  -input=false \
  -target='module.vpc.aws_vpc_endpoint.interface' \
  -target='module.budgets.aws_budgets_budget.monthly'
```

Apply result: `0 added, 1 changed, 12 destroyed`.

Expected cost effect:

- Removes 12 paid interface VPC endpoints across 3 AZs.
- Cuts the VPC endpoint baseline from about `$8.64/day` to `$0/day`.
- Expected monthly reduction is roughly `$260/month`, before small data
  processing differences.
- New rough monthly estimate is `$220-$250/month` if the remaining June
  non-endpoint run rate continues.
- Largest remaining cost target is RDS, currently led by RDS Proxy and Aurora
  Serverless v2 I/O-Optimized usage.

Follow-up cost controls applied after the first VPC endpoint remediation:

- `infra/terraform/accounts/dev-new/variables.tf` now sets
  `ecs_fargate_base = 0`, so existing one-task dev services are no longer
  pinned to one on-demand Fargate task.
- `infra/terraform/modules/ecs-fargate/main.tf` now declares the service-level
  capacity-provider strategy explicitly. The live services were updated through
  ECS directly to avoid Terraform re-registering stale task definitions with
  the `latest` image tag.
- `infra/terraform/accounts/dev-new/variables.tf` sets
  `aurora_storage_type = "aurora"` for Standard Aurora storage in build phase.
- `infra/terraform/modules/aurora-serverless` now accepts a `storage_type`
  variable. The module default remains `aurora-iopt1` so other environments do
  not silently change.

Functionality impact:

- ECS and Lambda private-subnet AWS API calls should continue through the NAT
  instance.
- S3/DynamoDB traffic remains on free gateway endpoints.
- The tradeoff is lower egress availability than PrivateLink endpoints because
  the dev stack uses a single NAT instance. This is acceptable for build phase,
  but production/high-availability testing should re-enable selected endpoints
  or use a more robust egress design.

Budget fix included:

- `infra/terraform/modules/budgets/main.tf` now renders the budget filter as
  `user:Project$afritalent` instead of the literal
  `user:Project${var.project_tag_value}`.

Validation:

- `terraform fmt` on changed Terraform files passed.
- `terraform validate` in `infra/terraform/accounts/dev-new` passed.
- Full plan showed unrelated drift/replacements, so do not apply the full plan
  for this remediation.
- Targeted plan result:
  `Plan: 0 to add, 1 to change, 12 to destroy.`
- Targeted apply result:
  `Apply complete! Resources: 0 added, 1 changed, 12 destroyed.`
- Follow-up Aurora targeted apply result:
  `Apply complete! Resources: 0 added, 1 changed, 0 destroyed.`
- ECS capacity-provider strategy was changed through `aws ecs update-service`
  for both frontend and backend with `FARGATE` base `0` and `FARGATE_SPOT`
  weight `4`, preserving the current task-definition revisions.

Post-apply verification:

- `aws ec2 describe-vpc-endpoints` now returns only the free S3 and DynamoDB
  Gateway endpoints for `afritalent-dev-vpce-*`.
- `aws budgets describe-budget` now shows
  `CostFilters.TagKeyValue = user:Project$afritalent`.
- `afritalent-dev-nat-instance` is still running as `t4g.nano`.
- `aws rds describe-db-clusters` shows `afritalent-dev-aurora` as `available`.
  `StorageType` is `null` after the Standard storage switch, matching the
  observed API shape for Standard Aurora.
- `afritalent-dev-frontend` is stable on task definition revision `16`, and the
  running task reports `capacityProviderName = FARGATE_SPOT`.
- `afritalent-dev-backend` kept task definition revision `18` but remains on
  its existing unhealthy deployment path.
- `curl -I https://d2j3ahmgbbdup1.cloudfront.net/` returned HTTP `307` to
  `/en` through CloudFront.

The frontend force deployment is a non-destructive way to verify a new ECS task
can still pull images, read SSM secrets, and emit logs through NAT. Backend
currently has a separate health issue and should be repaired before using it as
the egress verification target.

## Old Account Scope

Investigated AWS cost activity from May 1, 2026 through June 7, 2026 after the
AfriTalent migration from the old shared AWS account to the new live account.

The first investigation pass used local default credentials for old/shared
account `260820061731` (`arn:aws:iam::260820061731:user/admin`). That principal
could not assume `arn:aws:iam::108188564905:role/afritalent-dev-github-deploy`,
so the live account was validated separately with `AWS_PROFILE=afritalent`.

## Summary

No AWS Cost Anomaly Detection events were returned for the accessible old
account for May 1 through June 7, 2026.

The old account did show a real May cost cluster that matches the documented
May 10 cross-account migration and teardown window. AfriTalent-tagged spend in
old account `260820061731` dropped to near zero after May 10.

## Cost Evidence

May 2026 AfriTalent-tagged old-account costs by service:

| Service | May cost |
| --- | ---: |
| Amazon ElastiCache | $29.93 |
| EC2 - Other | $11.04 |
| Amazon RDS | $9.52 |
| AWS App Runner | $3.51 |
| AmazonCloudWatch | $3.32 |
| AWS KMS | $0.64 |
| AWS Secrets Manager | $0.13 |
| ECR | $0.07 |
| EC2 Compute | $0.05 |

June 1 through June 7 AfriTalent-tagged old-account cost:

| Service | June-to-date cost |
| --- | ---: |
| S3 Terraform state bucket | ~$0.00 |
| DynamoDB Terraform lock table | $0.00 |

Daily service cost evidence shows the old stack spending about $6.1-$6.7/day
from May 1 through May 10, then dropping on May 11:

| Date | ElastiCache | RDS | CloudWatch | EC2-Other | App Runner | KMS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-05-01 | $3.00 | $0.95 | $0.62 | $1.11 | $0.38 | $0.13 |
| 2026-05-09 | $3.00 | $0.96 | $0.94 | $1.11 | $0.35 | $0.13 |
| 2026-05-10 | $2.93 | $0.92 | $0.90 | $1.06 | $0.33 | $0.13 |
| 2026-05-11 | $0.00 | $0.13 | $0.02 | $0.00 | $0.00 | $0.07 |
| 2026-06-06 | $0.00 | $0.01 | $0.02 | $0.00 | $0.00 | $0.07 |

## Current Old-Account Resource Findings

No active AfriTalent App Runner services, ElastiCache caches, RDS instances,
NAT gateways, or Synthetics canaries were found in `us-east-1` in account
`260820061731`.

Remaining AfriTalent-related old-account items:

- Manual RDS snapshot:
  `afritalent-staging-pre-migration-20260510-1902`, 50 GB, available.
- Pending-deletion Secrets Manager secret:
  `afritalent-staging/app-secrets`, deleted May 10, 2026, last accessed May 9,
  2026.
- Historical Synthetics Lambda log group with no retention policy:
  `/aws/lambda/cwsyn-afritalent-staging-pu-273b962a-949f-46ad-a4b7-63c8cbaf8ff9`.
- Old account Terraform backend remnants:
  `s3://afritalent-260820061731-prod-terraform-state` and DynamoDB table
  `afritalent-260820061731-prod-terraform-locks`.

Observed non-AfriTalent old-account resources:

- SQS queues `students-csv-queue` and `students-csv-dlq`.
- EC2 status-check alarms for unrelated instance IDs.
- Default AWS-managed KMS keys and one `alias/cloudtrail-key` customer key.

## Interpretation

The May cost increase appears to be the expected tail of the old staging stack
before and during the May 10 migration, not an ongoing runaway in the old
account.

The largest May drivers were:

- ElastiCache Serverless cached data usage, about $3/day until May 10.
- NAT Gateway hours under `EC2 - Other`, about $10.76 total in May.
- RDS instance/runtime cost until teardown, plus the retained manual snapshot.
- CloudWatch Synthetics canary runs and dashboard/metric/alarm usage before the
  old stack was removed.

The old account is not sufficient to validate current live account spend
because local credentials cannot assume into account `108188564905`.

## Recommended Cleanup

These actions are destructive or account-affecting and require explicit human
approval before execution:

1. Delete the retained old-account RDS snapshot after the agreed safety window:
   `afritalent-staging-pre-migration-20260510-1902`.
2. Delete or set retention on the historical Synthetics Lambda log group.
3. Decide whether the old-account AfriTalent Terraform state bucket and lock
   table are still needed for audit/history; if not, archive or remove them.
4. Verify the pending-deletion old staging secret fully disappears after its
   recovery window.

## Follow-Up Needed

To complete the live-account side, run the same Cost Explorer and resource
inventory checks with credentials for account `108188564905`, or grant a
read-only billing/resource-audit role that this workstation can assume.
