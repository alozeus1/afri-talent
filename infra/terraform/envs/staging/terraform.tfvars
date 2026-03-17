# ── Staging environment config ───────────────────────────────────────────────
project_name = "afritalent"
environment  = "staging"
aws_region   = "us-east-1"

# App Runner backend needs private RDS access and outbound internet for third-party APIs.
enable_nat_gateway         = true
nat_strategy               = "instance"
enable_interface_endpoints = true
vpc_cidr                   = "10.21.0.0/16"
public_subnet_cidrs        = ["10.21.0.0/24", "10.21.1.0/24"]
private_subnet_cidrs       = ["10.21.10.0/24", "10.21.11.0/24"]
az_count                   = 2

frontend_image = "260820061731.dkr.ecr.us-east-1.amazonaws.com/afritalent-staging-frontend:latest"
backend_image  = "260820061731.dkr.ecr.us-east-1.amazonaws.com/afritalent-staging-backend:latest"
create_ecr     = true

frontend_container_cpu    = 512
frontend_container_memory = 1024
backend_container_cpu     = 512
backend_container_memory  = 1024

frontend_desired_count = 1
backend_desired_count  = 1
frontend_min_capacity  = 1
frontend_max_capacity  = 3
backend_min_capacity   = 1
backend_max_capacity   = 3

db_instance_class        = "db.t4g.small"
db_allocated_storage     = 50
db_multi_az              = false
db_deletion_protection   = true
db_skip_final_snapshot   = false
db_backup_retention_days = 14
db_engine_version        = null
db_name                  = "afritalent"
db_username              = "afritalent"

log_retention_in_days     = 30
enable_container_insights = false

enable_route53       = false
route53_zone_id      = ""
frontend_domain_name = "staging.afri-talent.com"
api_domain_name      = "api.staging.afri-talent.com"

github_repo = "alozeus1/afri-talent"
github_ref  = "refs/heads/develop"

create_oidc_provider                 = false
existing_oidc_provider_arn           = "arn:aws:iam::260820061731:oidc-provider/token.actions.githubusercontent.com"
github_actions_additional_policy_arn = ""

alerts_email = "alozeus1@gmail.com"
