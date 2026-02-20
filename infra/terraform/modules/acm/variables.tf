variable "name_prefix" {
  type        = string
  description = "Prefix for resource names"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "domain_name" {
  type        = string
  description = "Primary domain name for the certificate"
}

variable "subject_alternative_names" {
  type        = list(string)
  description = "Additional domain names for the certificate"
  default     = []
}

variable "create_route53_records" {
  type        = bool
  description = "Whether to create Route53 validation records"
  default     = false
}

variable "route53_zone_id" {
  type        = string
  description = "Route53 hosted zone ID for DNS validation"
  default     = ""
}
