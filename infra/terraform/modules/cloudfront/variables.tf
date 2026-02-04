variable "name_prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "alb_dns_name" {
  type        = string
  description = "ALB DNS name"
}

variable "price_class" {
  type        = string
  description = "CloudFront price class"
}

variable "aliases" {
  type        = list(string)
  description = "Alternate domain names"
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for CloudFront"
}
