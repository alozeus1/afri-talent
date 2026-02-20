# ── Dev environment config ────────────────────────────────────────────────────
project_name = "afritalent"
environment  = "dev"
aws_region   = "us-east-1"

# Network - keep NAT for dev (ECS needs internet for Anthropic API)
enable_nat_gateway   = true
vpc_cidr             = "10.20.0.0/16"
public_subnet_cidrs  = ["10.20.0.0/24", "10.20.1.0/24"]
private_subnet_cidrs = ["10.20.10.0/24", "10.20.11.0/24"]
az_count             = 2

# Images (CI will update these; placeholders for first plan)
frontend_image = "108188564905.dkr.ecr.us-east-1.amazonaws.com/afritalent-dev-frontend:latest"
backend_image  = "108188564905.dkr.ecr.us-east-1.amazonaws.com/afritalent-dev-backend:latest"
create_ecr     = false

# Container sizing - dev: smallest viable
frontend_container_cpu    = 256
frontend_container_memory = 512
backend_container_cpu     = 256
backend_container_memory  = 512

# Service counts - dev: single instance
frontend_desired_count = 1
backend_desired_count  = 1
frontend_min_capacity  = 1
frontend_max_capacity  = 2
backend_min_capacity   = 1
backend_max_capacity   = 2

# RDS - smallest for dev
db_instance_class        = "db.t4g.micro"
db_allocated_storage     = 20
db_multi_az              = false
db_deletion_protection   = false
db_skip_final_snapshot   = true
db_backup_retention_days = 7
db_engine_version        = "15.3"
db_name                  = "afritalent"
db_username              = "afritalent"

# Logging
log_retention_in_days    = 14
enable_container_insights = false

# CloudFront - skip for dev, use ALB directly
# We'll set cloudfront_aliases to empty and use ALB with HTTPS

# Route53 - disabled until zone ID is known; set enable_route53=true once you have it
enable_route53       = false
route53_zone_id      = ""
frontend_domain_name = "dev.afri-talent.com"
api_domain_name      = "api.dev.afri-talent.com"

# ACM cert - leave empty until cert is issued; ALB and CloudFront skip HTTPS when empty
acm_certificate_arn = ""

# CloudFront - no custom aliases without a cert; uses CloudFront default domain for now
cloudfront_aliases             = []
cloudfront_acm_certificate_arn = ""
cloudfront_price_class         = "PriceClass_100"

# GitHub OIDC
github_repo = "alozeus1/afri-talent"
github_ref  = "refs/heads/develop"

# Re-use the existing OIDC provider rather than creating a duplicate
create_oidc_provider       = false
existing_oidc_provider_arn = "arn:aws:iam::108188564905:oidc-provider/token.actions.githubusercontent.com"

# Grant the Terraform-managed GitHub Actions role broad permissions for infra provisioning
github_actions_additional_policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"

# Monitoring
alerts_email = "alozeus1@gmail.com"
