variable "name_prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "role_name" {
  type        = string
  description = "IAM role name for GitHub Actions"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository in OWNER/REPO format"
}

variable "github_ref" {
  type        = string
  description = "Git reference allowed to assume role"
}

variable "ecr_repository_arns" {
  type        = list(string)
  description = "ECR repository ARNs"
}

variable "ecs_cluster_arn" {
  type        = string
  description = "ECS cluster ARN"
}

variable "ecs_service_arns" {
  type        = list(string)
  description = "ECS service ARNs"
}

variable "ecs_task_execution_role_arn" {
  type        = string
  description = "ECS task execution role ARN"
}

variable "ecs_task_role_arn" {
  type        = string
  description = "ECS task role ARN"
}

variable "additional_policy_arn" {
  type        = string
  description = "Optional additional IAM policy ARN"
  default     = ""
}

variable "create_oidc_provider" {
  type        = bool
  description = "Create the GitHub OIDC provider. Set false if it already exists in the account."
  default     = true
}

variable "existing_oidc_provider_arn" {
  type        = string
  description = "ARN of an existing GitHub OIDC provider. Used when create_oidc_provider=false."
  default     = ""
}
