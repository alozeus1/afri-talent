variable "name_prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "secret_arn" {
  type        = string
  description = "Secrets Manager ARN for app secrets"
}
