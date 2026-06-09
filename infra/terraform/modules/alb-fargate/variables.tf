variable "name_prefix" {
  description = "Name prefix applied to the ALB and target group resources."
  type        = string

  validation {
    condition     = length(var.name_prefix) > 0
    error_message = "name_prefix must not be empty."
  }
}

variable "vpc_id" {
  description = "VPC ID where the ALB and target groups live."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the internet-facing ALB (>= 2 AZs)."
  type        = list(string)

  validation {
    condition     = length(var.public_subnet_ids) >= 2
    error_message = "ALB requires at least 2 public subnets in different AZs."
  }
}

variable "security_group_ids" {
  description = "Security groups attached to the ALB (typically sg_alb from VPC module)."
  type        = list(string)

  validation {
    condition     = length(var.security_group_ids) > 0
    error_message = "At least one security group is required."
  }
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate (us-east-1) attached to the HTTPS listener. May be a known-after-apply value (e.g. from aws_acm_certificate_validation). Empty when var.enable_https = false."
  type        = string
  default     = ""
}

variable "enable_https" {
  description = "When true, attach an HTTPS :443 listener using var.acm_certificate_arn. STATIC (must be plan-time known) so it can drive listener count. Set to false in dev without a domain — :80 then forwards directly to the frontend target group."
  type        = bool
  default     = false
}

variable "frontend_port" {
  description = "Container port for the frontend service."
  type        = number
  default     = 3000
}

variable "backend_port" {
  description = "Container port for the backend service."
  type        = number
  default     = 3001
}

variable "frontend_health_check_path" {
  description = "HTTP health check path for the frontend target group."
  type        = string
  default     = "/"
}

variable "backend_health_check_path" {
  description = "HTTP health check path for the backend target group."
  type        = string
  default     = "/api/health"
}

variable "ssl_policy" {
  description = "TLS security policy for the HTTPS listener."
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}

variable "access_logs_bucket" {
  description = "S3 bucket name for ALB access logs. If empty, access logs stay disabled."
  type        = string
  default     = ""
}

variable "access_logs_prefix" {
  description = "Prefix within the access-logs bucket."
  type        = string
  default     = "alb"
}

variable "idle_timeout" {
  description = "ALB idle timeout in seconds."
  type        = number
  default     = 60
}
