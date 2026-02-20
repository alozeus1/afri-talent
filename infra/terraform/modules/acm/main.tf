# ─────────────────────────────────────────────────────────────────────────────
# ACM Certificate Module - SSL/TLS certificates with DNS validation
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_acm_certificate" "main" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.name_prefix}-cert"
    Environment = var.environment
  }
}

# Route53 DNS validation records
resource "aws_route53_record" "validation" {
  for_each = var.create_route53_records ? {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  } : {}

  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

# Wait for certificate validation
resource "aws_acm_certificate_validation" "main" {
  count = var.create_route53_records ? 1 : 0

  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.validation : record.fqdn]
}
