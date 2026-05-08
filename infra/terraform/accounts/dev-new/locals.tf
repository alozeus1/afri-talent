locals {
  # When domain_name is non-empty, we create a Route 53 zone (optional) and an
  # ACM cert for both ALB HTTPS and CloudFront. When empty, both ALB HTTPS and
  # CloudFront aliases are skipped (CloudFront falls back to *.cloudfront.net).
  has_domain = trimspace(var.domain_name) != ""

  # Common labels — provider default_tags handles Project/Environment/etc.
  # Modules accept a `tags` map for per-resource overrides; we keep it empty
  # so default_tags is the single source of truth.
  module_tags = {}

  # Base ARN prefix for SSM SecureString parameters under this stack's prefix
  # (e.g. arn:aws:ssm:us-east-1:108188564905:parameter/afritalent/dev). Used to
  # build per-key ARNs in the ECS / Lambda secret maps.
  ssm_arn_base = "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/${var.ssm_path_prefix}"
}
