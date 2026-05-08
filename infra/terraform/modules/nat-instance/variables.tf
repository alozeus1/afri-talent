variable "name_prefix" {
  description = "Name prefix applied to all NAT instance resources."
  type        = string

  validation {
    condition     = length(var.name_prefix) > 0
    error_message = "name_prefix must not be empty."
  }
}

variable "vpc_id" {
  description = "ID of the VPC the NAT instance lives in."
  type        = string
}

variable "public_subnet_id" {
  description = "Public subnet ID where the NAT instance is launched (single instance, no HA — test phase)."
  type        = string
}

variable "private_route_table_ids" {
  description = "Private route table IDs that should default-route 0.0.0.0/0 through the NAT instance."
  type        = list(string)

  validation {
    condition     = length(var.private_route_table_ids) > 0
    error_message = "At least one private route table is required."
  }
}

variable "security_group_ids" {
  description = "Security groups attached to the NAT instance ENI (typically sg_nat from the VPC module)."
  type        = list(string)

  validation {
    condition     = length(var.security_group_ids) > 0
    error_message = "At least one security group is required."
  }
}

variable "instance_type" {
  description = "Instance type for the NAT instance. Defaults to t4g.nano (Graviton, ~$3/mo)."
  type        = string
  default     = "t4g.nano"
}
