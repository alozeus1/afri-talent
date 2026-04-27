# ─────────────────────────────────────────────────────────────────────────────
# AfriTalent Infrastructure - Active AWS App Runner Stack
#
# This root module provisions the currently supported managed deployment path
# for the application. It keeps compute simpler than ECS while still using
# private networking, RDS, ECR, Secrets Manager, and GitHub OIDC.
# ─────────────────────────────────────────────────────────────────────────────

resource "random_password" "db" {
  length           = 24
  special          = true
  override_special = "!@#%^*()-_=+[]{}"
}

resource "random_password" "jwt" {
  length  = 64
  special = true
}

# ── Network (App Runner backend still needs working NAT for public job APIs) ─

module "network" {
  source                      = "./modules/network"
  name_prefix                 = local.name_prefix
  az_count                    = var.az_count
  vpc_cidr                    = var.vpc_cidr
  public_subnet_cidrs         = var.public_subnet_cidrs
  private_subnet_cidrs        = var.private_subnet_cidrs
  enable_nat_gateway          = var.enable_nat_gateway
  nat_strategy                = var.nat_strategy
  enable_interface_endpoints  = var.enable_interface_endpoints
  enable_s3_gateway_endpoint  = var.enable_s3_gateway_endpoint
  interface_endpoint_services = var.interface_endpoint_services
}

# ── Security Groups ──────────────────────────────────────────────────────────

module "security" {
  source        = "./modules/security"
  name_prefix   = local.name_prefix
  vpc_id        = module.network.vpc_id
  frontend_port = var.frontend_container_port
  backend_port  = var.backend_container_port
}

# ── ECR Repositories ─────────────────────────────────────────────────────────

module "ecr" {
  source      = "./modules/ecr"
  name_prefix = local.name_prefix
  create      = var.create_ecr
}

# ── RDS PostgreSQL (shared non-production baseline) ─────────────────────────

module "rds" {
  source                   = "./modules/rds"
  name_prefix              = local.name_prefix
  private_subnet_ids       = module.network.private_subnet_ids
  rds_sg_id                = module.security.rds_sg_id
  db_name                  = var.db_name
  db_username              = var.db_username
  db_password              = random_password.db.result
  db_engine_version        = var.db_engine_version
  db_instance_class        = var.db_instance_class
  db_allocated_storage     = var.db_allocated_storage
  db_multi_az              = var.db_multi_az
  db_backup_retention_days = var.db_backup_retention_days
  db_deletion_protection   = var.db_deletion_protection
  db_skip_final_snapshot   = var.db_skip_final_snapshot
}

# ── Secrets Manager ──────────────────────────────────────────────────────────

module "secrets" {
  source                        = "./modules/secrets"
  name_prefix                   = local.name_prefix
  db_username                   = var.db_username
  db_password                   = random_password.db.result
  db_endpoint                   = module.rds.db_endpoint
  db_port                       = module.rds.db_port
  db_name                       = var.db_name
  jwt_secret                    = random_password.jwt.result
  anthropic_api_key             = var.anthropic_api_key
  stripe_secret_key             = var.stripe_secret_key
  stripe_webhook_secret         = var.stripe_webhook_secret
  stripe_price_catalog_json     = var.stripe_price_catalog_json
  flutterwave_public_key        = var.flutterwave_public_key
  flutterwave_secret_key        = var.flutterwave_secret_key
  flutterwave_secret_hash       = var.flutterwave_secret_hash
  flutterwave_plan_catalog_json = var.flutterwave_plan_catalog_json
  flutterwave_payment_options   = var.flutterwave_payment_options
  adzuna_app_id                 = var.adzuna_app_id
  adzuna_api_key                = var.adzuna_api_key
  apify_token                   = var.apify_token
  apify_job_tasks_json          = var.apify_job_tasks_json
  greenhouse_board_tokens       = var.greenhouse_board_tokens
  lever_site_tokens             = var.lever_site_tokens
  workable_company_tokens       = var.workable_company_tokens
  redis_url                     = var.redis_url
  sentry_dsn                    = var.sentry_dsn
}

# ── S3 Bucket for uploads ────────────────────────────────────────────────────

module "s3" {
  source          = "./modules/s3"
  bucket_name     = var.s3_uploads_bucket_name != "" ? var.s3_uploads_bucket_name : "${local.name_prefix}-uploads"
  environment     = var.environment
  allowed_origins = [local.frontend_url]
}

