# Variable shape mirrors `accounts/dev-new/variables.tf` so modules behave
# identically across accounts. Production values are overridden via
# `terraform.tfvars`; defaults shown here remain dev-friendly so a fresh
# clone won't accidentally produce prod-shaped infra without intent.

variable "aws_account_id" {
  type        = string
  description = "AWS account ID hosting this stack. For prod, set to the new dedicated afritalent-prod account ID."
  default     = "000000000000" # placeholder — terraform.tfvars must override

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
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "name_prefix" {
  type        = string
  description = "Resource name prefix; passed to every module that supports it."
  default     = "afritalent-prod"
}

variable "ssm_path_prefix" {
  type        = string
  description = "SSM parameter path prefix without leading or trailing slash (e.g. afritalent/prod). Modules inject leading/trailing slashes as needed."
  default     = "afritalent/prod"

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
  description = "Public domain for this environment. Prod default is afri-talent.com. ALB HTTPS + CloudFront both use this; empty disables HTTPS and CloudFront aliases. DNS cutover (DigitalOcean → Route 53) is a founder step — see docs/runbooks/iac-cutover.md."
  default     = "afri-talent.com"
}

variable "create_route53_zone" {
  type        = bool
  description = "Whether to create a Route 53 hosted zone for var.domain_name in this account. Set to false if the zone lives in another account / registrar (currently DigitalOcean — see cutover runbook for migration sequence)."
  default     = true
}

# ── Aurora knobs (prod-tuned defaults; tfvars overrides as needed) ────────────

variable "aurora_min_acu" {
  type        = number
  description = "Aurora Serverless v2 minimum ACU. 0 enables auto-pause; NOT recommended for prod traffic. Default 1 keeps the cluster warm."
  default     = 1
}

variable "aurora_max_acu" {
  type        = number
  description = "Aurora Serverless v2 maximum ACU. Prod default 16 (4x dev) for headroom under launch-day load."
  default     = 16
}

variable "aurora_seconds_until_auto_pause" {
  type        = number
  description = "Idle seconds before Serverless v2 auto-pauses (only effective when aurora_min_acu = 0)."
  default     = 1800
}

# ── Aurora backup / DR / deletion-protection (Wave 8 §9.3) ────────────────────

variable "aurora_backup_retention_period" {
  type        = number
  description = "Aurora automated backup retention in days. Also defines the PITR window (spec: ≥ 14 days). Set to 30 in dev/staging/prod per launch master prompt §9.3."
  default     = 30

  validation {
    condition     = var.aurora_backup_retention_period >= 14 && var.aurora_backup_retention_period <= 35
    error_message = "aurora_backup_retention_period must be ≥ 14 (Wave 8 §9.3 spec) and ≤ 35 (Aurora limit)."
  }
}

variable "aurora_deletion_protection" {
  type        = bool
  description = "Whether to enable Aurora deletion protection. Wave 8 §9.3 spec: ON. Always true for prod."
  default     = true
}

variable "aurora_skip_final_snapshot" {
  type        = bool
  description = "Whether to skip the final Aurora snapshot when the cluster is destroyed. Wave 8 §9.3 spec: false (retain a final snapshot). Never set true for prod."
  default     = false
}

# ── Cross-region DR (Wave 8 §9.3) ─────────────────────────────────────────────

variable "dr_region" {
  type        = string
  description = "AWS region for cross-region snapshot copies via AWS Backup. Spec default: us-west-2."
  default     = "us-west-2"
}

variable "backup_daily_schedule_cron" {
  type        = string
  description = "Cron expression for the daily Backup plan rule. Default 06:00 UTC matches the Aurora preferred backup window."
  default     = "cron(0 6 ? * * *)"
}

variable "backup_retention_days" {
  type        = number
  description = "Days to retain each AWS Backup recovery point (primary vault + DR copy). Spec: 30."
  default     = 30

  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 365
    error_message = "backup_retention_days must be between 7 and 365."
  }
}

variable "backup_cold_storage_after_days" {
  type        = number
  description = "Days after which a recovery point transitions to cold storage. Set to 0 to disable cold storage (recommended for Aurora — cold-storage transitions require ≥ 90 days total retention)."
  default     = 0
}

# ── ECS knobs (prod-tuned for HA) ─────────────────────────────────────────────

variable "ecs_desired_count" {
  type        = number
  description = "Desired task count per ECS service (frontend AND backend). Prod default 2 for HA across AZs."
  default     = 2
}

variable "ecs_fargate_base" {
  type        = number
  description = "Base on-demand task count before Fargate Spot kicks in. Prod default 2 — keep both AZs on on-demand for stability."
  default     = 2
}

variable "ecs_fargate_spot_weight" {
  type        = number
  description = "Weight applied to FARGATE_SPOT in the cluster default capacity provider strategy. Prod default 2 (vs dev 4) — less aggressive Spot mix while we collect data on interruption rates."
  default     = 2
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
  description = "Monthly AWS budget cap (USD). Triggers email alerts at 50/80/100%. Prod default 750 (5x dev) for launch month; revisit after one full month."
  default     = 750
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

variable "blog_automation_zip_path" {
  type        = string
  description = "Path to the built blog-automation Lambda zip."
  default     = ""
}

# ── Image tag ─────────────────────────────────────────────────────────────────

variable "image_tag" {
  type        = string
  description = "Tag of the ECR images to deploy via the ECS task definition. CI overrides via -var=image_tag=<sha>."
  default     = "latest"
}

# ── Tfstate bootstrap ARNs (override in tfvars for the new prod account) ──────

variable "tfstate_bucket_arn" {
  type        = string
  description = "ARN of the S3 bucket holding Terraform state (bootstrapped before init). Override in terraform.tfvars with the prod account's bucket ARN."
  default     = ""
}

variable "tflock_table_arn" {
  type        = string
  description = "ARN of the DynamoDB lock table for Terraform state. Override in terraform.tfvars with the prod account's table ARN."
  default     = ""
}
