variable "name_prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "az_count" {
  type        = number
  description = "Number of availability zones to use"
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR block"
}

variable "public_subnet_cidrs" {
  type        = list(string)
  description = "Public subnet CIDR blocks"
}

variable "private_subnet_cidrs" {
  type        = list(string)
  description = "Private subnet CIDR blocks"
}

variable "enable_nat_gateway" {
  type        = bool
  description = "Enable NAT gateway for private subnets"
}

variable "enable_interface_endpoints" {
  type        = bool
  description = "Create VPC interface/gateway endpoints for AWS APIs (ECR, Secrets Manager, S3)"
  default     = true
}
