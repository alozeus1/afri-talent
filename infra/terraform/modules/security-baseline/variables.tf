variable "name_prefix" {
  type        = string
  description = "Naming prefix applied to security baseline resources (e.g. afritalent-dev)."

  validation {
    condition     = length(var.name_prefix) > 0 && length(var.name_prefix) <= 32
    error_message = "name_prefix must be between 1 and 32 characters."
  }
}

variable "tags" {
  type        = map(string)
  description = "Resource tags applied per-resource (provider default_tags should also be set in the root module)."
  default     = {}
}

variable "cloudtrail_log_retention_days" {
  type        = number
  description = "Retention (days) for the CloudTrail CloudWatch Logs group."
  default     = 90

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.cloudtrail_log_retention_days)
    error_message = "cloudtrail_log_retention_days must be a valid CloudWatch Logs retention value."
  }
}

variable "config_log_expiration_days" {
  type        = number
  description = "Days after which non-current Config snapshot/history objects are expired in S3."
  default     = 365

  validation {
    condition     = var.config_log_expiration_days >= 30 && var.config_log_expiration_days <= 3650
    error_message = "config_log_expiration_days must be between 30 and 3650."
  }
}

variable "enable_security_hub_standards" {
  type        = bool
  description = "Whether to subscribe Security Hub to the AWS Foundational and CIS standards."
  default     = true
}

variable "enable_config_rules" {
  type        = bool
  description = "Whether to provision the standard managed Config rules."
  default     = true
}

variable "create_config_service_linked_role" {
  type        = bool
  description = "Create the AWSServiceRoleForConfig service-linked role. Set to false if it already exists in the account (e.g. created by a previous Config setup or another Terraform stack); the recorder will reference the existing role via data source."
  default     = true
}
