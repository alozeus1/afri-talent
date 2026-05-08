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
  # Pass var.ssm_path_prefix directly (no leading slash). The ssm-params module's
  # output has a leading slash which causes a double-slash in the IAM policy
  # resource ARN (parameter//afritalent/dev/* vs the actual parameter/afritalent/dev/*).
  ssm_path_prefix = var.ssm_path_prefix
  ssm_kms_key_arn = module.ssm_params.ssm_kms_key_arn

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
  }

  # SSM SecureString -> env var. Each value is the parameter ARN.
  backend_secrets = {
    DATABASE_URL                  = "${local.ssm_arn_base}/DATABASE_URL"
    JWT_SECRET                    = "${local.ssm_arn_base}/JWT_SECRET"
    SESSION_SECRET                = "${local.ssm_arn_base}/SESSION_SECRET"
    ANTHROPIC_API_KEY             = "${local.ssm_arn_base}/ANTHROPIC_API_KEY"
    OPENAI_API_KEY                = "${local.ssm_arn_base}/OPENAI_API_KEY"
    AI_FAST_MODEL                 = "${local.ssm_arn_base}/AI_FAST_MODEL"
    AI_QUALITY_MODEL              = "${local.ssm_arn_base}/AI_QUALITY_MODEL"
    STRIPE_SECRET_KEY             = "${local.ssm_arn_base}/STRIPE_SECRET_KEY"
    STRIPE_WEBHOOK_SECRET         = "${local.ssm_arn_base}/STRIPE_WEBHOOK_SECRET"
    STRIPE_PRICE_CATALOG_JSON     = "${local.ssm_arn_base}/STRIPE_PRICE_CATALOG_JSON"
    FLUTTERWAVE_PUBLIC_KEY        = "${local.ssm_arn_base}/FLUTTERWAVE_PUBLIC_KEY"
    FLUTTERWAVE_SECRET_KEY        = "${local.ssm_arn_base}/FLUTTERWAVE_SECRET_KEY"
    FLUTTERWAVE_SECRET_HASH       = "${local.ssm_arn_base}/FLUTTERWAVE_SECRET_HASH"
    FLUTTERWAVE_PLAN_CATALOG_JSON = "${local.ssm_arn_base}/FLUTTERWAVE_PLAN_CATALOG_JSON"
    FLUTTERWAVE_PAYMENT_OPTIONS   = "${local.ssm_arn_base}/FLUTTERWAVE_PAYMENT_OPTIONS"
    GOOGLE_CLIENT_ID              = "${local.ssm_arn_base}/GOOGLE_CLIENT_ID"
    GOOGLE_CLIENT_SECRET          = "${local.ssm_arn_base}/GOOGLE_CLIENT_SECRET"
    ADZUNA_APP_ID                 = "${local.ssm_arn_base}/ADZUNA_APP_ID"
    ADZUNA_API_KEY                = "${local.ssm_arn_base}/ADZUNA_API_KEY"
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
  ssm_path_prefix              = var.ssm_path_prefix # no leading slash (see ecs_fargate note)
  ssm_kms_key_arn              = module.ssm_params.ssm_kms_key_arn
  webhook_stripe_zip_path      = var.webhook_stripe_zip_path
  webhook_flutterwave_zip_path = var.webhook_flutterwave_zip_path
  orchestrator_zip_path        = var.orchestrator_zip_path
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
    module.lambda_functions.lambda_webhook_stripe_arn,
    module.lambda_functions.lambda_webhook_flutterwave_arn,
    module.lambda_functions.lambda_orchestrator_arn,
  ]

  tfstate_bucket_arn   = var.tfstate_bucket_arn
  tflock_table_arn     = var.tflock_table_arn
  create_oidc_provider = var.create_oidc_provider
}
