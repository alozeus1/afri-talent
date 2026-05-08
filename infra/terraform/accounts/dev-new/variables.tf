variable "aws_account_id" {
  type        = string
  description = "AWS account ID hosting this stack."
  default     = "108188564905"

  validation {
    condition     = length(var.aws_account_id) == 12
    error_message = "aws_account_id must be a 12-digit AWS account ID."
  }
}

variable "aws_region" {
  type        = string
  description = "Primary AWS region for stack resources."
  default     = "us-east-1"
}

variable "environment" {
  type        = string
  description = "Logical environment name (dev, staging, prod)."
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "name_prefix" {
  type        = string
  description = "Resource name prefix; passed to every module that supports it."
  default     = "afritalent-dev"
}

variable "ssm_path_prefix" {
  type        = string
  description = "SSM parameter path prefix without leading or trailing slash (e.g. afritalent/dev). Modules inject leading/trailing slashes as needed."
  default     = "afritalent/dev"

  validation {
    condition     = !can(regex("^/", var.ssm_path_prefix)) && !can(regex("/$", var.ssm_path_prefix))
    error_message = "ssm_path_prefix must NOT start or end with a slash."
  }
}

variable "owner_tag" {
  type        = string
  description = "Value for the Owner cost-allocation tag on every resource."
  default     = "platform"
}

# ── DNS / TLS ─────────────────────────────────────────────────────────────────

variable "domain_name" {
  type        = string
  description = "Public domain for this environment (e.g. dev.afritalent.com). When empty the stack does NOT request an ACM cert; ALB HTTPS uses placeholder cert and CloudFront uses default *.cloudfront.net cert. Set to a real domain before going live."
  default     = ""
}

variable "create_route53_zone" {
  type        = bool
  description = "Whether to create a Route 53 hosted zone for var.domain_name in this account. Set to false if the zone lives in another account / registrar."
  default     = true
}

# ── Aurora knobs ──────────────────────────────────────────────────────────────

variable "aurora_min_acu" {
  type        = number
  description = "Aurora Serverless v2 minimum ACU. 0 enables auto-pause."
  default     = 0
}

variable "aurora_max_acu" {
  type        = number
  description = "Aurora Serverless v2 maximum ACU."
  default     = 4
}

variable "aurora_seconds_until_auto_pause" {
  type        = number
  description = "Idle seconds before Serverless v2 auto-pauses (only effective when aurora_min_acu = 0)."
  default     = 1800
}

# ── ECS knobs ─────────────────────────────────────────────────────────────────

variable "ecs_desired_count" {
  type        = number
  description = "Desired task count per ECS service (frontend AND backend)."
  default     = 1
}

variable "ecs_fargate_base" {
  type        = number
  description = "Base on-demand task count before Fargate Spot kicks in."
  default     = 1
}

variable "ecs_fargate_spot_weight" {
  type        = number
  description = "Weight applied to FARGATE_SPOT in the cluster default capacity provider strategy."
  default     = 4
}

# ── GitHub OIDC ───────────────────────────────────────────────────────────────

variable "github_owner" {
  type        = string
  description = "GitHub owner/org that owns the repository."
  default     = "alozeus1"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository name."
  default     = "afri-talent"
}

variable "create_oidc_provider" {
  type        = bool
  description = "Whether to create the GitHub Actions OIDC provider (false if the account already has one)."
  default     = true
}

# ── Budgets / alerts ──────────────────────────────────────────────────────────

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly AWS budget cap (USD). Triggers email alerts at 50/80/100%."
  default     = 150
}

variable "budget_alert_email" {
  type        = string
  description = "Email address that receives budget threshold notifications."
  default     = "alozeus1@gmail.com"
}

# ── Lambda zip paths (set by CI; empty = placeholder zips) ────────────────────

variable "webhook_stripe_zip_path" {
  type        = string
  description = "Path to the built webhook-stripe Lambda zip."
  default     = ""
}

variable "webhook_flutterwave_zip_path" {
  type        = string
  description = "Path to the built webhook-flutterwave Lambda zip."
  default     = ""
}

variable "orchestrator_zip_path" {
  type        = string
  description = "Path to the built orchestrator-step Lambda zip."
  default     = ""
}

# ── Image tag ─────────────────────────────────────────────────────────────────

variable "image_tag" {
  type        = string
  description = "Tag of the ECR images to deploy via the ECS task definition. CI usually overrides via aws ecs register-task-definition; default 'latest' suffices for first apply."
  default     = "latest"
}

# ── Tfstate bootstrap ARNs (for the OIDC role policy) ────────────────────────

variable "tfstate_bucket_arn" {
  type        = string
  description = "ARN of the S3 bucket holding Terraform state (bootstrapped before init)."
  default     = "arn:aws:s3:::afritalent-108188564905-tfstate"
}

variable "tflock_table_arn" {
  type        = string
  description = "ARN of the DynamoDB lock table for Terraform state."
  default     = "arn:aws:dynamodb:us-east-1:108188564905:table/afritalent-108188564905-tflocks"
}
