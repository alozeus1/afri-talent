# Migration — Supervisor Coordination

This is the supervisor's tracker for the parallel agent execution of Phase 0.1 (Terraform modules). It defines the inter-module contract, naming conventions, and shared variables. Agents do **not** need to read this file — their prompts are self-contained — but the supervisor uses it to integrate.

## Target environment

| | |
|---|---|
| AWS account ID | `108188564905` |
| AWS region | `us-east-1` |
| Environment name | `dev` |
| Name prefix | `afritalent-dev` |
| VPC CIDR | `10.30.0.0/16` |
| Project tag | `afritalent` |

## Standard tags (provider `default_tags`)

```hcl
default_tags {
  tags = {
    Project     = "afritalent"
    Environment = "dev"
    Application = "afritalent-platform"
    ManagedBy   = "terraform"
    Owner       = "platform"
    CostCenter  = "engineering"
  }
}
```

## Agent assignments

| Agent | Scope | Module paths (write only here) |
|---|---|---|
| **A1: Network & Edge** | VPC, subnets, endpoints, NAT instance, ALB, CloudFront+WAF, ACM | `modules/vpc/`, `modules/nat-instance/`, `modules/alb-fargate/`, `modules/cloudfront-waf/` |
| **A2: Data Plane** | Aurora SLv2, RDS Proxy, SSM, KMS | `modules/aurora-serverless/`, `modules/rds-proxy/`, `modules/ssm-params/` |
| **A3: Compute Plane** | ECR, ECS Fargate, Lambda, Step Functions | `modules/ecr-v2/`, `modules/ecs-fargate/`, `modules/lambda-functions/` |
| **A4: Security & Ops** | GuardDuty, Security Hub, Config, CloudTrail, Logs, Budgets | `modules/security-baseline/`, `modules/observability/`, `modules/budgets/` |
| **A5: CI/CD & IAM** | OIDC role, deploy.yml, terraform.yml | `modules/iam-oidc-github-new/`, `.github/workflows/deploy.yml`, `.github/workflows/terraform.yml` |

## Inter-module contract (outputs needed by other modules)

### From A1 (network/edge)
```
vpc_id, vpc_cidr,
public_subnet_ids[3], private_subnet_ids[3], isolated_subnet_ids[3],
sg_alb_id, sg_ecs_tasks_id, sg_lambda_id, sg_aurora_id, sg_rds_proxy_id, sg_nat_id,
alb_arn, alb_dns_name, alb_zone_id,
target_group_frontend_arn, target_group_backend_arn,
cloudfront_distribution_id, cloudfront_domain_name, cloudfront_arn,
waf_web_acl_arn,
acm_certificate_arn (us-east-1, for CloudFront)
```

### From A2 (data)
```
aurora_cluster_endpoint, aurora_cluster_reader_endpoint, aurora_cluster_arn,
aurora_database_name, aurora_master_user_secret_arn,
rds_proxy_endpoint, rds_proxy_arn,
ssm_parameter_path_prefix, ssm_kms_key_arn, ssm_kms_key_alias,
aurora_kms_key_arn
```

### From A3 (compute)
```
ecr_repo_url_frontend, ecr_repo_url_backend,
ecs_cluster_name, ecs_cluster_arn,
ecs_service_frontend_name, ecs_service_backend_name,
lambda_webhook_stripe_arn, lambda_webhook_stripe_url,
lambda_webhook_flutterwave_arn, lambda_webhook_flutterwave_url,
lambda_orchestrator_arn,
state_machine_orchestrator_arn
```

### From A4 (security/ops)
```
cloudtrail_log_bucket, cloudtrail_arn,
guardduty_detector_id,
security_hub_account_id,
config_recorder_name,
log_group_arns_map
```

### From A5 (CI/IAM)
```
github_oidc_role_arn, github_oidc_provider_arn
```

## Integration plan (post-agent)

1. Supervisor writes `infra/terraform/accounts/dev-new/{main,variables,outputs,backend,versions}.tf` wiring all modules together.
2. Supervisor runs `terraform init` and `terraform validate`.
3. Supervisor runs `terraform plan` against `108188564905`. **Apply blocks here for user approval.**
4. Apply phases per `MIGRATION_PLAN.md` §5.

## Execution log

