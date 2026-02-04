locals {
  name_prefix         = "${var.project_name}-${var.environment}"
  protocol            = var.acm_certificate_arn == "" ? "http" : "https"
  github_role_name    = var.github_actions_role_name != "" ? var.github_actions_role_name : "${local.name_prefix}-github-actions"
  github_oidc_subject = "repo:${var.github_repo}:ref:${var.github_ref}"
  cloudfront_domain   = length(var.cloudfront_aliases) > 0 ? var.cloudfront_aliases[0] : module.cloudfront.domain_name
  frontend_url        = "https://${local.cloudfront_domain}"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
