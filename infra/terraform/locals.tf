locals {
  name_prefix = "${var.project_name}-${var.environment}"
  protocol    = var.acm_certificate_arn == "" ? "http" : "https"
  github_role_name = var.github_actions_role_name != "" ? var.github_actions_role_name : "${local.name_prefix}-github-actions"
  github_oidc_subject = "repo:${var.github_repo}:ref:${var.github_ref}"
  frontend_url = "https://${aws_cloudfront_distribution.app.domain_name}"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