# ── ACM Certificate (auto-validated if Route53 zone available) ───────────────

module "acm" {
  count = var.enable_route53 && var.route53_zone_id != "" && var.frontend_domain_name != "" ? 1 : 0

  source      = "./modules/acm"
  name_prefix = local.name_prefix
  environment = var.environment
  domain_name = var.frontend_domain_name
  subject_alternative_names = [
    var.api_domain_name != "" ? var.api_domain_name : "api.${var.frontend_domain_name}"
  ]
  create_route53_records = var.enable_route53 && var.route53_zone_id != ""
  route53_zone_id        = var.route53_zone_id
}

# ── App Runner Services ──────────────────────────────────────────────────────

module "apprunner" {
  source = "./modules/apprunner"

  name_prefix        = local.name_prefix
  environment        = var.environment
  private_subnet_ids = module.network.private_subnet_ids
  security_group_id  = module.security.ecs_sg_id # Reuse existing SG
  secret_arn         = module.secrets.secret_arn
  secret_arns        = [module.secrets.secret_arn]
  s3_bucket_arns     = [module.s3.bucket_arn, "${module.s3.bucket_arn}/*"]

  # Backend configuration
  backend_image           = var.backend_image
  backend_service_name    = var.apprunner_backend_service_name
  backend_port            = var.backend_container_port
  backend_cpu             = tostring(var.backend_container_cpu)
  backend_memory          = tostring(var.backend_container_memory)
  backend_min_size        = var.backend_min_capacity
  backend_max_size        = var.backend_max_capacity
  backend_max_concurrency = 100
  backend_health_path     = var.backend_health_check_path
  backend_url             = local.backend_public_url
  backend_environment_variables = {
    for key, value in {
      AWS_REGION                        = var.aws_region
      SES_REGION                        = var.ses_region
      SES_FROM_EMAIL                    = var.ses_from_email
      FRONTEND_URL                      = local.frontend_url
      ALLOWED_ORIGIN_REGEX              = var.use_custom_domain_urls ? "" : "^https://[a-z0-9-]+\\.us-east-1\\.awsapprunner\\.com$"
      S3_UPLOADS_BUCKET                 = module.s3.bucket_name
      AI_FAST_MODEL                     = var.ai_fast_model
      AI_QUALITY_MODEL                  = var.ai_quality_model
      ORCHESTRATOR_TOKEN_BUDGET_MAX     = tostring(var.orchestrator_token_budget_max)
      AI_DISABLED                       = var.ai_disabled ? "1" : "0"
      DAILY_APPLY_PACK_LIMIT            = tostring(var.daily_apply_pack_limit)
      DAILY_JOB_MATCH_LIMIT             = tostring(var.daily_job_match_limit)
      DAILY_RESUME_REVIEW_LIMIT         = tostring(var.daily_resume_review_limit)
      AGGREGATOR_INTERVAL_MINUTES       = tostring(var.aggregator_interval_minutes)
      BLOG_AUTOMATION_ENABLED           = var.blog_automation_enabled ? "1" : "0"
      BLOG_AUTOMATION_INTERVAL_DAYS     = tostring(var.blog_automation_interval_days)
      STRIPE_PRICE_BASIC_MONTHLY        = var.stripe_price_basic_monthly
      STRIPE_PRICE_PROFESSIONAL_MONTHLY = var.stripe_price_professional_monthly
    } : key => value if value != null
  }
  backend_secret_names = [
    "DATABASE_URL",
    "JWT_SECRET",
    "ANTHROPIC_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_CATALOG_JSON",
    "FLUTTERWAVE_PUBLIC_KEY",
    "FLUTTERWAVE_SECRET_KEY",
    "FLUTTERWAVE_SECRET_HASH",
    "FLUTTERWAVE_PLAN_CATALOG_JSON",
    "FLUTTERWAVE_PAYMENT_OPTIONS",
    "ADZUNA_APP_ID",
    "ADZUNA_API_KEY",
    "APIFY_TOKEN",
    "APIFY_JOB_TASKS_JSON",
    "GREENHOUSE_BOARD_TOKENS",
    "LEVER_SITE_TOKENS",
    "WORKABLE_COMPANY_TOKENS",
    "REDIS_URL",
    "SENTRY_DSN",
    "NEWS_API_KEY",
    "UNSPLASH_ACCESS_KEY",
    "PEXELS_API_KEY",
    "BLOG_ADMIN_NOTIFICATION_EMAIL"
  ]

