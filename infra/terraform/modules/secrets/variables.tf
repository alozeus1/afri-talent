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
