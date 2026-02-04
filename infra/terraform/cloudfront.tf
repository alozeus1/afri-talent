resource "aws_cloudfront_cache_policy" "disabled" {
  name        = "${local.name_prefix}-cache-disabled"
  comment     = "Disable caching for dynamic content"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "all"
    }

    headers_config {
      header_behavior = "allViewer"
    }

    query_strings_config {
      query_string_behavior = "all"
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

resource "aws_cloudfront_origin_request_policy" "all_viewer" {
  name    = "${local.name_prefix}-all-viewer"
  comment = "Forward all headers, cookies, and query strings"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "allViewer"
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

resource "aws_cloudfront_distribution" "app" {
  enabled         = true
  is_ipv6_enabled = true
  price_class     = var.cloudfront_price_class
  aliases         = var.cloudfront_aliases
  default_root_object = ""

  origin {
    domain_name = aws_lb.app.dns_name
    origin_id   = "alb-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.all_viewer.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.cloudfront_acm_certificate_arn == ""
    acm_certificate_arn            = var.cloudfront_acm_certificate_arn == "" ? null : var.cloudfront_acm_certificate_arn
    ssl_support_method             = var.cloudfront_acm_certificate_arn == "" ? null : "sni-only"
    minimum_protocol_version       = var.cloudfront_acm_certificate_arn == "" ? null : "TLSv1.2_2021"
  }

  depends_on = [aws_lb.app]
}

