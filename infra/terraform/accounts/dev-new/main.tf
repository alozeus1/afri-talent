# ─────────────────────────────────────────────────────────────────────────────
# AfriTalent — new-account dev stack
#
# Wires every module under ../../modules/ into a single deployable plan. Module
# inter-dependencies (DAG) are inferred from references; explicit depends_on is
# only added where Terraform's auto-detection misses a runtime-only dependency.
#
# CRITICAL: This stack assumes the Terraform state bucket and DynamoDB lock
# table already exist in 108188564905. Run scripts/migrate/bootstrap-state.sh
# once before the first `terraform init`.
# ─────────────────────────────────────────────────────────────────────────────

# ── Network / Edge plane ─────────────────────────────────────────────────────

module "vpc" {
  source = "../../modules/vpc"

  name_prefix = var.name_prefix
  aws_region  = var.aws_region
  # All other vars (CIDRs, AZs, container_ports) use module defaults.
}

module "nat_instance" {
  source = "../../modules/nat-instance"

  name_prefix             = var.name_prefix
  vpc_id                  = module.vpc.vpc_id
  public_subnet_id        = module.vpc.public_subnet_ids[0]
  private_route_table_ids = module.vpc.private_route_table_ids
  security_group_ids      = [module.vpc.sg_nat_id]
  # instance_type defaults to t4g.nano per spec
}

module "alb_fargate" {
  source = "../../modules/alb-fargate"

  name_prefix         = var.name_prefix
  vpc_id              = module.vpc.vpc_id
  public_subnet_ids   = module.vpc.public_subnet_ids
  security_group_ids  = [module.vpc.sg_alb_id]
  acm_certificate_arn = local.acm_certificate_arn
  enable_https        = local.has_domain
  # access_logs_bucket left empty — ALB access logs disabled in v1
}

module "cloudfront_waf" {
  source = "../../modules/cloudfront-waf"
  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix                  = var.name_prefix
  alb_dns_name                 = module.alb_fargate.alb_dns_name
  domain_name                  = var.domain_name
  external_acm_certificate_arn = local.acm_certificate_arn
  use_external_cert            = local.has_domain # caller (dns.tf) owns the cert when a domain is set
  # Defaults: rate_limit 2000/5min, price_class 200, TLSv1.2_2021
}

# ── Data plane ───────────────────────────────────────────────────────────────

module "aurora" {
  source = "../../modules/aurora-serverless"

  name_prefix              = var.name_prefix
  isolated_subnet_ids      = module.vpc.isolated_subnet_ids
  sg_aurora_id             = module.vpc.sg_aurora_id
  min_acu                  = var.aurora_min_acu
  max_acu                  = var.aurora_max_acu
  seconds_until_auto_pause = var.aurora_seconds_until_auto_pause

  # Wave 8 §9.3 — backups, DR, deletion protection.
  # backup_retention_period also defines the PITR window (spec: ≥ 14 days).
  # AWS Backup (module.backup_dr) layers a 30-day daily snapshot retention plan
  # with cross-region copy to us-west-2 on top of this.
  backup_retention_period = var.aurora_backup_retention_period
  deletion_protection     = var.aurora_deletion_protection
  skip_final_snapshot     = var.aurora_skip_final_snapshot
  # Other vars use sensible defaults (engine_version 15.5, db_name afritalent, etc.)
}

module "rds_proxy" {
  source = "../../modules/rds-proxy"

  name_prefix               = var.name_prefix
  private_subnet_ids        = module.vpc.private_subnet_ids
  sg_rds_proxy_id           = module.vpc.sg_rds_proxy_id
  aurora_cluster_identifier = module.aurora.aurora_cluster_identifier
  master_user_secret_arn    = module.aurora.aurora_master_user_secret_arn
  secret_kms_key_arn        = module.aurora.aurora_kms_key_arn
}

