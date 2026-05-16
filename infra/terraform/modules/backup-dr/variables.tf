variable "name_prefix" {
  description = "Name prefix for backup vault, plan, role, and KMS keys (e.g. afritalent-dev)."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,40}$", var.name_prefix))
    error_message = "name_prefix must be lowercase alphanumeric with hyphens, 3-41 chars, starting with a letter."
  }
}

variable "primary_region" {
  description = "Primary AWS region (where the source resources live). Used for the default provider's vault."
  type        = string
}

variable "dr_region" {
  description = "DR AWS region for cross-region recovery-point copies. Must differ from primary_region."
  type        = string

  validation {
    condition     = var.dr_region != ""
    error_message = "dr_region must be set."
  }
}

variable "aurora_cluster_arn" {
  description = "ARN of the Aurora cluster to protect. Selected into the plan via resource ARN (most specific) so unrelated RDS resources are not pulled in."
  type        = string
}

variable "schedule_expression" {
  description = "Cron expression for the daily backup rule (AWS Backup syntax). Default 06:00 UTC."
  type        = string
  default     = "cron(0 6 ? * * *)"
}

variable "retention_days" {
  description = "Days to retain each recovery point in BOTH the primary vault and the DR vault."
  type        = number
  default     = 30

  validation {
    condition     = var.retention_days >= 7 && var.retention_days <= 365
    error_message = "retention_days must be between 7 and 365."
  }
}

variable "cold_storage_after_days" {
  description = "Days after creation to transition a recovery point to cold storage. Set to 0 to disable (cold storage requires ≥ 90 days total retention; not applicable to Aurora when retention_days < 90)."
  type        = number
  default     = 0
}

variable "start_window_minutes" {
  description = "Minutes after the schedule time before AWS Backup gives up trying to start the job."
  type        = number
  default     = 60
}

variable "completion_window_minutes" {
  description = "Minutes after a backup job starts before AWS Backup marks it failed."
  type        = number
  default     = 360
}

variable "tags" {
  description = "Additional tags merged into all resources (provider default_tags applies separately)."
  type        = map(string)
  default     = {}
}
