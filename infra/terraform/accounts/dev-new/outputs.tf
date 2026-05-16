# ── User-facing endpoints ─────────────────────────────────────────────────────

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain (e.g. d12345.cloudfront.net). Public entry point for the app."
  value       = module.cloudfront_waf.cloudfront_domain_name
}

output "alb_dns_name" {
  description = "Internal ALB DNS name. Use for direct testing before DNS cutover."
  value       = module.alb_fargate.alb_dns_name
}

output "primary_url" {
  description = "Resolved primary URL — custom domain if configured, otherwise CloudFront default domain."
  value       = local.has_domain ? "https://${var.domain_name}" : "https://${module.cloudfront_waf.cloudfront_domain_name}"
}

# ── DNS ──────────────────────────────────────────────────────────────────────

output "route53_zone_id" {
  description = "Route 53 hosted zone ID for var.domain_name (empty if not created)."
  value       = local.route53_zone_id
}

output "route53_name_servers" {
  description = "Name servers to set at the domain registrar to delegate DNS to this zone."
  value       = local.route53_name_servers
}

output "acm_certificate_arn" {
  description = "ACM certificate ARN used by both CloudFront and the ALB HTTPS listener."
  value       = local.acm_certificate_arn
}

# ── Webhook URLs (config back into Stripe / Flutterwave dashboards) ──────────

output "webhook_stripe_url" {
  description = "Lambda Function URL for Stripe webhooks. Configure this in the Stripe dashboard as the webhook endpoint."
  value       = module.lambda_functions.lambda_webhook_stripe_url
}

output "webhook_flutterwave_url" {
  description = "Lambda Function URL for Flutterwave webhooks. Configure this in the Flutterwave dashboard."
  value       = module.lambda_functions.lambda_webhook_flutterwave_url
}

# ── Data plane ───────────────────────────────────────────────────────────────

output "aurora_cluster_endpoint" {
  description = "Aurora writer endpoint. Apps should connect via the proxy below, not this directly."
  value       = module.aurora.aurora_cluster_endpoint
}

output "rds_proxy_endpoint" {
  description = "RDS Proxy endpoint. Use this in DATABASE_URL."
  value       = module.rds_proxy.rds_proxy_endpoint
}

output "aurora_master_user_secret_arn" {
  description = "Secrets Manager ARN holding auto-rotated Aurora master credentials. The inject-secrets.sh script reads this when computing DATABASE_URL."
  value       = module.aurora.aurora_master_user_secret_arn
  sensitive   = true
}

# ── Compute plane ────────────────────────────────────────────────────────────

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = module.ecs_fargate.ecs_cluster_name
}

output "ecr_repo_url_frontend" {
  description = "Frontend ECR repository URL (push images here)."
  value       = module.ecr.ecr_repo_url_frontend
}

output "ecr_repo_url_backend" {
  description = "Backend ECR repository URL (push images here)."
  value       = module.ecr.ecr_repo_url_backend
}

output "state_machine_orchestrator_arn" {
  description = "Step Functions state machine ARN — invoke for orchestrator runs."
  value       = module.lambda_functions.state_machine_orchestrator_arn
}

# ── Blog automation (Wave 6 §7.3 γ1) ─────────────────────────────────────────

output "blog_automation_lambda_name" {
  description = "Name of the blog-automation Lambda."
  value       = module.lambda_functions.lambda_blog_automation_name
}

output "blog_automation_lambda_arn" {
  description = "ARN of the blog-automation Lambda."
  value       = module.lambda_functions.lambda_blog_automation_arn
}

output "blog_automation_schedule_rule_arn" {
  description = "ARN of the EventBridge weekly schedule rule that triggers the blog-automation Lambda."
  value       = module.lambda_functions.blog_automation_schedule_rule_arn
}

# ── CI/IAM ───────────────────────────────────────────────────────────────────

output "github_oidc_role_arn" {
  description = "GitHub Actions OIDC deploy role ARN. Set as the value of the AWS_DEPLOY_ROLE_ARN GitHub variable in the repo, or expose via vars.OIDC_ROLE_NAME if using just the name."
  value       = module.iam_oidc_github.oidc_role_arn
}

output "github_oidc_role_name" {
  description = "GitHub Actions OIDC deploy role NAME (used by deploy.yml as vars.OIDC_ROLE_NAME)."
  value       = module.iam_oidc_github.oidc_role_name
}

# ── Observability ────────────────────────────────────────────────────────────

output "dashboard_url" {
  description = "CloudWatch dashboard URL for stack-wide visibility."
  value       = module.observability.dashboard_url
}

output "ssm_path_prefix" {
  description = "SSM parameter path prefix used by every secret (no leading/trailing slash)."
  value       = module.ssm_params.ssm_parameter_path_prefix
}

# ── Trust artefact bucket (Wave 1 §2.11) ─────────────────────────────────────
# WAVE_1_TRUST_BUCKET_OUTPUTS — uncomment alongside the module block in main.tf.
#
# output "trust_bucket_name" {
#   description = "Name of the separate trust artefact bucket. Set as SSM TRUST_S3_BUCKET."
#   value       = module.s3_trust.bucket_name
# }
#
# output "trust_bucket_iam_policy_arn" {
#   description = "IAM policy ARN to attach to the ECS task role so backend tasks can write trust artefacts."
#   value       = module.s3_trust.iam_policy_arn
# }

# ── ElastiCache Redis (Wave 1 §2.4) ──────────────────────────────────────────
# WAVE_1_REDIS_OUTPUTS — uncomment alongside the module block in main.tf.
#
# output "redis_primary_endpoint" {
#   description = "Primary endpoint hostname. Use to compose rediss:// REDIS_URL for SSM."
#   value       = module.elasticache_redis.primary_endpoint_address
# }
#
# output "redis_auth_secret_name" {
#   description = "Secrets Manager name holding the Redis AUTH token. Read with aws secretsmanager get-secret-value."
#   value       = module.elasticache_redis.auth_secret_name
# }
