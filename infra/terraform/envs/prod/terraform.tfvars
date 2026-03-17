# ── Production environment config ────────────────────────────────────────────
project_name = "afritalent"
environment  = "prod"
aws_region   = "us-east-1"

# Production requires both private RDS connectivity and outbound internet egress.
enable_nat_gateway         = true
enable_interface_endpoints = true
vpc_cidr                   = "10.22.0.0/16"
public_subnet_cidrs        = ["10.22.0.0/24", "10.22.1.0/24"]
private_subnet_cidrs       = ["10.22.10.0/24", "10.22.11.0/24"]
az_count                   = 2

frontend_image = "260820061731.dkr.ecr.us-east-1.amazonaws.com/afritalent-prod-frontend:latest"
backend_image  = "260820061731.dkr.ecr.us-east-1.amazonaws.com/afritalent-prod-backend:latest"
create_ecr     = true

frontend_container_cpu    = 1024
frontend_container_memory = 2048
backend_container_cpu     = 1024
backend_container_memory  = 2048

frontend_desired_count = 2
backend_desired_count  = 2
frontend_min_capacity  = 2
frontend_max_capacity  = 6
backend_min_capacity   = 2
backend_max_capacity   = 6

db_instance_class        = "db.t4g.small"
db_allocated_storage     = 100
db_multi_az              = true
db_deletion_protection   = true
db_skip_final_snapshot   = false
db_backup_retention_days = 30
db_engine_version        = null
db_name                  = "afritalent"
db_username              = "afritalent"

log_retention_in_days     = 30
enable_container_insights = false

enable_route53       = false
route53_zone_id      = ""
frontend_domain_name = "afri-talent.com"
api_domain_name      = "api.afri-talent.com"

github_repo = "alozeus1/afri-talent"
github_ref  = "refs/heads/main"

create_oidc_provider                 = false
existing_oidc_provider_arn           = "arn:aws:iam::260820061731:oidc-provider/token.actions.githubusercontent.com"
github_actions_additional_policy_arn = ""

alerts_email = "alozeus1@gmail.com"
