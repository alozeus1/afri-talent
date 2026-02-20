variable "domain_name" {
  description = "Domain name for SES (e.g. afritalent.com)"
  type        = string
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID"
  type        = string
}

variable "ses_region" {
  description = "AWS region for SES (may differ from main region)"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment tag"
  type        = string
  default     = "dev"
}

variable "add_mx_record" {
  description = "Whether to add an MX record (enable if using SES for inbound email)"
  type        = bool
  default     = false
}
