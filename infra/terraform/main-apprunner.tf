# ─────────────────────────────────────────────────────────────────────────────
# AfriTalent Infrastructure - Cost-Effective App Runner Configuration
# 
# This configuration uses AWS App Runner instead of ECS Fargate to reduce costs.
# Estimated monthly cost: ~$30-50/month vs ~$150-200/month for ECS
#
# To use this configuration:
#   1. Rename main.tf to main-ecs.tf (backup)
#   2. Rename this file to main.tf
#   3. Run terraform init && terraform apply
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

# ── Network (simplified - no NAT gateway needed for App Runner) ──────────────

module "network" {
  source                     = "./modules/network"
  name_prefix                = local.name_prefix
  az_count                   = var.az_count
  vpc_cidr                   = var.vpc_cidr
  public_subnet_cidrs        = var.public_subnet_cidrs
  private_subnet_cidrs       = var.private_subnet_cidrs
  enable_nat_gateway         = false # App Runner handles egress, saves ~$32/month
  enable_interface_endpoints = false
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

# ── RDS PostgreSQL (smallest instance for dev) ───────────────────────────────

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
  source      = "./modules/secrets"
  name_prefix = local.name_prefix
  db_username = var.db_username
  db_password = random_password.db.result
  db_endpoint = module.rds.db_endpoint
  db_port     = module.rds.db_port
  db_name     = var.db_name
  jwt_secret  = random_password.jwt.result
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
  count = var.frontend_domain_name != "" ? 1 : 0

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
  backend_port            = var.backend_container_port
  backend_cpu             = "256" # Smallest: 0.25 vCPU
  backend_memory          = "512" # Smallest: 512 MB
  backend_min_size        = 1
  backend_max_size        = 3
  backend_max_concurrency = 100
  backend_health_path     = var.backend_health_check_path
  backend_url             = var.api_domain_name != "" ? "https://${var.api_domain_name}" : ""

  # Frontend configuration
  frontend_image           = var.frontend_image
  frontend_port            = var.frontend_container_port
  frontend_cpu             = "256"
  frontend_memory          = "512"
  frontend_min_size        = 1
  frontend_max_size        = 3
  frontend_max_concurrency = 100
  frontend_health_path     = var.frontend_health_check_path
  frontend_url             = local.frontend_url

  # Custom domains (optional - requires ACM cert)
  api_domain_name      = var.api_domain_name
  frontend_domain_name = var.frontend_domain_name
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
  github_ref                  = var.github_ref
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

output "frontend_url" {
  description = "Frontend App Runner service URL"
  value       = module.apprunner.frontend_service_url
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
    - Secrets Manager:     ~$0.40/month
    - S3 (minimal usage):  ~$1-5/month
    - ECR (storage):       ~$1-3/month
    ─────────────────────
    TOTAL:                 ~$25-55/month
    
    Compare to ECS setup:  ~$150-200/month
    SAVINGS:               ~$100-150/month
  EOT
}
