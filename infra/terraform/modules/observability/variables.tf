variable "name_prefix" {
  type        = string
  description = "Naming prefix applied to observability resources (e.g. afritalent-dev)."

  validation {
    condition     = length(var.name_prefix) > 0 && length(var.name_prefix) <= 32
    error_message = "name_prefix must be between 1 and 32 characters."
  }
}

variable "tags" {
  type        = map(string)
  description = "Resource tags applied per-resource."
  default     = {}
}

variable "vpc_id" {
  type        = string
  description = "ID of the VPC to enable flow logs against."

  validation {
    condition     = can(regex("^vpc-[0-9a-f]{8,17}$", var.vpc_id))
    error_message = "vpc_id must look like vpc-xxxxxxxx."
  }
}

variable "log_retention_days" {
  type        = number
  description = "Default retention (days) for CloudWatch Logs groups created by this module."
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a valid CloudWatch Logs retention value."
  }
}

variable "ecs_cluster_name" {
  type        = string
  description = "Optional ECS cluster name used by dashboard widgets."
  default     = ""
}

variable "ecs_service_frontend_name" {
  type        = string
  description = "Optional ECS frontend service name for dashboard widgets."
  default     = ""
}

variable "ecs_service_backend_name" {
  type        = string
  description = "Optional ECS backend service name for dashboard widgets."
  default     = ""
}

variable "alb_arn_suffix" {
  type        = string
  description = "ALB arn_suffix (e.g. app/<name>/<id>) for dashboard widgets."
  default     = ""
}

variable "target_group_frontend_arn_suffix" {
  type        = string
  description = "Frontend target group arn_suffix for dashboard widgets."
  default     = ""
}

variable "target_group_backend_arn_suffix" {
  type        = string
  description = "Backend target group arn_suffix for dashboard widgets."
  default     = ""
}

variable "lambda_function_names" {
  type        = list(string)
  description = "Lambda function names to render in dashboard widgets."
  default     = []
}

variable "aurora_cluster_identifier" {
  type        = string
  description = "Aurora cluster identifier for dashboard widgets."
  default     = ""
}

# ── SLO alarms (Wave 9 §10.1) ────────────────────────────────────────────────

variable "alerts_email" {
  type        = string
  description = "Email subscribed to the SLO alerts SNS topic as a fallback channel. Leave empty to disable email subscription (e.g. when PagerDuty is wired)."
  default     = ""
}

variable "environment" {
  type        = string
  description = "Environment dimension applied to custom CloudWatch metrics (dev/staging/prod). Must match the value the backend emits via aws-sdk PutMetricData."
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "ssm_path_prefix" {
  type        = string
  description = "SSM parameter path prefix used by the (commented) PagerDuty subscription block. Without leading or trailing slash, e.g. 'afritalent/dev'."
  default     = ""
}
