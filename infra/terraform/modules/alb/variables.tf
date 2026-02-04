variable "name_prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnet IDs"
}

variable "alb_sg_id" {
  type        = string
  description = "ALB security group ID"
}

variable "frontend_port" {
  type        = number
  description = "Frontend container port"
}

variable "backend_port" {
  type        = number
  description = "Backend container port"
}

variable "frontend_health_check_path" {
  type        = string
  description = "Frontend health check path"
}

variable "backend_health_check_path" {
  type        = string
  description = "Backend health check path"
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for HTTPS"
}

variable "api_domain_name" {
  type        = string
  description = "API DNS name"
}
