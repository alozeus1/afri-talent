variable "name_prefix" {
  type        = string
  description = "Naming prefix applied to budget resources (e.g. afritalent-dev)."

  validation {
    condition     = length(var.name_prefix) > 0 && length(var.name_prefix) <= 32
    error_message = "name_prefix must be between 1 and 32 characters."
  }
}

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly budget limit in USD."
  default     = 150

  validation {
    condition     = var.monthly_budget_usd > 0 && var.monthly_budget_usd <= 100000
    error_message = "monthly_budget_usd must be between 1 and 100000."
  }
}

variable "budget_alert_email" {
  type        = string
  description = "Email address to notify on budget thresholds."

  validation {
    condition     = can(regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$", var.budget_alert_email))
    error_message = "budget_alert_email must be a valid email address."
  }
}

variable "project_tag_value" {
  type        = string
  description = "Cost-allocation tag value applied as a budget filter (TagKeyValue=user:Project$<value>)."
  default     = "afritalent"
}

variable "tags" {
  type        = map(string)
  description = "Resource tags applied per-resource."
  default     = {}
}
