variable "name_prefix" {
  description = "Name prefix for CloudFront, WAF, and ACM resources."
  type        = string

  validation {
    condition     = length(var.name_prefix) > 0
    error_message = "name_prefix must not be empty."
  }
}

variable "alb_dns_name" {
  description = "Public DNS name of the ALB used as CloudFront origin."
  type        = string

  validation {
    condition     = length(var.alb_dns_name) > 0
    error_message = "alb_dns_name must not be empty."
  }
}

variable "domain_name" {
  description = "Optional custom domain (e.g. afritalent.example.com). Empty string disables ACM cert + alias."
  type        = string
  default     = ""
}

variable "subject_alternative_names" {
  description = "Additional SANs to include on the ACM certificate."
  type        = list(string)
  default     = []
}

variable "external_acm_certificate_arn" {
  description = "ARN of an externally managed (caller-provided) ACM certificate in us-east-1. When use_external_cert = true, this module references this ARN on the CloudFront distribution. May be a known-after-apply value."
  type        = string
  default     = ""
}

variable "use_external_cert" {
  description = "When true, this module skips internal ACM cert creation and uses var.external_acm_certificate_arn instead. STATIC (must be plan-time known) so it can drive resource count."
  type        = bool
  default     = false
}

variable "rate_limit_per_5min" {
  description = "Per-IP request count over a 5-minute window above which WAF blocks."
  type        = number
  default     = 2000

  validation {
    condition     = var.rate_limit_per_5min >= 100
    error_message = "rate_limit_per_5min must be >= 100 (WAFv2 minimum)."
  }
}

variable "price_class" {
  description = "CloudFront price class (200 = NA + EU + Asia + ME + Africa)."
  type        = string
  default     = "PriceClass_200"

  validation {
    condition     = contains(["PriceClass_All", "PriceClass_200", "PriceClass_100"], var.price_class)
    error_message = "price_class must be PriceClass_All, PriceClass_200, or PriceClass_100."
  }
}

variable "minimum_protocol_version" {
  description = "Minimum TLS protocol version for the viewer certificate."
  type        = string
  default     = "TLSv1.2_2021"
}

variable "comment" {
  description = "Optional comment on the CloudFront distribution."
  type        = string
  default     = "afritalent edge distribution"
}