# ── Backup + DR (Wave 8 §9.3) ────────────────────────────────────────────────
# Daily AWS Backup snapshots of the Aurora cluster into a primary-region vault,
# with every recovery point copied cross-region to var.dr_region (us-west-2).
# Aurora's own backup_retention_period gives PITR ≥ 14 days; this module
# layers a 30-day daily-snapshot retention on top for longer-window restores.
module "backup_dr" {
  source = "../../modules/backup-dr"
  providers = {
    aws.dr = aws.dr
  }

  name_prefix             = var.name_prefix
  primary_region          = var.aws_region
  dr_region               = var.dr_region
  aurora_cluster_arn      = module.aurora.aurora_cluster_arn
  schedule_expression     = var.backup_daily_schedule_cron
  retention_days          = var.backup_retention_days
  cold_storage_after_days = var.backup_cold_storage_after_days
}

# ---------------------------------------------------------------------------
# ElastiCache Redis (Wave 1 §2.4) — UNCOMMENT TO ENABLE.
#
# The application ships with `REDIS_REQUIRED` defaulting to false, so the
# backend works without Redis on day-1. To roll out:
#
#   1. Uncomment the `module "elasticache_redis"` block below + the matching
#      output in outputs.tf (look for "WAVE_1_REDIS_OUTPUTS").
#   2. `terraform plan` in this directory — review the new SG, KMS key,
#      Secrets Manager entry, and replication group.
#   3. `terraform apply` (~10 minutes for the cluster to come up).
#   4. Compose REDIS_URL from the AUTH secret + primary endpoint and write
#      to SSM. Full snippet in infra/terraform/modules/elasticache-redis/README.md.
#   5. Verify reachable from a backend task:
#        aws ecs execute-command --cluster afritalent-dev \
#          --task <task-id> --container backend --interactive \
#          --command "redis-cli -u $REDIS_URL --no-auth-warning ping"
#   6. Add `REDIS_URL = "${local.ssm_arn_base}/REDIS_URL"` to backend_secrets.
#   7. Once verified: set `REDIS_REQUIRED=true` in SSM and add to backend_env.
#      ECS picks up env on next deployment; existing tasks finish out gracefully.
#
# module "elasticache_redis" {
#   source = "../../modules/elasticache-redis"
#
#   name_prefix                = var.name_prefix
#   vpc_id                     = module.vpc.vpc_id
#   subnet_ids                 = module.vpc.private_subnet_ids
#   ingress_security_group_ids = [module.vpc.sg_ecs_tasks_id]
#   # node_type                = "cache.t4g.small"  # for prod uplift
#   # num_cache_clusters       = 2                  # Multi-AZ + automatic failover
#   tags                       = local.tags
# }
# ---------------------------------------------------------------------------

module "ssm_params" {
  source = "../../modules/ssm-params"

  name_prefix                = var.ssm_path_prefix
  rds_proxy_endpoint         = module.rds_proxy.rds_proxy_endpoint
  db_name                    = module.aurora.aurora_database_name
  master_username            = module.aurora.aurora_master_username
  master_password_secret_arn = module.aurora.aurora_master_user_secret_arn
}

# ── Compute plane ────────────────────────────────────────────────────────────

module "ecr" {
  source = "../../modules/ecr-v2"

  name_prefix = var.name_prefix
  # kms_key_arn empty -> AES256 encryption
}

# ── App S3 bucket for uploads (resumes, profile photos, blog images, exports) ─
module "s3_uploads" {
  source = "../../modules/s3"

  bucket_name = "afritalent-${var.environment}-uploads-${var.aws_account_id}"
  environment = var.environment
  # CORS origins derived from live CloudFront output (+ optional custom domain).
  # See local.app_allowed_origins in locals.tf.
  allowed_origins = local.app_allowed_origins

  # §2.11 — the IAM policy now lists every prefix the bucket holds. Without
  # `trust/candidates/` and `trust/employers/`, the backend's presigned
  # uploads to those paths silently fail with AccessDenied. Remove the two
  # trust entries here once the separate `s3_trust` bucket below is live and
  # the backend's TRUST_S3_BUCKET env var is pointing at it.
  prefix_acl = [
    "resumes/",
    "trust/candidates/",
    "trust/employers/",
  ]
}

