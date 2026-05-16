variable "name_prefix" {
  description = <<EOT
Path prefix for all parameters, with slashes baked in by the caller.
Example: 'afritalent/dev'  → produces '/afritalent/dev/<KEY>' and '/afritalent/dev/blog/<KEY>'.
Note: must NOT start or end with a slash; the module adds the leading '/'.
EOT
  type        = string

  validation {
    condition     = can(regex("^[a-zA-Z0-9][a-zA-Z0-9._/-]+[a-zA-Z0-9]$", var.name_prefix)) && !startswith(var.name_prefix, "/") && !endswith(var.name_prefix, "/")
    error_message = "name_prefix must be a slash-separated path WITHOUT leading or trailing slash, e.g. 'afritalent/dev'."
  }
}

variable "required_params" {
  description = "Required SecureString parameter names (must be present before the app starts)."
  type        = list(string)
  default = [
    "JWT_SECRET",
    "SESSION_SECRET",
    "ANTHROPIC_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_CATALOG_JSON",
    "FLUTTERWAVE_PUBLIC_KEY",
    "FLUTTERWAVE_SECRET_KEY",
    "FLUTTERWAVE_SECRET_HASH",
    "FLUTTERWAVE_PLAN_CATALOG_JSON",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ]
}

variable "optional_params" {
  description = "Optional SecureString parameter names (placeholders only; values injected manually post-apply)."
  type        = list(string)
  default = [
    "FLUTTERWAVE_PAYMENT_OPTIONS",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "ADZUNA_APP_ID",
    "ADZUNA_API_KEY",
    "APIFY_TOKEN",
    "APIFY_JOB_TASKS_JSON",
    "GREENHOUSE_BOARD_TOKENS",
    "LEVER_SITE_TOKENS",
    "WORKABLE_COMPANY_TOKENS",
    "COMPANY_CAREER_SOURCES_JSON",
    "REDIS_URL",
    "SENTRY_DSN",
    "ADMIN_BOOTSTRAP_EMAIL",
    "ADMIN_BOOTSTRAP_PASSWORD",
    "AI_FAST_MODEL",
    "AI_QUALITY_MODEL",
    "OPENAI_API_KEY",
    "OPENAI_EMBEDDING_ENDPOINT",
  ]
}

variable "blog_params" {
  description = "Blog pipeline SecureString parameter names. Stored under '<name_prefix>/blog/<KEY>'."
  type        = list(string)
  default = [
    "NEWS_API_KEY",
    "UNSPLASH_ACCESS_KEY",
    "PEXELS_API_KEY",
    "BLOG_ADMIN_NOTIFICATION_EMAIL",
  ]
}

variable "toggle_params" {
  description = <<EOT
Map of plain String (non-secret) feature-flag parameters under '<name_prefix>/<KEY>'.
Created with the supplied default value; subsequent value edits in the AWS console
are preserved (lifecycle ignores 'value'). Use for runtime toggles like
BLOG_AUTOMATION_ENABLED that the founder flips post-apply.
EOT
  type        = map(string)
  default = {
    BLOG_AUTOMATION_ENABLED = "0"
  }
}

# --------------------------------------------------------------------------
# Inputs for the DATABASE_URL parameter shell. Value is intentionally NOT
# constructed at plan time because the master password is sealed inside
# Secrets Manager and unknown to Terraform; the deploy script
# (scripts/migrate/inject-secrets.sh) reads the secret and writes the
# real DATABASE_URL.
# --------------------------------------------------------------------------

variable "rds_proxy_endpoint" {
  description = "Endpoint of the RDS Proxy. Used only for documentation/tag context — value is still placeholder until the deploy script writes the real URL."
  type        = string
}

variable "db_name" {
  description = "Aurora database name (used for documentation context only)."
  type        = string
}

variable "master_username" {
  description = "Aurora master username (used for documentation context only)."
  type        = string
}

variable "master_password_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the auto-rotated master password. The inject-secrets.sh script reads this and writes the real DATABASE_URL into SSM."
  type        = string
}

variable "tags" {
  description = "Additional tags merged into all resources."
  type        = map(string)
  default     = {}
}
