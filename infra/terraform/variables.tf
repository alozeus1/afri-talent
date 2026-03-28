variable "aws_region" {
  type        = string
  description = "AWS region to deploy into"
  default     = "us-east-1"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "afritalent"
}

variable "environment" {
  type        = string
  description = "Environment name (e.g., staging, prod)"
  default     = "prod"
}

variable "az_count" {
  type        = number
  description = "Number of availability zones to use"
  default     = 2
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR block"
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  type        = list(string)
  description = "Public subnet CIDR blocks"
  default     = ["10.20.0.0/24", "10.20.1.0/24"]
}

variable "private_subnet_cidrs" {
  type        = list(string)
  description = "Private subnet CIDR blocks"
  default     = ["10.20.10.0/24", "10.20.11.0/24"]
}

variable "enable_nat_gateway" {
  type        = bool
  description = "Enable NAT gateway for private subnets"
  default     = true
}

variable "nat_strategy" {
  type        = string
  description = "Private subnet egress strategy when NAT is enabled: gateway or instance"
  default     = "gateway"

  validation {
    condition     = contains(["gateway", "instance"], var.nat_strategy)
    error_message = "nat_strategy must be either gateway or instance."
  }
}

variable "enable_interface_endpoints" {
  type        = bool
  description = "Create VPC interface/gateway endpoints for ECR and Secrets Manager"
  default     = false
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for HTTPS (optional)"
  default     = ""
}

variable "frontend_image" {
  type        = string
  description = "Container image URI for the frontend service"
  default     = "260820061731.dkr.ecr.us-east-1.amazonaws.com/afritalent-staging-frontend:latest"
}

variable "backend_image" {
  type        = string
  description = "Container image URI for the backend service"
  default     = "260820061731.dkr.ecr.us-east-1.amazonaws.com/afritalent-staging-backend:latest"
}

variable "apprunner_backend_service_name" {
  type        = string
  description = "Optional explicit App Runner backend service name"
  default     = ""
}

variable "create_ecr" {
  type        = bool
  description = "Whether to create/manage ECR repositories"
  default     = true
}

variable "frontend_container_port" {
  type        = number
  description = "Frontend container port"
  default     = 3000
}

variable "apprunner_frontend_service_name" {
  type        = string
  description = "Optional explicit App Runner frontend service name"
  default     = ""
}

variable "backend_container_port" {
  type        = number
  description = "Backend container port"
  default     = 4000
}

variable "frontend_container_cpu" {
  type        = number
  description = "CPU units for frontend task"
  default     = 512
}

variable "frontend_container_memory" {
  type        = number
  description = "Memory (MB) for frontend task"
  default     = 1024
}

variable "backend_container_cpu" {
  type        = number
  description = "CPU units for backend task"
  default     = 512
}

variable "backend_container_memory" {
  type        = number
  description = "Memory (MB) for backend task"
  default     = 1024
}

variable "frontend_desired_count" {
  type        = number
  description = "Desired count for frontend service"
  default     = 2
}

variable "backend_desired_count" {
  type        = number
  description = "Desired count for backend service"
  default     = 2
}

variable "frontend_min_capacity" {
  type        = number
  description = "Minimum frontend service capacity"
  default     = 2
}

variable "frontend_max_capacity" {
  type        = number
  description = "Maximum frontend service capacity"
  default     = 6
}

variable "backend_min_capacity" {
  type        = number
  description = "Minimum backend service capacity"
  default     = 2
}

variable "backend_max_capacity" {
  type        = number
  description = "Maximum backend service capacity"
  default     = 6
}

variable "cpu_target_utilization" {
  type        = number
  description = "Target CPU utilization for autoscaling"
  default     = 60
}

variable "memory_target_utilization" {
  type        = number
  description = "Target memory utilization for autoscaling"
  default     = 70
}

variable "frontend_health_check_path" {
  type        = string
  description = "Health check path for frontend target group"
  default     = "/"
}

variable "backend_health_check_path" {
  type        = string
  description = "Health check path for backend target group"
  default     = "/health"
}

variable "db_name" {
  type        = string
  description = "Database name"
  default     = "afritalent"
}

variable "db_username" {
  type        = string
  description = "Database master username"
  default     = "afritalent"
}

variable "db_engine_version" {
  type        = string
  description = "Postgres engine version"
  default     = null
}

variable "db_instance_class" {
  type        = string
  description = "RDS instance class"
  default     = "db.t4g.medium"
}

variable "db_allocated_storage" {
  type        = number
  description = "Allocated storage in GB"
  default     = 50
}

variable "db_multi_az" {
  type        = bool
  description = "Enable Multi-AZ for RDS"
  default     = true
}

variable "db_backup_retention_days" {
  type        = number
  description = "Backup retention period"
  default     = 30
}

variable "db_deletion_protection" {
  type        = bool
  description = "Enable deletion protection on RDS"
  default     = true
}

variable "db_skip_final_snapshot" {
  type        = bool
  description = "Skip final snapshot on delete"
  default     = false
}

variable "enable_container_insights" {
  type        = bool
  description = "Enable ECS container insights"
  default     = true
}

variable "log_retention_in_days" {
  type        = number
  description = "CloudWatch log retention in days"
  default     = 30
}