# ---------------------------------------------------------------------------
# Separate trust-artefact bucket (Wave 1 §2.11) — UNCOMMENT TO ENABLE.
#
# Recommended by the launch master prompt: keep candidate/employer KYC
# artefacts in their own bucket so a leak in the resumes/exports bucket
# can't reach trust artefacts and vice versa.
#
# Rollout:
#   1. Uncomment the `module "s3_trust"` block + outputs in outputs.tf
#      (look for WAVE_1_TRUST_BUCKET_OUTPUTS).
#   2. `terraform apply` (creates bucket, KMS, IAM policy).
#   3. Attach the new IAM policy to the ECS task role — add
#      `${module.s3_trust.iam_policy_arn}` to the ecs-fargate `policy_arns`
#      input alongside the existing `${module.s3_uploads.iam_policy_arn}`.
#   4. Set the SSM `TRUST_S3_BUCKET` parameter to
#      `${module.s3_trust.bucket_name}` and add it to the ecs_fargate
#      `backend_secrets` map. The backend (files.ts) routes trust scopes
#      there automatically when TRUST_S3_BUCKET is set.
#   5. Once verified working, remove `trust/candidates/` and
#      `trust/employers/` from the s3_uploads `prefix_acl` above and
#      apply again.
#   6. Optional: copy any existing trust/* objects from the uploads bucket
#      to the trust bucket (aws s3 sync s3://uploads/trust s3://trust)
#      before tightening the IAM.
#
# module "s3_trust" {
#   source = "../../modules/s3"
#
#   bucket_name     = "afritalent-${var.environment}-trust-${var.aws_account_id}"
#   environment     = var.environment
#   allowed_origins = local.app_allowed_origins
#   prefix_acl      = ["trust/candidates/", "trust/employers/"]
# }
# ---------------------------------------------------------------------------

module "ecs_fargate" {
  source = "../../modules/ecs-fargate"

  name_prefix               = var.name_prefix
  aws_region                = var.aws_region
  aws_account_id            = var.aws_account_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  sg_ecs_tasks_id           = module.vpc.sg_ecs_tasks_id
  target_group_frontend_arn = module.alb_fargate.target_group_frontend_arn
  target_group_backend_arn  = module.alb_fargate.target_group_backend_arn
  ecr_repo_url_frontend     = module.ecr.ecr_repo_url_frontend
  ecr_repo_url_backend      = module.ecr.ecr_repo_url_backend
  image_tag                 = var.image_tag
  desired_count             = var.ecs_desired_count
  fargate_base              = var.ecs_fargate_base
  fargate_spot_weight       = var.ecs_fargate_spot_weight
  ssm_path_prefix           = module.ssm_params.ssm_parameter_path_prefix
  ssm_kms_key_arn           = module.ssm_params.ssm_kms_key_arn

  app_s3_bucket_arn = module.s3_uploads.bucket_arn

  backend_env = {
    NODE_ENV                      = "production"
    PORT                          = "3001"
    MOCK_AI                       = "0"
    AI_DISABLED                   = "0"
    FRONTEND_URL                  = "https://d2j3ahmgbbdup1.cloudfront.net"
    DAILY_APPLY_PACK_LIMIT        = "10"
    DAILY_JOB_MATCH_LIMIT         = "50"
    DAILY_RESUME_REVIEW_LIMIT     = "20"
    ORCHESTRATOR_TOKEN_BUDGET_MAX = "120000"
    SEMANTIC_INDEX_ENABLED        = "0"
    SMS_ENABLED                   = "0"
    AWS_REGION                    = var.aws_region
    BLOG_AUTOMATION_ENABLED       = "1" # all blog API keys populated 2026-05-08
  }

