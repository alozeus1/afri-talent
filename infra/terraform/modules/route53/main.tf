locals {
  create_admin = var.admin_domain_name != ""
  create_api   = var.api_domain_name != ""
}

resource "aws_route53_record" "frontend_a" {
  zone_id = var.zone_id
  name    = var.frontend_domain_name
  type    = "A"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "frontend_aaaa" {
  zone_id = var.zone_id
  name    = var.frontend_domain_name
  type    = "AAAA"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "admin_a" {
  count  = local.create_admin ? 1 : 0
  zone_id = var.zone_id
  name    = var.admin_domain_name
  type    = "A"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "admin_aaaa" {
  count  = local.create_admin ? 1 : 0
  zone_id = var.zone_id
  name    = var.admin_domain_name
  type    = "AAAA"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api_a" {
  count  = local.create_api ? 1 : 0
  zone_id = var.zone_id
  name    = var.api_domain_name
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "api_aaaa" {
  count  = local.create_api ? 1 : 0
  zone_id = var.zone_id
  name    = var.api_domain_name
  type    = "AAAA"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}
