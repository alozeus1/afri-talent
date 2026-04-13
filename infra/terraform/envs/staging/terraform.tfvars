# ── Staging environment config ───────────────────────────────────────────────
project_name = "afritalent"
environment  = "staging"
aws_region   = "us-east-1"

# App Runner backend needs private RDS access and reliable outbound internet for third-party APIs.
enable_nat_gateway = true
nat_strategy       = "gateway"
# Interface endpoints showed no CloudWatch PrivateLink traffic in staging and are
# now disabled to eliminate recurring hourly endpoint charges.
enable_interface_endpoints = false
# Keep the S3 gateway endpoint because it is free and can reduce NAT data charges.
enable_s3_gateway_endpoint  = true
interface_endpoint_services = []
vpc_cidr                    = "10.21.0.0/16"
public_subnet_cidrs         = ["10.21.0.0/24", "10.21.1.0/24"]
private_subnet_cidrs        = ["10.21.10.0/24", "10.21.11.0/24"]
az_count                    = 2

frontend_image = "260820061731.dkr.ecr.us-east-1.amazonaws.com/afritalent-staging-frontend:latest"
backend_image  = "260820061731.dkr.ecr.us-east-1.amazonaws.com/afritalent-staging-backend:latest"
create_ecr     = true

# The original managed frontend service failed during creation.
# Staging currently serves traffic from the recovered App Runner service below,
# so Terraform and CI must target that service until a named replacement exists.
apprunner_frontend_service_name = "afritalent-stg-fe-livefix"

frontend_container_cpu    = 512
frontend_container_memory = 1024
backend_container_cpu     = 512
backend_container_memory  = 1024

frontend_desired_count      = 1
backend_desired_count       = 1
frontend_min_capacity       = 1
frontend_max_capacity       = 3
backend_min_capacity        = 1
backend_max_capacity        = 3
aggregator_interval_minutes = 30

job_ingestion_staleness_threshold_minutes   = 60
ingestion_consecutive_failure_threshold     = 2
ingestion_consecutive_zero_result_threshold = 2
ingestion_source_failure_spike_threshold    = 2

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

enable_route53               = false
route53_zone_id              = ""
frontend_domain_name         = "staging.afri-talent.com"
api_domain_name              = "api.staging.afri-talent.com"
frontend_public_url_override = "https://3mwn2b4e5t.us-east-1.awsapprunner.com"

github_repo = "alozeus1/afri-talent"
github_ref  = "refs/heads/develop"

create_oidc_provider                 = false
existing_oidc_provider_arn           = "arn:aws:iam::260820061731:oidc-provider/token.actions.githubusercontent.com"
github_actions_additional_policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"

alerts_email = "alozeus1@gmail.com"

cleanup_guardrail_role_names = [
  "InstanceTermination-role-kzboa777",
]
