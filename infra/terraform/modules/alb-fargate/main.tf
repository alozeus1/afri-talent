terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

locals {
  name              = var.name_prefix
  enable_access_log = var.access_logs_bucket != ""
  enable_https      = var.enable_https
}

# ---------------------------------------------------------------------------
# Application Load Balancer (internet-facing — CloudFront points at it)
# ---------------------------------------------------------------------------

resource "aws_lb" "this" {
  name                       = "${local.name}-alb"
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = var.security_group_ids
  subnets                    = var.public_subnet_ids
  idle_timeout               = var.idle_timeout
  drop_invalid_header_fields = true
  enable_http2               = true

  dynamic "access_logs" {
    for_each = local.enable_access_log ? [1] : []
    content {
      bucket  = var.access_logs_bucket
      prefix  = var.access_logs_prefix
      enabled = true
    }
  }

  tags = {
    Name = "${local.name}-alb"
  }
}

# ---------------------------------------------------------------------------
# Target groups — Fargate awsvpc => target_type = "ip"
# ---------------------------------------------------------------------------

resource "aws_lb_target_group" "frontend" {
  name        = "${local.name}-tg-frontend"
  port        = var.frontend_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = var.frontend_health_check_path
    protocol            = "HTTP"
    matcher             = "200-399"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
  }

  deregistration_delay = 30

  tags = {
    Name = "${local.name}-tg-frontend"
  }
}

resource "aws_lb_target_group" "backend" {
  name        = "${local.name}-tg-backend"
  port        = var.backend_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = var.backend_health_check_path
    protocol            = "HTTP"
    matcher             = "200-399"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
  }

  deregistration_delay = 30

  tags = {
    Name = "${local.name}-tg-backend"
  }
}

# ---------------------------------------------------------------------------
# Listeners — :80 redirects to :443; :443 forwards to frontend by default,
# /api/* to backend.
# ---------------------------------------------------------------------------

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  # When HTTPS is enabled, redirect 80 -> 443. When not (no cert), :80 forwards
  # straight to the frontend so dev can reach the app while a domain is being
  # provisioned. CloudFront fronts everything in either case.
  dynamic "default_action" {
    for_each = local.enable_https ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = local.enable_https ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.frontend.arn
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = local.enable_https ? 1 : 0
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = var.ssl_policy
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

# /api/* listener rule attaches to whichever listener serves the frontend.
resource "aws_lb_listener_rule" "api_to_backend" {
  listener_arn = local.enable_https ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}
