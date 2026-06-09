variable "name_prefix" {
  description = "Name prefix applied to all VPC resources (e.g. afritalent-dev)."
  type        = string

  validation {
    condition     = length(var.name_prefix) > 0 && length(var.name_prefix) <= 40
    error_message = "name_prefix must be 1-40 characters."
  }
}

variable "vpc_cidr" {
  description = "Primary IPv4 CIDR block for the VPC. Must be a /16 to /20."
  type        = string
  default     = "10.30.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr))
    error_message = "vpc_cidr must be a valid IPv4 CIDR block."
  }
}

variable "azs" {
  description = "Availability zones to deploy subnets into. Exactly 3 required."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]

  validation {
    condition     = length(var.azs) == 3
    error_message = "Exactly 3 availability zones are required."
  }
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for the 3 public subnets (one per AZ). Each /24."
  type        = list(string)
  default     = ["10.30.0.0/24", "10.30.1.0/24", "10.30.2.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) == 3
    error_message = "Exactly 3 public subnet CIDRs required."
  }
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for the 3 private (NAT-routed) subnets."
  type        = list(string)
  default     = ["10.30.10.0/24", "10.30.11.0/24", "10.30.12.0/24"]

  validation {
    condition     = length(var.private_subnet_cidrs) == 3
    error_message = "Exactly 3 private subnet CIDRs required."
  }
}

variable "isolated_subnet_cidrs" {
  description = "CIDR blocks for the 3 isolated (DB-only, no internet) subnets."
  type        = list(string)
  default     = ["10.30.20.0/24", "10.30.21.0/24", "10.30.22.0/24"]

  validation {
    condition     = length(var.isolated_subnet_cidrs) == 3
    error_message = "Exactly 3 isolated subnet CIDRs required."
  }
}

variable "container_ports" {
  description = "Container ports allowed from the ALB SG into the ECS tasks SG."
  type        = list(number)
  default     = [3000, 3001]

  validation {
    condition     = length(var.container_ports) > 0
    error_message = "At least one container port must be specified."
  }
}

variable "aws_region" {
  description = "AWS region used to construct VPC endpoint service names."
  type        = string
  default     = "us-east-1"
}

variable "interface_endpoints" {
  description = "Interface VPC endpoint service suffixes to create. Empty list disables paid PrivateLink endpoints; private subnets still use the NAT route."
  type        = list(string)
  default = [
    "ecr.api",
    "ecr.dkr",
    "logs",
    "ssm",
    "ssmmessages",
    "ec2messages",
    "secretsmanager",
    "sts",
    "kms",
    "sqs",
    "states",
    "events",
  ]

  validation {
    condition     = length(distinct(var.interface_endpoints)) == length(var.interface_endpoints)
    error_message = "interface_endpoints must not contain duplicates."
  }
}
