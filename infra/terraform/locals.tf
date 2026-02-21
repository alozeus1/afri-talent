locals {
  name_prefix = "${var.project_name}-${var.environment}"
  protocol    = var.acm_certificate_arn == "" ? "http" : "https"

  github_role_name     = var.github_actions_role_name != "" ? var.github_actions_role_name : "${local.name_prefix}-github-actions"
  github_ref_normalized = startswith(var.github_ref, "refs/") ? var.github_ref : "refs/heads/${var.github_ref}"

  github_oidc_subject = "repo:${var.github_repo}:ref:${local.github_ref_normalized}"

  # For App Runner, we'll use the service URL or custom domain if configured
  frontend_url = var.frontend_domain_name != "" ? "https://${var.frontend_domain_name}" : "https://app-runner-frontend.amazonaws.com"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Owner       = "alozeus1"
    CostCenter  = "AfriTalent"
    ManagedBy   = "Terraform"
  }
}
