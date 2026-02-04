output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.alb.alb_dns_name
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain"
  value       = module.cloudfront.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.cloudfront.distribution_id
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
  value       = module.ecr.frontend_repo_url
}

output "backend_ecr_repository" {
  description = "Backend ECR repository URL"
  value       = module.ecr.backend_repo_url
}

output "database_endpoint" {
  description = "RDS endpoint"
  value       = module.rds.db_endpoint
}

output "app_secrets_arn" {
  description = "Secrets Manager ARN for app config"
  value       = module.secrets.secret_arn
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC"
  value       = module.github_oidc.role_arn
}

output "github_oidc_provider_arn" {
  description = "GitHub OIDC provider ARN"
  value       = module.github_oidc.provider_arn
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
