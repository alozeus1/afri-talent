variable "name_prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs"
}

variable "rds_sg_id" {
  type        = string
  description = "RDS security group ID"
}

variable "db_name" {
  type        = string
  description = "Database name"
}

variable "db_username" {
  type        = string
  description = "Database master username"
}

variable "db_password" {
  type        = string
  description = "Database master password"
  sensitive   = true
}

variable "db_engine_version" {
  type        = string
  description = "Postgres engine version"
}

variable "db_instance_class" {
  type        = string
  description = "RDS instance class"
}

variable "db_allocated_storage" {
  type        = number
  description = "Allocated storage in GB"
}

variable "db_multi_az" {
  type        = bool
  description = "Enable Multi-AZ"
}

variable "db_backup_retention_days" {
  type        = number
  description = "Backup retention period"
}

variable "db_deletion_protection" {
  type        = bool
  description = "Enable deletion protection"
}

variable "db_skip_final_snapshot" {
  type        = bool
  description = "Skip final snapshot on delete"
}
