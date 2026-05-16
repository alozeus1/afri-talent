# ─────────────────────────────────────────────────────────────────────────────
# DNS + ACM
#
# Three modes based on var.domain_name + var.create_route53_zone:
#
# 1. var.domain_name == ""           → no-op. ALB stays HTTP, CloudFront uses default cert.
# 2. domain set + create zone = true → create zone in this account.
# 3. domain set + create zone = false → use existing zone via data lookup. (current path for afri-talent.com)
#
# In modes 2 + 3 we issue an ACM cert (us-east-1) used by both CloudFront and
# the ALB HTTPS listener, validate via DNS records in the zone, and create
# apex + www aliases pointing at the CloudFront distribution.
# ─────────────────────────────────────────────────────────────────────────────

# Mode 2: create the zone here
resource "aws_route53_zone" "primary" {
  count = local.has_domain && var.create_route53_zone ? 1 : 0

  name          = var.domain_name
  comment       = "Primary hosted zone for ${var.domain_name} (${var.environment})"
  force_destroy = false
}

# Mode 3: look up existing zone
data "aws_route53_zone" "primary" {
  count        = local.has_domain && !var.create_route53_zone ? 1 : 0
  name         = var.domain_name
  private_zone = false
}

locals {
  effective_zone_id = (
    local.has_domain && var.create_route53_zone
    ? aws_route53_zone.primary[0].zone_id
    : (local.has_domain ? data.aws_route53_zone.primary[0].zone_id : "")
  )
  effective_zone_name_servers = (
    local.has_domain && var.create_route53_zone
    ? aws_route53_zone.primary[0].name_servers
    : (local.has_domain ? data.aws_route53_zone.primary[0].name_servers : [])
  )
}

# ── ACM certificate (us-east-1, used by both CloudFront and ALB) ─────────────
resource "aws_acm_certificate" "primary" {
  count    = local.has_domain ? 1 : 0
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = local.has_domain ? {
    for o in aws_acm_certificate.primary[0].domain_validation_options : o.domain_name => {
      name   = o.resource_record_name
      type   = o.resource_record_type
      record = o.resource_record_value
    }
  } : {}

  zone_id         = local.effective_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "primary" {
  count    = local.has_domain ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.primary[0].arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# ── Apex + www aliases pointing at CloudFront ────────────────────────────────
resource "aws_route53_record" "apex" {
  count = local.has_domain ? 1 : 0

  zone_id = local.effective_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = module.cloudfront_waf.cloudfront_domain_name
    zone_id                = module.cloudfront_waf.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  count = local.has_domain ? 1 : 0

  zone_id = local.effective_zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.cloudfront_waf.cloudfront_domain_name
    zone_id                = module.cloudfront_waf.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

# ── Wave 9 §10.2 — status.afri-talent.com (status page) ──────────────────────
# Founder picks instatus.com or statuspage.io and creates the account; that
# provider gives a CNAME target like `<your-page>.instatus.com` or
# `<your-page>.statuspage.io`. Set var.status_page_cname to that value and
# this CNAME record activates. While the variable is empty the slot is a
# no-op — no DNS resource exists, no validation noise.
#
# Full setup procedure: docs/runbooks/status-page-setup.md.
resource "aws_route53_record" "status_page" {
  count = local.has_domain && var.status_page_cname != "" ? 1 : 0

  zone_id = local.effective_zone_id
  name    = "status.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = [var.status_page_cname]
}

# ── Helpers exposed via locals ───────────────────────────────────────────────
locals {
  acm_certificate_arn  = local.has_domain ? aws_acm_certificate_validation.primary[0].certificate_arn : ""
  route53_zone_id      = local.effective_zone_id
  route53_name_servers = local.effective_zone_name_servers
}