  # SSM SecureString -> env var. Each value is the parameter ARN.
  # Placeholders (Apify/Greenhouse/Lever/Workable/Blog/News/Unsplash/Pexels/Admin)
  # are still wired so the container's env contains them at boot — when the SSM
  # value is updated to a real value, the next ECS task pulls it without a TF change.
  backend_secrets = {
    DATABASE_URL   = "${local.ssm_arn_base}/DATABASE_URL"
    JWT_SECRET     = "${local.ssm_arn_base}/JWT_SECRET"
    SESSION_SECRET = "${local.ssm_arn_base}/SESSION_SECRET"

    ANTHROPIC_API_KEY         = "${local.ssm_arn_base}/ANTHROPIC_API_KEY"
    OPENAI_API_KEY            = "${local.ssm_arn_base}/OPENAI_API_KEY"
    OPENAI_EMBEDDING_ENDPOINT = "${local.ssm_arn_base}/OPENAI_EMBEDDING_ENDPOINT"
    AI_FAST_MODEL             = "${local.ssm_arn_base}/AI_FAST_MODEL"
    AI_QUALITY_MODEL          = "${local.ssm_arn_base}/AI_QUALITY_MODEL"

    STRIPE_SECRET_KEY                     = "${local.ssm_arn_base}/STRIPE_SECRET_KEY"
    STRIPE_WEBHOOK_SECRET                 = "${local.ssm_arn_base}/STRIPE_WEBHOOK_SECRET"
    STRIPE_PRICE_CATALOG_JSON             = "${local.ssm_arn_base}/STRIPE_PRICE_CATALOG_JSON"
    STRIPE_PRICE_BASIC_MONTHLY            = "${local.ssm_arn_base}/STRIPE_PRICE_BASIC_MONTHLY"
    STRIPE_PRICE_PROFESSIONAL_MONTHLY     = "${local.ssm_arn_base}/STRIPE_PRICE_PROFESSIONAL_MONTHLY"
    STRIPE_PRICE_EMPLOYER_BASIC_MONTHLY   = "${local.ssm_arn_base}/STRIPE_PRICE_EMPLOYER_BASIC_MONTHLY"
    STRIPE_PRICE_EMPLOYER_PREMIUM_MONTHLY = "${local.ssm_arn_base}/STRIPE_PRICE_EMPLOYER_PREMIUM_MONTHLY"

    FLUTTERWAVE_PUBLIC_KEY        = "${local.ssm_arn_base}/FLUTTERWAVE_PUBLIC_KEY"
    FLUTTERWAVE_SECRET_KEY        = "${local.ssm_arn_base}/FLUTTERWAVE_SECRET_KEY"
    FLUTTERWAVE_SECRET_HASH       = "${local.ssm_arn_base}/FLUTTERWAVE_SECRET_HASH"
    FLUTTERWAVE_PLAN_CATALOG_JSON = "${local.ssm_arn_base}/FLUTTERWAVE_PLAN_CATALOG_JSON"
    FLUTTERWAVE_PAYMENT_OPTIONS   = "${local.ssm_arn_base}/FLUTTERWAVE_PAYMENT_OPTIONS"

    GOOGLE_CLIENT_ID     = "${local.ssm_arn_base}/GOOGLE_CLIENT_ID"
    GOOGLE_CLIENT_SECRET = "${local.ssm_arn_base}/GOOGLE_CLIENT_SECRET"

    GITHUB_CLIENT_ID     = "${local.ssm_arn_base}/GITHUB_CLIENT_ID"
    GITHUB_CLIENT_SECRET = "${local.ssm_arn_base}/GITHUB_CLIENT_SECRET"

    ADZUNA_APP_ID               = "${local.ssm_arn_base}/ADZUNA_APP_ID"
    ADZUNA_API_KEY              = "${local.ssm_arn_base}/ADZUNA_API_KEY"
    APIFY_TOKEN                 = "${local.ssm_arn_base}/APIFY_TOKEN"
    APIFY_JOB_TASKS_JSON        = "${local.ssm_arn_base}/APIFY_JOB_TASKS_JSON"
    GREENHOUSE_BOARD_TOKENS     = "${local.ssm_arn_base}/GREENHOUSE_BOARD_TOKENS"
    LEVER_SITE_TOKENS           = "${local.ssm_arn_base}/LEVER_SITE_TOKENS"
    WORKABLE_COMPANY_TOKENS     = "${local.ssm_arn_base}/WORKABLE_COMPANY_TOKENS"
    COMPANY_CAREER_SOURCES_JSON = "${local.ssm_arn_base}/COMPANY_CAREER_SOURCES_JSON"

    NEWS_API_KEY                  = "${local.ssm_arn_base}/blog/NEWS_API_KEY"
    UNSPLASH_ACCESS_KEY           = "${local.ssm_arn_base}/blog/UNSPLASH_ACCESS_KEY"
    PEXELS_API_KEY                = "${local.ssm_arn_base}/blog/PEXELS_API_KEY"
    BLOG_ADMIN_NOTIFICATION_EMAIL = "${local.ssm_arn_base}/blog/BLOG_ADMIN_NOTIFICATION_EMAIL"

    SES_FROM_EMAIL    = "${local.ssm_arn_base}/SES_FROM_EMAIL"
    SES_REGION        = "${local.ssm_arn_base}/SES_REGION"
    S3_UPLOADS_BUCKET = "${local.ssm_arn_base}/S3_UPLOADS_BUCKET"

    ATS_TOKEN_ENCRYPTION_KEY   = "${local.ssm_arn_base}/ATS_TOKEN_ENCRYPTION_KEY"
    BOT_WEBHOOK_SECRET         = "${local.ssm_arn_base}/BOT_WEBHOOK_SECRET"
    WEB_PUSH_VAPID_PUBLIC_KEY  = "${local.ssm_arn_base}/WEB_PUSH_VAPID_PUBLIC_KEY"
    WEB_PUSH_VAPID_PRIVATE_KEY = "${local.ssm_arn_base}/WEB_PUSH_VAPID_PRIVATE_KEY"
    WEB_PUSH_VAPID_SUBJECT     = "${local.ssm_arn_base}/WEB_PUSH_VAPID_SUBJECT"

    SENTRY_DSN               = "${local.ssm_arn_base}/SENTRY_DSN"
    ADMIN_BOOTSTRAP_EMAIL    = "${local.ssm_arn_base}/ADMIN_BOOTSTRAP_EMAIL"
    ADMIN_BOOTSTRAP_PASSWORD = "${local.ssm_arn_base}/ADMIN_BOOTSTRAP_PASSWORD"
  }

