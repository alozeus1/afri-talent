output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN."
  value       = aws_ecs_cluster.this.arn
}

output "ecs_service_frontend_name" {
  description = "Frontend ECS service name."
  value       = aws_ecs_service.frontend.name
}

output "ecs_service_backend_name" {
  description = "Backend ECS service name."
  value       = aws_ecs_service.backend.name
}

output "ecs_service_frontend_arn" {
  description = "Frontend ECS service ARN."
  value       = aws_ecs_service.frontend.id
}

output "ecs_service_backend_arn" {
  description = "Backend ECS service ARN."
  value       = aws_ecs_service.backend.id
}

output "task_execution_role_arn" {
  description = "ECS task execution role ARN (image pull, secret read, logs)."
  value       = aws_iam_role.task_execution.arn
}

output "task_role_arn" {
  description = "ECS task role ARN (runtime permissions)."
  value       = aws_iam_role.task.arn
}

output "frontend_task_definition_family" {
  description = "Frontend task definition family — used by CI to register new revisions."
  value       = aws_ecs_task_definition.frontend.family
}

output "backend_task_definition_family" {
  description = "Backend task definition family — used by CI to register new revisions."
  value       = aws_ecs_task_definition.backend.family
}

output "frontend_log_group_name" {
  description = "CloudWatch log group for the frontend service."
  value       = aws_cloudwatch_log_group.frontend.name
}

output "backend_log_group_name" {
  description = "CloudWatch log group for the backend service."
  value       = aws_cloudwatch_log_group.backend.name
}