variable "cloudfront_price_class" {
  type        = string
  description = "CloudFront price class"
  default     = "PriceClass_100"
}

variable "cloudfront_aliases" {
  type        = list(string)
  description = "CloudFront alternate domain names"
  default     = []
}

variable "cloudfront_acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for CloudFront (must be in us-east-1)"
  default     = ""
}

variable "enable_route53" {
  type        = bool
  description = "Create Route53 records"
  default     = false
}

variable "create_custom_domain_associations" {
  type        = bool
  description = "Create App Runner custom domain associations for the configured domains"
  default     = false
}

variable "use_custom_domain_urls" {
  type        = bool
  description = "Use the configured custom domains for runtime/public URLs instead of App Runner service URLs"
  default     = false
}

variable "frontend_public_url_override" {
  type        = string
  description = "Optional explicit public frontend URL to use for backend redirects/CORS/S3 CORS"
  default     = ""
}

variable "route53_zone_id" {
  type        = string
  description = "Route53 hosted zone ID"
  default     = ""
}

variable "frontend_domain_name" {
  type        = string
  description = "Frontend DNS name (e.g., app.example.com)"
  default     = ""
}

variable "admin_domain_name" {
  type        = string
  description = "Admin DNS name (e.g., admin.example.com)"
  default     = ""
}

variable "api_domain_name" {
  type        = string
  description = "API DNS name (e.g., api.example.com)"
  default     = ""
}

variable "github_repo" {
  type        = string
  description = "GitHub repository in OWNER/REPO format for OIDC trust"
  default     = "alozeus1/afri-talent"
}

variable "github_ref" {
  type        = string
  description = "Git reference allowed to assume the role"
  default     = "refs/heads/main"
}

variable "github_actions_role_name" {
  type        = string
  description = "IAM role name for GitHub Actions"
  default     = ""
}

variable "github_actions_additional_policy_arn" {
  type        = string
  description = "Optional additional IAM policy ARN attached to the GitHub Actions role"
  default     = ""
}

variable "create_oidc_provider" {
  type        = bool
  description = "Create the GitHub OIDC provider. Set false if it already exists in the account."
  default     = true
}

variable "existing_oidc_provider_arn" {
  type        = string
  description = "ARN of the existing GitHub OIDC provider (used when create_oidc_provider=false)."
  default     = ""
}

variable "s3_uploads_bucket_name" {
  type        = string
  description = "Name for the S3 uploads bucket. Defaults to <name_prefix>-uploads."
  default     = ""
}

variable "alerts_email" {
  type        = string
  description = "Email address for CloudWatch alarm notifications"
  default     = "alozeus1@gmail.com"
}

variable "enable_ops_monitoring" {
  type        = bool
  description = "Enable CloudWatch dashboards, alarms, and operational telemetry resources."
  default     = true
}

variable "enable_synthetic_canaries" {
  type        = bool
  description = "Enable CloudWatch Synthetics canaries for public journey monitoring."
  default     = true
}

variable "synthetics_schedule_expression" {
  type        = string
  description = "Schedule expression for production synthetic journey monitoring."
  default     = "rate(5 minutes)"
}

variable "job_ingestion_staleness_threshold_minutes" {
  type        = number
  description = "Alarm threshold for stale job ingestion freshness snapshots."
  default     = 180
}

variable "moderation_queue_backlog_threshold" {
  type        = number
  description = "Alarm threshold for moderation queue backlog."
  default     = 50
}

variable "verification_queue_backlog_threshold" {
  type        = number
  description = "Alarm threshold for employer verification queue backlog."
  default     = 20
}

variable "fraud_detection_wave_threshold" {
  type        = number
  description = "Alarm threshold for fraud detections over 24 hours."
  default     = 25
}

variable "notification_failure_threshold" {
  type        = number
  description = "Alarm threshold for notification delivery failures in a 5 minute window."
  default     = 10
}

variable "ses_region" {
  type        = string
  description = "AWS region used for SES sends"
  default     = "us-east-1"
}

variable "ses_from_email" {
  type        = string
  description = "Verified SES from address for transactional email"
  default     = ""
}

variable "ai_fast_model" {
  type        = string
  description = "Fast AI model identifier"
  default     = "claude-haiku-4-5-20251001"
}

variable "ai_quality_model" {
  type        = string
  description = "Quality AI model identifier"
  default     = "claude-sonnet-4-6"
}

variable "orchestrator_token_budget_max" {
  type        = number
  description = "Maximum token budget for orchestrator workloads"
  default     = 120000
}

variable "ai_disabled" {
  type        = bool
  description = "Emergency kill switch for AI features"
  default     = false
}

variable "daily_apply_pack_limit" {
  type        = number
  description = "Per-user daily limit for apply pack generation"
  default     = 5
}

variable "daily_job_match_limit" {
  type        = number
  description = "Per-user daily limit for job match generation"
  default     = 20
}

variable "daily_resume_review_limit" {
  type        = number
  description = "Per-user daily limit for resume review generation"
  default     = 10
}

variable "stripe_price_basic_monthly" {
  type        = string
  description = "Stripe price ID for the Basic monthly plan"
  default     = ""
}

variable "stripe_price_professional_monthly" {
  type        = string
  description = "Stripe price ID for the Professional monthly plan"
  default     = ""
}
