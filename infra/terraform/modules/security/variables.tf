variable "name_prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "frontend_port" {
  type        = number
  description = "Frontend container port"
}

variable "backend_port" {
  type        = number
  description = "Backend container port"
}
