variable "name_prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "db_username" {
  type        = string
  description = "Database username"
}

variable "db_password" {
  type        = string
  description = "Database password"
  sensitive   = true
}

variable "db_endpoint" {
  type        = string
  description = "Database endpoint"
}

variable "db_port" {
  type        = number
  description = "Database port"
}

variable "db_name" {
  type        = string
  description = "Database name"
}

variable "jwt_secret" {
  type        = string
  description = "JWT secret"
  sensitive   = true
}

variable "anthropic_api_key" {
  type        = string
  description = "Anthropic API key for Claude AI"
  sensitive   = true
  default     = ""
}

variable "stripe_secret_key" {
  type        = string
  description = "Stripe secret key for payments"
  sensitive   = true
  default     = ""
}

variable "stripe_webhook_secret" {
  type        = string
  description = "Stripe webhook signing secret"
  sensitive   = true
  default     = ""
}

variable "stripe_price_catalog_json" {
  type        = string
  description = "Stripe regional price catalog JSON"
  sensitive   = true
  default     = ""
}

variable "flutterwave_public_key" {
  type        = string
  description = "Flutterwave public key"
  sensitive   = true
  default     = ""
}

variable "flutterwave_secret_key" {
  type        = string
  description = "Flutterwave secret key"
  sensitive   = true
  default     = ""
}

variable "flutterwave_secret_hash" {
  type        = string
  description = "Flutterwave webhook verification hash"
  sensitive   = true
  default     = ""
}

variable "flutterwave_plan_catalog_json" {
  type        = string
  description = "Flutterwave regional plan catalog JSON"
  sensitive   = true
  default     = ""
}

variable "flutterwave_payment_options" {
  type        = string
  description = "Flutterwave enabled payment options"
  default     = "card,banktransfer,ussd"
}

variable "adzuna_app_id" {
  type        = string
  description = "Adzuna API app ID for job aggregation"
  default     = ""
}

variable "adzuna_api_key" {
  type        = string
  description = "Adzuna API key for job aggregation"
  sensitive   = true
  default     = ""
}

variable "apify_token" {
  type        = string
  description = "Apify API token for job task execution"
  sensitive   = true
  default     = ""
}

variable "apify_job_tasks_json" {
  type        = string
  description = "Apify task configuration JSON for job crawling"
  sensitive   = true
  default     = ""
}

variable "greenhouse_board_tokens" {
  type        = string
  description = "Comma-separated Greenhouse board tokens"
  default     = ""
}

variable "lever_site_tokens" {
  type        = string
  description = "Comma-separated Lever site tokens"
  default     = ""
}

variable "workable_company_tokens" {
  type        = string
  description = "Comma-separated Workable account slugs or account:token pairs"
  sensitive   = true
  default     = ""
}

variable "redis_url" {
  type        = string
  description = "Optional Redis connection string"
  sensitive   = true
  default     = ""
}

variable "sentry_dsn" {
  type        = string
  description = "Optional backend Sentry DSN"
  sensitive   = true
  default     = ""
}
