variable "name_prefix" {
  description = "Name prefix for proxy resources (e.g., 'afritalent-dev')."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,40}$", var.name_prefix))
    error_message = "name_prefix must be lowercase alphanumeric with hyphens, 3-41 chars, starting with a letter."
  }
}

variable "private_subnet_ids" {
  description = "Private subnet IDs the proxy ENIs are placed in. Must reach Aurora and be reachable by Fargate/Lambda."
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "RDS Proxy requires at least 2 subnets in different AZs."
  }
}

variable "sg_rds_proxy_id" {
  description = "Security group attached to the RDS Proxy ENIs."
  type        = string
}

variable "aurora_cluster_identifier" {
  description = "Identifier of the Aurora cluster to register as a proxy target."
  type        = string
}

variable "master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the master DB credentials (output of aurora-serverless module)."
  type        = string
}

variable "secret_kms_key_arn" {
  description = "ARN of the KMS key encrypting the master user secret. Required so the proxy role can decrypt."
  type        = string
}

variable "idle_client_timeout" {
  description = "Seconds an idle client connection is kept open by the proxy."
  type        = number
  default     = 1800

  validation {
    condition     = var.idle_client_timeout >= 60 && var.idle_client_timeout <= 28800
    error_message = "idle_client_timeout must be between 60 and 28800 seconds."
  }
}

variable "connection_borrow_timeout" {
  description = "Seconds clients wait for a backend connection from the proxy pool."
  type        = number
  default     = 120
}

variable "max_connections_percent" {
  description = "Max % of the cluster's max_connections the proxy may use."
  type        = number
  default     = 90

  validation {
    condition     = var.max_connections_percent >= 1 && var.max_connections_percent <= 100
    error_message = "max_connections_percent must be 1-100."
  }
}

variable "max_idle_connections_percent" {
  description = "Max % of pool connections that may sit idle."
  type        = number
  default     = 50

  validation {
    condition     = var.max_idle_connections_percent >= 0 && var.max_idle_connections_percent <= 100
    error_message = "max_idle_connections_percent must be 0-100."
  }
}

variable "require_tls" {
  description = "Force TLS between client and proxy."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags merged into all resources."
  type        = map(string)
  default     = {}
}
