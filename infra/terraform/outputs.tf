output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.app.dns_name
}

output "frontend_url" {
  description = "Frontend base URL"
  value       = "${local.protocol}://${aws_lb.app.dns_name}"
}

output "backend_url" {
  description = "Backend base URL"
  value       = "${local.protocol}://${aws_lb.app.dns_name}/api"
}

output "frontend_ecr_repository" {
  description = "Frontend ECR repository URL"
  value       = aws_ecr_repository.frontend.repository_url
}

output "backend_ecr_repository" {
  description = "Backend ECR repository URL"
  value       = aws_ecr_repository.backend.repository_url
}

output "database_endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.postgres.address
}

output "app_secrets_arn" {
  description = "Secrets Manager ARN for app config"
  value       = aws_secretsmanager_secret.app.arn
}

