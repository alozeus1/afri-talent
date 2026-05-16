variable "name_prefix" {
  description = "Name prefix for all Aurora resources (e.g., 'afritalent-dev'). Used to derive cluster_identifier and KMS alias."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,40}$", var.name_prefix))
    error_message = "name_prefix must be lowercase alphanumeric with hyphens, 3-41 chars, starting with a letter."
  }
}

variable "isolated_subnet_ids" {
  description = "List of isolated (no-internet) subnet IDs for the DB subnet group. Should span 3 AZs."
  type        = list(string)

  validation {
    condition     = length(var.isolated_subnet_ids) >= 2
    error_message = "Aurora requires at least 2 subnets in different AZs (3 recommended)."
  }
}

variable "sg_aurora_id" {
  description = "Security group ID to attach to the Aurora cluster (provided by network module)."
  type        = string
}

variable "db_name" {
  description = "Initial database name created in the cluster."
  type        = string
  default     = "afritalent"

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]{0,62}$", var.db_name))
    error_message = "db_name must start with a letter and contain only letters, digits and underscores (max 63 chars)."
  }
}

variable "master_username" {
  description = "Master username for the Aurora cluster. Password is auto-managed by Secrets Manager."
  type        = string
  default     = "afritalent_admin"

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]{0,62}$", var.master_username))
    error_message = "master_username must start with a letter and contain only letters, digits and underscores."
  }
}

variable "engine_version" {
  description = "Aurora PostgreSQL engine version. Pin to a Serverless v2 supported PG15 release."
  type        = string
  # Pinned to a version confirmed available in us-east-1 for aurora-postgresql
  # Serverless v2 (verified via aws rds describe-db-engine-versions).
  default = "15.8"
}

variable "min_acu" {
  description = "Aurora Serverless v2 minimum ACU. 0 enables auto-pause; otherwise must be >= 0.5 in 0.5 increments."
  type        = number
  default     = 0

  validation {
    # Allowed values: exactly 0 (auto-pause) OR a multiple of 0.5 that is >= 0.5.
    condition = (
      var.min_acu == 0
      ) || (
      var.min_acu >= 0.5 && floor(var.min_acu * 2) == (var.min_acu * 2)
    )
    error_message = "min_acu must be 0 (auto-pause) or a multiple of 0.5 that is >= 0.5 (0.5, 1.0, 1.5, ...)."
  }
}

variable "max_acu" {
  description = "Aurora Serverless v2 maximum ACU."
  type        = number
  default     = 4

  validation {
    condition     = var.max_acu >= 1 && var.max_acu <= 256 && floor(var.max_acu * 2) == (var.max_acu * 2)
    error_message = "max_acu must be between 1 and 256 in 0.5 increments."
  }
}

variable "seconds_until_auto_pause" {
  description = "Seconds of inactivity before Serverless v2 auto-pauses (only effective when min_acu = 0)."
  type        = number
  default     = 1800

  validation {
    condition     = var.seconds_until_auto_pause >= 300 && var.seconds_until_auto_pause <= 86400
    error_message = "seconds_until_auto_pause must be between 300 (5 min) and 86400 (24 h)."
  }
}

variable "deletion_protection" {
  description = "Whether to enable deletion protection on the cluster. PROD MUST OVERRIDE TO TRUE."
  type        = bool
  default     = false
}

variable "backup_retention_period" {
  description = "Days of automated backups to retain (1-35). Aurora PITR window equals this value, so callers needing PITR ≥ 14 days (Wave 8 §9.3) must set this ≥ 14."
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_period >= 1 && var.backup_retention_period <= 35
    error_message = "backup_retention_period must be between 1 and 35."
  }
}

variable "skip_final_snapshot" {
  description = "Whether to skip the final snapshot when the cluster is destroyed. PROD MUST OVERRIDE TO FALSE so a recovery snapshot is retained."
  type        = bool
  default     = true
}

variable "final_snapshot_identifier" {
  description = "Identifier for the final snapshot taken when skip_final_snapshot is false. Required only when skip_final_snapshot = false."
  type        = string
  default     = ""
}

variable "preferred_backup_window" {
  description = "Daily backup window in UTC (HH:MM-HH:MM)."
  type        = string
  default     = "03:00-04:00"
}

variable "performance_insights_retention_period" {
  description = "Days to retain Performance Insights data. 7 = free tier."
  type        = number
  default     = 7
}

variable "tags" {
  description = "Additional tags merged into all resources (provider default_tags applies separately)."
  type        = map(string)
  default     = {}
}