  frontend_env = {
    NODE_ENV = "production"
    PORT     = "3000"
    HOSTNAME = "0.0.0.0"
  }
}

module "lambda_functions" {
  source = "../../modules/lambda-functions"

  name_prefix                  = var.name_prefix
  aws_region                   = var.aws_region
  aws_account_id               = var.aws_account_id
  private_subnet_ids           = module.vpc.private_subnet_ids
  sg_lambda_id                 = module.vpc.sg_lambda_id
  ssm_path_prefix              = module.ssm_params.ssm_parameter_path_prefix
  ssm_kms_key_arn              = module.ssm_params.ssm_kms_key_arn
  webhook_stripe_zip_path      = var.webhook_stripe_zip_path
  webhook_flutterwave_zip_path = var.webhook_flutterwave_zip_path
  orchestrator_zip_path        = var.orchestrator_zip_path
  blog_automation_zip_path     = var.blog_automation_zip_path

  # Wave 6 §7.3 γ1 — blog automation Lambda env. BLOG_AUTOMATION_ENABLED is
  # sourced from the SSM toggle parameter so the founder can flip the gate by
  # updating SSM and re-running `terraform apply` (the env var refreshes,
  # next Lambda cold start picks it up). Defense-in-depth: the handler also
  # treats unset/0/false as "no-op exit".
  blog_automation_env = {
    NODE_ENV                = "production"
    AWS_REGION              = var.aws_region
    BLOG_AUTOMATION_ENABLED = data.aws_ssm_parameter.blog_automation_enabled.value
    FRONTEND_URL            = "https://d2j3ahmgbbdup1.cloudfront.net"
  }

