# ─────────────────────────────────────────────────────────────────────────────
# AfriTalent — production stack (Wave 8 §9.1)
#
# Mirrors `accounts/dev-new/main.tf` so the same modules behave identically in
# prod. Production-specific knobs are driven through `terraform.tfvars` (which
# the founder fills in before first apply); module references and module
# dependencies stay structurally identical to dev-new for easy diffing.
#
# CRITICAL: This stack assumes the Terraform state bucket and DynamoDB lock
# table already exist in the new prod account. See
# `docs/runbooks/iac-cutover.md` §"Pre-cutover: state backend bootstrap" for
# the one-time setup.
# ─────────────────────────────────────────────────────────────────────────────

# ── Network / Edge plane ─────────────────────────────────────────────────────

module "vpc" {
  source = "../../modules/vpc"

  name_prefix = var.name_prefix
  aws_region  = var.aws_region
}

module "nat_instance" {
  source = "../../modules/nat-instance"

  name_prefix             = var.name_prefix
  vpc_id                  = module.vpc.vpc_id
  public_subnet_id        = module.vpc.public_subnet_ids[0]
  private_route_table_ids = module.vpc.private_route_table_ids
  security_group_ids      = [module.vpc.sg_nat_id]
}

module "alb_fargate" {
  source = "../../modules/alb-fargate"

  name_prefix         = var.name_prefix
  vpc_id              = module.vpc.vpc_id
  public_subnet_ids   = module.vpc.public_subnet_ids
  security_group_ids  = [module.vpc.sg_alb_id]
  acm_certificate_arn = local.acm_certificate_arn
  enable_https        = local.has_domain
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
  use_external_cert            = local.has_domain
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
  backup_retention_period = var.aurora_backup_retention_period
  deletion_protection     = var.aurora_deletion_protection
  skip_final_snapshot     = var.aurora_skip_final_snapshot
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

  # Keep Backup IAM role creation ordered after the deploy-role guardrail is
  # updated with its narrow exception.
  depends_on = [module.iam_oidc_github]
}

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
}

# ── App S3 bucket for uploads (resumes, profile photos, blog images, exports) ─
module "s3_uploads" {
  source = "../../modules/s3"

  bucket_name = "afritalent-${var.environment}-uploads-${var.aws_account_id}"
  environment = var.environment

  # Wave 8 §9.2.5 drift #5 — derive from live CloudFront + apex/www domain.
  allowed_origins = local.app_allowed_origins

  prefix_acl = [
    "resumes/",
    "trust/candidates/",
    "trust/employers/",
  ]
}

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
    FRONTEND_URL                  = local.frontend_url
    DAILY_APPLY_PACK_LIMIT        = "10"
    DAILY_JOB_MATCH_LIMIT         = "50"
    DAILY_RESUME_REVIEW_LIMIT     = "20"
    ORCHESTRATOR_TOKEN_BUDGET_MAX = "120000"
    SEMANTIC_INDEX_ENABLED        = "0"
    SMS_ENABLED                   = "0"
    AWS_REGION                    = var.aws_region
    # Prod default: blog automation OFF until founder seeds the 8-piece
    # editorial calendar AND populates the blog SSM secrets. Flip the SSM
    # toggle parameter `/afritalent/prod/BLOG_AUTOMATION_ENABLED` to "1"
    # then re-run terraform apply to flip the lambda env in lockstep.
    BLOG_AUTOMATION_ENABLED = "0"
  }

  # Same SSM SecureString -> env var wiring as dev-new. Founder populates each
  # value in SSM AFTER the first apply creates the parameter shells. Reference:
  # docs/runbooks/iac-cutover.md §"Pre-cutover: SSM secrets prep".
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

  blog_automation_env = {
    NODE_ENV                = "production"
    BLOG_AUTOMATION_ENABLED = data.aws_ssm_parameter.blog_automation_enabled.value
    FRONTEND_URL            = local.frontend_url
  }

  depends_on = [
    module.ssm_params,
    module.iam_oidc_github,
  ]
}

# Read the BLOG_AUTOMATION_ENABLED SSM toggle so the blog-automation Lambda
# env tracks SSM as the source of truth.
data "aws_ssm_parameter" "blog_automation_enabled" {
  name       = "/${var.ssm_path_prefix}/BLOG_AUTOMATION_ENABLED"
  depends_on = [module.ssm_params]
}

# ── Security & Ops plane ─────────────────────────────────────────────────────

module "security_baseline" {
  source = "../../modules/security-baseline"

  name_prefix = var.name_prefix
  # A brand-new prod account will not have the Config service-linked role yet.
  # Flip to false ONLY if a prior apply (or manual creation) already created it.
  create_config_service_linked_role = true
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
    "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:${var.name_prefix}-webhook-stripe",
    "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:${var.name_prefix}-webhook-flutterwave",
    "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:${var.name_prefix}-orchestrator-step",
    "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:${var.name_prefix}-blog-automation",
  ]

  tfstate_bucket_arn   = var.tfstate_bucket_arn
  tflock_table_arn     = var.tflock_table_arn
  create_oidc_provider = var.create_oidc_provider
}
