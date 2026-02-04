output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.app.dns_name
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain"
  value       = aws_cloudfront_distribution.app.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.app.id
}

output "frontend_url" {
  description = "Frontend base URL"
  value       = local.frontend_url
}

output "backend_url" {
  description = "Backend base URL"
  value       = "${local.frontend_url}/api"
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

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC"
  value       = aws_iam_role.github_actions.arn
}

output "github_oidc_provider_arn" {
  description = "GitHub OIDC provider ARN"
  value       = aws_iam_openid_connect_provider.github.arn
}

output "frontend_dns_record" {
  description = "Frontend Route53 record (if enabled)"
  value       = var.enable_route53 ? module.route53[0].frontend_fqdn : ""
}

output "admin_dns_record" {
  description = "Admin Route53 record (if enabled)"
  value       = var.enable_route53 ? module.route53[0].admin_fqdn : ""
}

output "api_dns_record" {
  description = "API Route53 record (if enabled)"
  value       = var.enable_route53 ? module.route53[0].api_fqdn : ""
}
