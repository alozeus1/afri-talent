variable "name_prefix" {
  type        = string
  description = "Prefix for resource names"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for VPC connector"
}

variable "security_group_id" {
  type        = string
  description = "Security group ID for App Runner services"
}

variable "secret_arn" {
  type        = string
  description = "Secrets Manager secret ARN"
}

variable "secret_arns" {
  type        = list(string)
  description = "List of Secrets Manager ARNs for IAM policy"
}

variable "s3_bucket_arns" {
  type        = list(string)
  description = "S3 bucket ARNs for IAM policy"
  default     = []
}

# Backend configuration
variable "backend_image" {
  type        = string
  description = "Backend ECR image URI"
}

variable "backend_port" {
  type        = number
  description = "Backend container port"
  default     = 4000
}

variable "backend_cpu" {
  type        = string
  description = "Backend CPU units (256, 512, 1024, 2048, 4096)"
  default     = "256"
}

variable "backend_memory" {
  type        = string
  description = "Backend memory (512, 1024, 2048, 3072, 4096, 6144, 8192, 10240, 12288)"
  default     = "512"
}

variable "backend_min_size" {
  type        = number
  description = "Minimum number of backend instances"
  default     = 1
}

variable "backend_max_size" {
  type        = number
  description = "Maximum number of backend instances"
  default     = 3
}

variable "backend_max_concurrency" {
  type        = number
  description = "Maximum concurrent requests per instance"
  default     = 100
}

variable "backend_health_path" {
  type        = string
  description = "Backend health check path"
  default     = "/health"
}

variable "backend_url" {
  type        = string
  description = "Public URL for backend API"
}

# Frontend configuration
variable "frontend_image" {
  type        = string
  description = "Frontend ECR image URI"
}

variable "frontend_port" {
  type        = number
  description = "Frontend container port"
  default     = 3000
}

variable "frontend_cpu" {
  type        = string
  description = "Frontend CPU units"
  default     = "256"
}

variable "frontend_memory" {
  type        = string
  description = "Frontend memory"
  default     = "512"
}

variable "frontend_min_size" {
  type        = number
  description = "Minimum number of frontend instances"
  default     = 1
}

variable "frontend_max_size" {
  type        = number
  description = "Maximum number of frontend instances"
  default     = 3
}

variable "frontend_max_concurrency" {
  type        = number
  description = "Maximum concurrent requests per instance"
  default     = 100
}

variable "frontend_health_path" {
  type        = string
  description = "Frontend health check path"
  default     = "/"
}

variable "frontend_url" {
  type        = string
  description = "Public URL for frontend"
}

# Custom domains (optional)
variable "api_domain_name" {
  type        = string
  description = "Custom domain for API"
  default     = ""
}

variable "frontend_domain_name" {
  type        = string
  description = "Custom domain for frontend"
  default     = ""
}
