variable "name_prefix" {
  description = "Name prefix for all Redis resources (e.g., 'afritalent-dev'). Used to derive replication-group ID and KMS alias."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.name_prefix))
    error_message = "name_prefix must be lowercase alphanumeric with hyphens, 3-31 chars, starting with a letter."
  }
}

variable "vpc_id" {
  description = "VPC ID where the Redis replication group lives."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for the Redis subnet group. At least 2 in different AZs required for multi-AZ failover."
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least 2 subnets across different AZs are required for Multi-AZ + automatic failover."
  }
}

variable "ingress_security_group_ids" {
  description = "Security group IDs allowed to connect to Redis on port 6379. Typically the ECS task SGs."
  type        = list(string)

  validation {
    condition     = length(var.ingress_security_group_ids) >= 1
    error_message = "Provide at least one ingress SG (the ECS task SG)."
  }
}

variable "node_type" {
  description = "Cache node instance type. cache.t4g.micro is the smallest production-eligible option (~$11/month per node)."
  type        = string
  default     = "cache.t4g.micro"
}

variable "num_cache_clusters" {
  description = "Number of nodes in the replication group (1 primary + N-1 replicas). Must be at least 2 because Multi-AZ automatic failover is always enabled."
  type        = number
  default     = 2

  validation {
    condition     = var.num_cache_clusters >= 2 && var.num_cache_clusters <= 6
    error_message = "num_cache_clusters must be between 2 and 6."
  }
}

variable "engine_version" {
  description = "Redis engine version. Major.minor — AWS picks the latest patch."
  type        = string
  default     = "7.1"
}

variable "snapshot_retention_days" {
  description = "Number of days automated snapshots are retained. 0 disables backups."
  type        = number
  default     = 7
}

variable "tags" {
  description = "Tags applied to every resource the module creates."
  type        = map(string)
  default     = {}
}
