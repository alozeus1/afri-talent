variable "zone_id" {
  type        = string
  description = "Route53 hosted zone ID"
}

variable "frontend_domain_name" {
  type        = string
  description = "Frontend DNS name"
}

variable "admin_domain_name" {
  type        = string
  description = "Admin DNS name"
  default     = ""
}

variable "api_domain_name" {
  type        = string
  description = "API DNS name"
  default     = ""
}

variable "cloudfront_domain_name" {
  type        = string
  description = "CloudFront distribution domain"
}

variable "cloudfront_zone_id" {
  type        = string
  description = "CloudFront hosted zone ID"
}

variable "alb_dns_name" {
  type        = string
  description = "ALB DNS name"
}

variable "alb_zone_id" {
  type        = string
  description = "ALB hosted zone ID"
}
