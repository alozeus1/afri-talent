variable "name_prefix" {
  type        = string
  description = "Prefix for IAM role and policy names (e.g. afritalent-dev)."

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,32}$", var.name_prefix))
    error_message = "name_prefix must be 3-33 chars, lowercase alphanumerics or dashes, starting with a letter."
  }
}

variable "name_prefix_path" {
  type        = string
  description = "Path-style prefix used for SSM parameters (e.g. afritalent/dev). No leading or trailing slash."

  validation {
    condition     = can(regex("^[a-z][a-z0-9/-]{2,64}$", var.name_prefix_path)) && !startswith(var.name_prefix_path, "/") && !endswith(var.name_prefix_path, "/")
    error_message = "name_prefix_path must be path-like (e.g. afritalent/dev) with no leading or trailing slash."
  }
}

variable "github_owner" {
  type        = string
  description = "GitHub organization or user that owns the repository."

  validation {
    condition     = length(var.github_owner) > 0 && can(regex("^[A-Za-z0-9][A-Za-z0-9-]{0,38}$", var.github_owner))
    error_message = "github_owner must be a valid GitHub login (alphanumerics and dashes, up to 39 chars)."
  }
}

variable "github_repo" {
  type        = string
  description = "GitHub repository name (without owner)."

  validation {
    condition     = length(var.github_repo) > 0 && can(regex("^[A-Za-z0-9._-]+$", var.github_repo))
    error_message = "github_repo must be a valid GitHub repo name."
  }
}

variable "aws_account_id" {
  type        = string
  description = "AWS account ID where this role lives (used for SSM resource ARNs)."

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account ID."
  }
}

variable "aws_region" {
  type        = string
  description = "AWS region where SSM parameters live."
  default     = "us-east-1"
}

variable "ecr_repository_arns" {
  type        = list(string)
  description = "ARNs of ECR repositories the deploy role may push to (frontend + backend)."

  validation {
    condition     = length(var.ecr_repository_arns) >= 1
    error_message = "At least one ECR repository ARN must be provided."
  }
}

variable "ecs_cluster_arn" {
  type        = string
  description = "ECS cluster ARN the deploy role manages."
}

variable "ecs_service_arns" {
  type        = list(string)
  description = "ECS service ARNs the deploy role may UpdateService on."
  default     = []
}

variable "lambda_function_arns" {
  type        = list(string)
  description = "Lambda function ARNs the deploy role may UpdateFunctionCode on (orchestrator + webhooks)."
  default     = []
}

variable "tfstate_bucket_arn" {
  type        = string
  description = "ARN of the Terraform state S3 bucket."
}

variable "tflock_table_arn" {
  type        = string
  description = "ARN of the Terraform DynamoDB lock table."
}

variable "max_session_duration" {
  type        = number
  description = "Max session duration for the deploy role in seconds (default 1 hour)."
  default     = 3600

  validation {
    condition     = var.max_session_duration >= 3600 && var.max_session_duration <= 43200
    error_message = "max_session_duration must be between 3600 and 43200 seconds."
  }
}

variable "create_oidc_provider" {
  type        = bool
  description = "Whether to create the GitHub OIDC provider. Set false if it already exists in the account."
  default     = true
}

variable "github_oidc_thumbprint" {
  type        = string
  description = "GitHub Actions OIDC thumbprint. Documented value as of 2025."
  default     = "6938fd4d98bab03faadb97b34396831e3780aea1"
}

variable "tags" {
  type        = map(string)
  description = "Additional tags applied to created resources."
  default     = {}
}