  # Frontend configuration
  frontend_image           = var.frontend_image
  frontend_service_name    = var.apprunner_frontend_service_name
  frontend_port            = var.frontend_container_port
  frontend_cpu             = tostring(var.frontend_container_cpu)
  frontend_memory          = tostring(var.frontend_container_memory)
  frontend_min_size        = var.frontend_min_capacity
  frontend_max_size        = var.frontend_max_capacity
  frontend_max_concurrency = 100
  frontend_health_path     = var.frontend_health_check_path
  frontend_url             = local.frontend_url
  frontend_environment_variables = local.backend_public_url != "" ? {
    NEXT_PUBLIC_API_URL     = local.backend_public_url
    NEXT_PUBLIC_BACKEND_URL = local.backend_public_url
  } : {}

  # Custom domains (optional - requires ACM cert)
  api_domain_name                   = var.api_domain_name
  frontend_domain_name              = var.frontend_domain_name
  create_custom_domain_associations = var.create_custom_domain_associations

  depends_on = [module.secrets]
}

# Grant App Runner instance role access to S3
resource "aws_iam_role_policy_attachment" "apprunner_s3" {
  role       = module.apprunner.instance_role_name
  policy_arn = module.s3.iam_policy_arn
}

# ── GitHub OIDC for CI/CD ────────────────────────────────────────────────────

module "github_oidc" {
  source                      = "./modules/github-oidc"
  name_prefix                 = local.name_prefix
  role_name                   = local.github_role_name
  github_repo                 = var.github_repo
  github_ref                  = local.github_ref_normalized
  ecr_repository_arns         = [module.ecr.frontend_repo_arn, module.ecr.backend_repo_arn]
  ecs_cluster_arn             = "" # Not used with App Runner
  ecs_service_arns            = []
  ecs_task_execution_role_arn = ""
  ecs_task_role_arn           = ""
  create_oidc_provider        = var.create_oidc_provider
  existing_oidc_provider_arn  = var.existing_oidc_provider_arn
  additional_policy_arn       = var.github_actions_additional_policy_arn
}

# Add App Runner permissions to GitHub Actions role
resource "aws_iam_role_policy" "github_apprunner" {
  name = "${local.name_prefix}-github-apprunner"
  role = module.github_oidc.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "apprunner:UpdateService",
          "apprunner:DescribeService",
          "apprunner:ListServices",
          "apprunner:StartDeployment"
        ]
        Resource = [
          module.apprunner.backend_service_arn,
          module.apprunner.frontend_service_arn
        ]
      }
    ]
  })
}

# ── Outputs ──────────────────────────────────────────────────────────────────

output "backend_url" {
  description = "Backend App Runner service URL"
  value       = module.apprunner.backend_service_url
}

output "backend_service_arn" {
  description = "Backend App Runner service ARN"
  value       = module.apprunner.backend_service_arn
}

output "frontend_url" {
  description = "Frontend App Runner service URL"
  value       = module.apprunner.frontend_service_url
}

output "frontend_service_arn" {
  description = "Frontend App Runner service ARN"
  value       = module.apprunner.frontend_service_arn
}
output "rds_endpoint" {
  description = "RDS database endpoint"
  value       = module.rds.db_endpoint
  sensitive   = true
}

output "ecr_frontend_repo_url" {
  description = "ECR repository URL for frontend"
  value       = module.ecr.frontend_repo_url
}

output "ecr_backend_repo_url" {
  description = "ECR repository URL for backend"
  value       = module.ecr.backend_repo_url
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions"
  value       = module.github_oidc.role_arn
}

output "estimated_monthly_cost" {
  description = "Estimated monthly infrastructure cost"
  value       = <<-EOT
    Estimated costs (us-east-1):
    - App Runner Backend:  ~$5-15/month (pay per request + min instance)
    - App Runner Frontend: ~$5-15/month (pay per request + min instance)
    - RDS db.t4g.micro:    ~$12-15/month
    - NAT Gateway:         ~$32/month when enabled
    - Secrets Manager:     ~$0.40/month
    - S3 (minimal usage):  ~$1-5/month
    - ECR (storage):       ~$1-3/month
    ─────────────────────
    TOTAL:                 ~$25-90/month depending on NAT and traffic
    
    Compare to ECS setup:  ~$150-200/month
    SAVINGS:               ~$60-150/month
  EOT
}
