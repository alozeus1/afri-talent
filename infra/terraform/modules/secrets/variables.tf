variable "name_prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "db_username" {
  type        = string
  description = "Database username"
}

variable "db_password" {
  type        = string
  description = "Database password"
  sensitive   = true
}

variable "db_endpoint" {
  type        = string
  description = "Database endpoint"
}

variable "db_port" {
  type        = number
  description = "Database port"
}

variable "db_name" {
  type        = string
  description = "Database name"
}

variable "jwt_secret" {
  type        = string
  description = "JWT secret"
  sensitive   = true
}