  depends_on = [module.ssm_params]
}

# Read the BLOG_AUTOMATION_ENABLED SSM toggle so the blog-automation Lambda
# env tracks SSM as the source of truth. Founder flips SSM then re-applies TF.
data "aws_ssm_parameter" "blog_automation_enabled" {
  name       = "/${var.ssm_path_prefix}/BLOG_AUTOMATION_ENABLED"
  depends_on = [module.ssm_params]
}

# ── Security & Ops plane ─────────────────────────────────────────────────────

module "security_baseline" {
  source = "../../modules/security-baseline"

  name_prefix                       = var.name_prefix
  create_config_service_linked_role = true # confirmed missing in 108188564905
}

module "observability" {
  source = "../../modules/observability"

  name_prefix                      = var.name_prefix
  vpc_id                           = module.vpc.vpc_id
  ecs_cluster_name                 = module.ecs_fargate.ecs_cluster_name
  ecs_service_frontend_name        = module.ecs_fargate.ecs_service_frontend_name
  ecs_service_backend_name         = module.ecs_fargate.ecs_service_backend_name
  alb_arn_suffix                   = module.alb_fargate.alb_arn_suffix
  target_group_frontend_arn_suffix = module.alb_fargate.target_group_frontend_arn_suffix
  target_group_backend_arn_suffix  = module.alb_fargate.target_group_backend_arn_suffix
  lambda_function_names = [
    module.lambda_functions.lambda_webhook_stripe_name,
    module.lambda_functions.lambda_webhook_flutterwave_name,
    module.lambda_functions.lambda_orchestrator_name,
    module.lambda_functions.lambda_blog_automation_name,
  ]
  aurora_cluster_identifier = module.aurora.aurora_cluster_identifier

  # Wave 9 §10.1 — SLO alarms publish to a dedicated SNS topic. alerts_email
  # provides a fallback channel until PagerDuty/Opsgenie is wired post-merge
  # (see modules/observability/alarms.tf for founder action).
  alerts_email    = var.budget_alert_email
  environment     = var.environment
  ssm_path_prefix = var.ssm_path_prefix
}

module "budgets" {
  source = "../../modules/budgets"

  name_prefix        = var.name_prefix
  monthly_budget_usd = var.monthly_budget_usd
  budget_alert_email = var.budget_alert_email
}

# ── CI / IAM ─────────────────────────────────────────────────────────────────

module "iam_oidc_github" {
  source = "../../modules/iam-oidc-github-new"

  name_prefix      = var.name_prefix
  name_prefix_path = var.ssm_path_prefix
  github_owner     = var.github_owner
  github_repo      = var.github_repo
  aws_account_id   = var.aws_account_id
  aws_region       = var.aws_region

  ecr_repository_arns = [
    module.ecr.ecr_repo_arn_frontend,
    module.ecr.ecr_repo_arn_backend,
  ]
  ecs_cluster_arn = module.ecs_fargate.ecs_cluster_arn
  ecs_service_arns = [
    module.ecs_fargate.ecs_service_frontend_arn,
    module.ecs_fargate.ecs_service_backend_arn,
  ]
  lambda_function_arns = [
    module.lambda_functions.lambda_webhook_stripe_arn,
    module.lambda_functions.lambda_webhook_flutterwave_arn,
    module.lambda_functions.lambda_orchestrator_arn,
    module.lambda_functions.lambda_blog_automation_arn,
  ]

  tfstate_bucket_arn   = var.tfstate_bucket_arn
  tflock_table_arn     = var.tflock_table_arn
  create_oidc_provider = var.create_oidc_provider
}
