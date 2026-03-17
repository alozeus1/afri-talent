locals {
  name_prefix = "${var.project_name}-${var.environment}"
  protocol    = var.acm_certificate_arn == "" ? "http" : "https"

  configured_frontend_url = var.frontend_domain_name != "" ? "https://${var.frontend_domain_name}" : ""
  configured_backend_url  = var.api_domain_name != "" ? "https://${var.api_domain_name}" : ""
  frontend_url = var.frontend_public_url_override != "" ? var.frontend_public_url_override : (
    local.configured_frontend_url != "" ? local.configured_frontend_url : "http://localhost:3000"
  )
  backend_public_url = var.use_custom_domain_urls ? local.configured_backend_url : ""

  github_role_name      = var.github_actions_role_name != "" ? var.github_actions_role_name : "${local.name_prefix}-github-actions"
  github_ref_normalized = startswith(var.github_ref, "refs/") ? var.github_ref : "refs/heads/${var.github_ref}"

  github_oidc_subject = "repo:${var.github_repo}:ref:${local.github_ref_normalized}"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Owner       = "alozeus1"
    CostCenter  = "AfriTalent"
    ManagedBy   = "Terraform"
    Application = var.project_name
  }
}
