terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.70"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

locals {
  name              = var.name_prefix
  has_domain        = var.domain_name != ""
  use_external_cert = var.use_external_cert
  origin_id         = "${var.name_prefix}-alb-origin"
  aliases           = local.has_domain ? concat([var.domain_name], var.subject_alternative_names) : []
  metric_name       = replace("${var.name_prefix}-acl", "-", "")
  # Resolved cert ARN: external takes priority; otherwise internal-created cert when domain set; otherwise empty (default cloudfront cert).
  effective_acm_arn = local.use_external_cert ? var.external_acm_certificate_arn : (local.has_domain ? aws_acm_certificate.this[0].arn : "")

  # AWS-managed cache policy IDs (region-independent constants).
  cache_policy_caching_disabled    = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  cache_policy_caching_optimized   = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  origin_request_policy_all_viewer = "216adef6-5c7f-47e4-b989-5492eafa07d3" # Managed-AllViewer

  # Managed rule groups in priority order.
  managed_rules = [
    { priority = 1, name = "AWSManagedRulesAmazonIpReputationList", metric = "AWSManagedRulesAmazonIpReputationList" },
    { priority = 2, name = "AWSManagedRulesKnownBadInputsRuleSet", metric = "AWSManagedRulesKnownBadInputsRuleSet" },
    { priority = 3, name = "AWSManagedRulesCommonRuleSet", metric = "AWSManagedRulesCommonRuleSet" },
  ]
}

# ---------------------------------------------------------------------------
# ACM certificate (us-east-1, required for CloudFront)
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "this" {
  # Skip when caller provides external_acm_certificate_arn — caller owns cert + validation.
  count    = local.has_domain && !local.use_external_cert ? 1 : 0
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${local.name}-cf-cert"
  }
}

# ---------------------------------------------------------------------------
# WAFv2 Web ACL — scope = CLOUDFRONT (must live in us-east-1)
# ---------------------------------------------------------------------------

resource "aws_wafv2_web_acl" "this" {
  provider = aws.us_east_1

  name        = "${local.name}-acl"
  description = "WAF for ${local.name} CloudFront distribution"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Managed rule groups
  dynamic "rule" {
    for_each = local.managed_rules
    content {
      name     = rule.value.name
      priority = rule.value.priority

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          name        = rule.value.name
          vendor_name = "AWS"
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.value.metric
        sampled_requests_enabled   = true
      }
    }
  }

  # Rate limit per IP — block when 2000 req / 5min exceeded
  rule {
    name     = "RateLimitPerIp"
    priority = 10

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit_per_5min
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitPerIp"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = local.metric_name
    sampled_requests_enabled   = true
  }

  tags = {
    Name = "${local.name}-acl"
  }
}

# ---------------------------------------------------------------------------
# CloudFront distribution
# ---------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = var.comment
  price_class     = var.price_class
  web_acl_id      = aws_wafv2_web_acl.this.arn
  aliases         = local.aliases
  http_version    = "http2and3"

  origin {
    domain_name = var.alb_dns_name
    origin_id   = local.origin_id

    custom_origin_config {
      http_port  = 80
      https_port = 443
      # When the caller provides no ACM cert (dev without a domain), the ALB
      # has no HTTPS listener — fall back to http-only origin so CF can still
      # reach it. Once a domain + cert lands, we switch to https-only.
      origin_protocol_policy   = local.has_domain ? "https-only" : "http-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_keepalive_timeout = 5
      origin_read_timeout      = 30
    }
  }

  # Default behaviour — dynamic, no caching
  default_cache_behavior {
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id          = local.cache_policy_caching_disabled
    origin_request_policy_id = local.origin_request_policy_all_viewer
  }

  # Static Next.js assets — long-lived, immutable
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id = local.cache_policy_caching_optimized
  }

  # API — never cache, forward everything
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false

    cache_policy_id          = local.cache_policy_caching_disabled
    origin_request_policy_id = local.origin_request_policy_all_viewer
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.has_domain ? false : true
    acm_certificate_arn            = local.has_domain ? local.effective_acm_arn : null
    ssl_support_method             = local.has_domain ? "sni-only" : null
    minimum_protocol_version       = local.has_domain ? var.minimum_protocol_version : "TLSv1"
  }

  tags = {
    Name = "${local.name}-cf"
  }
}
