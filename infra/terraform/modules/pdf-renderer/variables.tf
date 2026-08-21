variable "name_prefix" { type = string }
variable "aws_region" { type = string }
variable "cluster_arn" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "security_group_id" { type = string }
variable "service_discovery_service_arn" { type = string }
variable "execution_role_arn" { type = string }

variable "task_role_arn" {
  type        = string
  description = "Least-privilege task role. It must not grant database, S3, KMS, or general internet access."
}

variable "shared_secret_arn" {
  type      = string
  sensitive = true
}

variable "image_ref" {
  type        = string
  description = "Immutable renderer image reference using @sha256 digest."
  validation {
    condition     = can(regex("@sha256:[a-f0-9]{64}$", var.image_ref))
    error_message = "image_ref must use an immutable sha256 digest."
  }
}

variable "desired_count" {
  type    = number
  default = 1
}
variable "cpu" {
  type    = number
  default = 1024
}
variable "memory" {
  type    = number
  default = 2048
}
variable "ephemeral_storage_gib" {
  type    = number
  default = 21
}
variable "max_input_bytes" {
  type    = number
  default = 1000000
}
variable "max_output_bytes" {
  type    = number
  default = 10000000
}
variable "max_concurrency" {
  type    = number
  default = 2
}
variable "timeout_ms" {
  type    = number
  default = 30000
}
variable "log_retention_days" {
  type    = number
  default = 90
}
variable "log_kms_key_arn" {
  type    = string
  default = ""
}
variable "tags" {
  type    = map(string)
  default = {}
}
