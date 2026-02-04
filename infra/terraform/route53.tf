module "route53" {
  count = var.enable_route53 ? 1 : 0

  source = "./modules/route53"

  zone_id               = var.route53_zone_id
  frontend_domain_name  = var.frontend_domain_name
  admin_domain_name     = var.admin_domain_name
  api_domain_name       = var.api_domain_name
  cloudfront_domain_name = aws_cloudfront_distribution.app.domain_name
  cloudfront_zone_id     = aws_cloudfront_distribution.app.hosted_zone_id
  alb_dns_name           = aws_lb.app.dns_name
  alb_zone_id            = aws_lb.app.zone_id
}
