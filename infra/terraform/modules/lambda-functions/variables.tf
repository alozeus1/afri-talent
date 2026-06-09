variable "name_prefix" {
  description = "Prefix for Lambda + Step Functions resource names."
  type        = string

  validation {
    condition     = length(var.name_prefix) > 0 && can(regex("^[a-z0-9][a-z0-9-]*$", var.name_prefix))
    error_message = "name_prefix must be lowercase alphanumeric and may include hyphens."
  }
}

variable "aws_region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account ID — used to scope SSM parameter ARNs."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account ID."
  }
}

# ---- VPC ----

variable "private_subnet_ids" {
  description = "Private subnet IDs in which Lambda ENIs are placed."
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "Provide at least 2 private subnet IDs across different AZs."
  }
}

variable "sg_lambda_id" {
  description = "Security group ID applied to Lambda ENIs."
  type        = string
}

# ---- SSM / KMS ----

variable "ssm_path_prefix" {
  description = "SSM parameter path prefix the Lambda execution roles may read (e.g. afritalent/dev)."
  type        = string

  validation {
    condition     = length(var.ssm_path_prefix) > 0
    error_message = "ssm_path_prefix is required."
  }
}

variable "ssm_kms_key_arn" {
  description = "KMS key ARN used to encrypt SSM SecureString parameters."
  type        = string
}

variable "cloudwatch_kms_key_arn" {
  description = "Optional KMS key ARN for CloudWatch log group encryption."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention for Lambda + Step Functions log groups."
  type        = number
  default     = 30
}

# ---- Function source paths (CI provides; default empty triggers placeholder) ----

variable "webhook_stripe_zip_path" {
  description = "Path to the built webhook-stripe Lambda zip. Empty => use placeholder."
  type        = string
  default     = ""
}

variable "webhook_flutterwave_zip_path" {
  description = "Path to the built webhook-flutterwave Lambda zip. Empty => use placeholder."
  type        = string
  default     = ""
}

variable "orchestrator_zip_path" {
  description = "Path to the built orchestrator-step Lambda zip. Empty => use placeholder."
  type        = string
  default     = ""
}

variable "blog_automation_zip_path" {
  description = "Path to the built blog-automation Lambda zip. Empty => use placeholder."
  type        = string
  default     = ""
}

# ---- Function env vars ----

variable "webhook_stripe_env" {
  description = "Plain env vars for webhook-stripe."
  type        = map(string)
  default     = { NODE_ENV = "production" }
}

variable "webhook_flutterwave_env" {
  description = "Plain env vars for webhook-flutterwave."
  type        = map(string)
  default     = { NODE_ENV = "production" }
}

variable "orchestrator_env" {
  description = "Plain env vars for orchestrator-step."
  type        = map(string)
  default     = { NODE_ENV = "production", MOCK_AI = "0" }
}

variable "blog_automation_env" {
  description = "Plain env vars for blog-automation. BLOG_AUTOMATION_ENABLED defaults to '0' — runtime toggle via SSM."
  type        = map(string)
  default     = { NODE_ENV = "production", BLOG_AUTOMATION_ENABLED = "0" }
}

# ---- Function URL CORS for webhooks ----

variable "webhook_function_url_allow_origins" {
  description = "CORS allow_origins for webhook Function URLs. Stripe POSTs without auth — '*' is acceptable."
  type        = list(string)
  default     = ["*"]
}

# ---- Memory / timeout overrides ----

variable "webhook_memory_mb" {
  description = "Memory for webhook Lambdas."
  type        = number
  default     = 512
}

variable "webhook_timeout_sec" {
  description = "Timeout (s) for webhook Lambdas."
  type        = number
  default     = 30
}

variable "orchestrator_memory_mb" {
  description = "Memory for the orchestrator Lambda."
  type        = number
  default     = 1024
}

variable "orchestrator_timeout_sec" {
  description = "Timeout (s) for the orchestrator Lambda. Max 900s (15 min)."
  type        = number
  default     = 900

  validation {
    condition     = var.orchestrator_timeout_sec > 0 && var.orchestrator_timeout_sec <= 900
    error_message = "orchestrator_timeout_sec must be 1..900."
  }
}

variable "blog_automation_memory_mb" {
  description = "Memory for the blog-automation Lambda."
  type        = number
  default     = 1024
}

variable "blog_automation_timeout_sec" {
  description = "Timeout (s) for the blog-automation Lambda. Max 900s (15 min)."
  type        = number
  default     = 900

  validation {
    condition     = var.blog_automation_timeout_sec > 0 && var.blog_automation_timeout_sec <= 900
    error_message = "blog_automation_timeout_sec must be 1..900."
  }
}

variable "blog_automation_schedule_expression" {
  description = "EventBridge schedule expression for the blog-automation cron. Default: Mondays 09:00 UTC."
  type        = string
  default     = "cron(0 9 ? * MON *)"
}

variable "blog_automation_schedule_enabled" {
  description = "Whether the EventBridge rule fires the blog-automation Lambda. Defense-in-depth: the runtime SSM flag BLOG_AUTOMATION_ENABLED also gates execution inside the Lambda."
  type        = bool
  default     = true
}
