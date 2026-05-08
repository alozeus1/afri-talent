variable "name_prefix" {
  description = "Prefix for cluster, service, and task names (e.g. afritalent-dev)."
  type        = string

  validation {
    condition     = length(var.name_prefix) > 0 && can(regex("^[a-z0-9][a-z0-9-]*$", var.name_prefix))
    error_message = "name_prefix must be lowercase alphanumeric and may include hyphens."
  }
}

variable "aws_region" {
  description = "AWS region for log configuration awslogs-region."
  type        = string
  default     = "us-east-1"
}

variable "private_subnet_ids" {
  description = "Private subnet IDs in which Fargate tasks run."
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "Provide at least 2 private subnet IDs across different AZs."
  }
}

variable "sg_ecs_tasks_id" {
  description = "Security group ID applied to Fargate task ENIs."
  type        = string
}

variable "target_group_frontend_arn" {
  description = "ALB target group ARN for the frontend service."
  type        = string
}

variable "target_group_backend_arn" {
  description = "ALB target group ARN for the backend service."
  type        = string
}

variable "ecr_repo_url_frontend" {
  description = "ECR repository URL for the frontend image (no tag)."
  type        = string
}

variable "ecr_repo_url_backend" {
  description = "ECR repository URL for the backend image (no tag)."
  type        = string
}

variable "image_tag" {
  description = "Image tag to deploy. CI typically overrides via task-definition update; default 'latest'."
  type        = string
  default     = "latest"
}

variable "desired_count" {
  description = "Desired task count per service (frontend and backend each)."
  type        = number
  default     = 1

  validation {
    condition     = var.desired_count >= 0 && var.desired_count <= 50
    error_message = "desired_count must be between 0 and 50."
  }
}

variable "frontend_cpu" {
  description = "CPU units for the frontend task definition."
  type        = number
  default     = 512
}

variable "frontend_memory" {
  description = "Memory (MiB) for the frontend task definition."
  type        = number
  default     = 1024
}

variable "backend_cpu" {
  description = "CPU units for the backend task definition."
  type        = number
  default     = 1024
}

variable "backend_memory" {
  description = "Memory (MiB) for the backend task definition."
  type        = number
  default     = 2048
}

variable "frontend_env" {
  description = "Plain (non-secret) environment variables for the frontend container."
  type        = map(string)
  default     = {}
}

variable "backend_env" {
  description = "Plain (non-secret) environment variables for the backend container."
  type        = map(string)
  default     = {}
}

variable "frontend_secrets" {
  description = "Secret env vars for the frontend container — map of env var name -> SSM parameter ARN."
  type        = map(string)
  default     = {}
}

variable "backend_secrets" {
  description = "Secret env vars for the backend container — map of env var name -> SSM parameter ARN."
  type        = map(string)
  default     = {}
}

variable "ssm_path_prefix" {
  description = "SSM parameter path prefix the task execution role may read (e.g. afritalent/dev)."
  type        = string

  validation {
    condition     = length(var.ssm_path_prefix) > 0
    error_message = "ssm_path_prefix is required so the execution role can scope ssm:GetParameters."
  }
}

variable "ssm_kms_key_arn" {
  description = "KMS key ARN used to encrypt SSM SecureString parameters; granted Decrypt to the exec role."
  type        = string
}

variable "cloudwatch_kms_key_arn" {
  description = "Optional KMS key ARN for CloudWatch log group encryption. Empty = no CMK encryption."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention for ECS service log groups."
  type        = number
  default     = 30
}

variable "app_s3_bucket_arn" {
  description = "Optional S3 bucket ARN granted to the task role (Get/Put). Empty = skipped."
  type        = string
  default     = ""
}

variable "aws_account_id" {
  description = "AWS account ID — used to scope SSM ARNs in the exec role policy."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account ID."
  }
}

variable "fargate_spot_weight" {
  description = "Weight assigned to FARGATE_SPOT in the cluster default capacity provider strategy."
  type        = number
  default     = 4
}

variable "fargate_base" {
  description = "Number of base tasks assigned to FARGATE on-demand before Spot is used."
  type        = number
  default     = 1
}
