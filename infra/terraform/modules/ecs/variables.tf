variable "name_prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "aws_region" {
  type        = string
  description = "AWS region"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs"
}

variable "ecs_sg_id" {
  type        = string
  description = "ECS security group ID"
}

variable "frontend_image" {
  type        = string
  description = "Frontend image URI"
}

variable "backend_image" {
  type        = string
  description = "Backend image URI"
}

variable "frontend_container_port" {
  type        = number
  description = "Frontend container port"
}

variable "backend_container_port" {
  type        = number
  description = "Backend container port"
}

variable "frontend_container_cpu" {
  type        = number
  description = "Frontend CPU units"
}

variable "frontend_container_memory" {
  type        = number
  description = "Frontend memory"
}

variable "backend_container_cpu" {
  type        = number
  description = "Backend CPU units"
}

variable "backend_container_memory" {
  type        = number
  description = "Backend memory"
}

variable "frontend_desired_count" {
  type        = number
  description = "Frontend desired count"
}

variable "backend_desired_count" {
  type        = number
  description = "Backend desired count"
}

variable "frontend_min_capacity" {
  type        = number
  description = "Frontend min capacity"
}

variable "frontend_max_capacity" {
  type        = number
  description = "Frontend max capacity"
}

variable "backend_min_capacity" {
  type        = number
  description = "Backend min capacity"
}

variable "backend_max_capacity" {
  type        = number
  description = "Backend max capacity"
}

variable "cpu_target_utilization" {
  type        = number
  description = "CPU target utilization"
}

variable "memory_target_utilization" {
  type        = number
  description = "Memory target utilization"
}

variable "log_retention_in_days" {
  type        = number
  description = "Log retention days"
}

variable "enable_container_insights" {
  type        = bool
  description = "Enable ECS container insights"
}

variable "frontend_health_check_path" {
  type        = string
  description = "Frontend health check path"
}

variable "backend_health_check_path" {
  type        = string
  description = "Backend health check path"
}

variable "frontend_target_group_arn" {
  type        = string
  description = "Frontend target group ARN"
}

variable "backend_target_group_arn" {
  type        = string
  description = "Backend target group ARN"
}

variable "secret_arn" {
  type        = string
  description = "Secrets Manager ARN"
}

variable "frontend_url" {
  type        = string
  description = "Frontend URL used by backend"
}

variable "ecs_task_execution_role_arn" {
  type        = string
  description = "ECS task execution role ARN"
}

variable "ecs_task_role_arn" {
  type        = string
  description = "ECS task role ARN"
}
