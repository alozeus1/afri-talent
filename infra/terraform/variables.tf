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
  description = "Environment name (e.g., dev, staging, prod)"
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

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for HTTPS (optional)"
  default     = ""
}

variable "frontend_image" {
  type        = string
  description = "Container image URI for the frontend service"
}

variable "backend_image" {
  type        = string
  description = "Container image URI for the backend service"
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
  default     = 7
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