| Agent | Started | Finished | Files written | Notes |
|---|---|---|---|---|
| A1 | | 2026-05-08T15:04Z | modules/vpc/{main,variables,outputs}.tf, modules/nat-instance/{main,variables,outputs}.tf, modules/alb-fargate/{main,variables,outputs}.tf, modules/cloudfront-waf/{main,variables,outputs}.tf | Network/edge plane complete: 3-AZ VPC, gateway+interface endpoints, fck-nat t4g.nano (SSM), internet-facing ALB w/ frontend+backend TGs, CloudFront(P200)+WAFv2 (3 managed rules + 2k/5min rate limit), conditional ACM/aliases. |
| A2 | 2026-05-08T15:02Z | 2026-05-08T15:05Z | modules/aurora-serverless/{main,variables,outputs}.tf, modules/rds-proxy/{main,variables,outputs}.tf, modules/ssm-params/{main,variables,outputs}.tf | Data plane complete: Aurora PG15.5 Serverless v2 (min_acu=0 auto-pause, I/O-Optimized, manage_master_user_password, dedicated CMK + PI), force_ssl + log_statement=ddl param group, isolated-subnet DB subnet group; RDS Proxy POSTGRESQL w/ Secrets-auth IAM role (KMS via secretsmanager.us-east-1) + tuned pool; SSM SecureString shells (required + optional + blog + DATABASE_URL) under /<prefix>/* with dedicated CMK and lifecycle ignore_changes=[value]. |
| A3 | 2026-05-08T15:05Z | 2026-05-08T15:25Z | modules/ecr-v2/{main,variables,outputs}.tf, modules/ecs-fargate/{main,variables,outputs}.tf, modules/lambda-functions/{main,variables,outputs}.tf + placeholder/index.js | Compute plane complete: ECR v2 (MUTABLE, scan-on-push, 10 untagged + 30 tagged retention, optional KMS); ECS Fargate cluster w/ Container Insights + FARGATE/FARGATE_SPOT default strategy (base=1 on-demand, weight 1 vs 4 → ~80% Spot); 2 services (frontend:3000, backend:3001) with deployment_circuit_breaker + execute_command + lifecycle ignore_changes on desired_count/task_definition for CI; narrow exec & task IAM (SSM scoped to ${ssm_path_prefix}/*, KMS Decrypt, SES, Bedrock, optional S3); Lambda x3 (stripe+flutterwave Function URLs auth=NONE/CORS, orchestrator no URL) all VPC-attached, AWSLambdaVPCAccessExecutionRole + scoped SSM/KMS; archive_file placeholder/index.js auto-packs when *_zip_path is empty so plan/apply works without CI artifacts; Step Functions STANDARD state machine reads ASL via templatefile from backend/infra/state-machines/orchestrator.asl.json with ALL-level execution logging. |
| A4 | 2026-05-08T15:25Z | 2026-05-08T15:50Z | modules/security-baseline/{main,variables,outputs}.tf, modules/observability/{main,variables,outputs}.tf, modules/budgets/{main,variables,outputs}.tf | Security/Ops plane complete: GuardDuty (15-min, EKS audit logs on, S3 logs on, Malware Protection intentionally OFF) + Security Hub (AFSBP v1.0.0 + CIS v3.0.0, default standards disabled) + AWS Config recorder (all_supported, global) w/ dedicated KMS-encrypted versioned S3 bucket (lifecycle: 365d non-current expiry) and 12 managed rules (cloudtrail/s3-public-{r,w}/sse/versioning/kms-cmk/iam-{root,pwd}/restricted-ssh/vpc-default-sg/encrypted-volumes/rds-encrypted); SLR creation toggle (`create_config_service_linked_role`) to avoid duplicate creation when AWSServiceRoleForConfig already exists. CloudTrail multi-region trail w/ log-file validation, dedicated CMK (alias afritalent-dev-cloudtrail, rotation on), separate S3 bucket w/ scoped bucket policy, CloudWatch Logs integration (90d retention, KMS-encrypted) and writer role. Account IAM password policy (min 14, all char classes, 90d max age, reuse prevention 24, hard_expiry false). Observability: cross-cutting CWL groups (/aws/waf, /aws/alb, /aws/vpc/flow-logs/*) at 30d retention, VPC flow log (ALL) → flow-logs group via dedicated IAM role; CloudWatch dashboard `afritalent-dev-overview` w/ 4 widgets (ECS CPU+Mem, ALB req/5xx/healthy hosts, Lambda inv/err/dur, Aurora ACU+conn+CPU) — all driven by optional input variables so widgets degrade gracefully when consumers haven't passed names yet. Budgets: monthly COST budget at $150 default, 50% ACTUAL + 80% & 100% FORECASTED notifications via email, cost_filter `TagKeyValue=user:Project$afritalent`. |
| A5 | 2026-05-08T15:25Z | 2026-05-08T15:40Z | modules/iam-oidc-github-new/{main,variables,outputs}.tf, .github/workflows/deploy.yml (new), .github/workflows/terraform.yml (updated) | OIDC role `${name_prefix}-github-deploy` w/ StringLike `repo:owner/repo:*` trust, 1h max session; scoped inline policy (ECR auth+push, ECS rolling deploy, Lambda update, SSM under /${name_prefix_path}/*, S3 tfstate, DynamoDB tflocks); Phase 1 PowerUserAccess attached + deny-list guardrail (IAM trust mutation, Organizations, account/billing) — flagged "tighten in follow-up". deploy.yml: OIDC-only (vars.AWS_ACCOUNT_ID), build→package-lambdas→push-images→terraform-apply (main only)→smoke-test, concurrency cancel-in-progress=false. terraform.yml gains `validate-dev-new` + `plan-dev-new` jobs that probe for `accounts/dev-new/` and no-op until the supervisor wires it. |
