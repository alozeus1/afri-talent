variable "name_prefix" {
  description = "Prefix for ECR repository names (e.g. afritalent-dev)."
  type        = string

  validation {
    condition     = length(var.name_prefix) > 0 && can(regex("^[a-z0-9][a-z0-9-]*$", var.name_prefix))
    error_message = "name_prefix must be lowercase alphanumeric and may include hyphens."
  }
}

variable "kms_key_arn" {
  description = "Optional KMS key ARN for ECR image encryption. If empty, repositories use AES256."
  type        = string
  default     = ""
}

variable "force_delete" {
  description = "Whether to force-delete repositories that still contain images. Useful in dev."
  type        = bool
  default     = true
}
