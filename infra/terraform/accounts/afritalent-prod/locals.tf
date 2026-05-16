locals {
  # When domain_name is non-empty, we create a Route 53 zone (optional) and an
  # ACM cert for both ALB HTTPS and CloudFront. When empty, both ALB HTTPS and
  # CloudFront aliases are skipped (CloudFront falls back to *.cloudfront.net).
  has_domain = trimspace(var.domain_name) != ""

  # Common labels — provider default_tags handles Project/Environment/etc.
  module_tags = {}

  # Base ARN prefix for SSM SecureString parameters under this stack's prefix
  # (e.g. arn:aws:ssm:us-east-1:<prod-acct>:parameter/afritalent/prod).
  ssm_arn_base = "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/${var.ssm_path_prefix}"

  # Wave 8 §9.2.5 drift #5 — derive S3 CORS origins from the live CloudFront
  # output instead of hardcoding the distribution domain.
  app_allowed_origins = compact([
    "https://${module.cloudfront_waf.cloudfront_domain_name}",
    local.has_domain ? "https://${var.domain_name}" : "",
    local.has_domain ? "https://www.${var.domain_name}" : "",
  ])

  # Backend FRONTEND_URL — derives from var.domain_name when set, falls back to
  # CloudFront default domain pre-cutover. Avoids hardcoding the apex URL into
  # env vars (which would break under dual-stack + during the DNS cutover when
  # the apex resolves to the new stack but old workloads still need to address
  # the new stack's CloudFront-via-direct-URL).
  frontend_url = local.has_domain ? "https://${var.domain_name}" : "https://${module.cloudfront_waf.cloudfront_domain_name}"
}
