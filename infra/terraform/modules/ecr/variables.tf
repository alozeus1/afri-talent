variable "name_prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "create" {
  type        = bool
  description = "Whether to create repositories (false to use existing)"
  default     = true
}
