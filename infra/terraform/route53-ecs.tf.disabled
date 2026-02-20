module "route53" {
  count = var.enable_route53 ? 1 : 0

  source = "./modules/route53"

  zone_id                = var.route53_zone_id
  frontend_domain_name   = var.frontend_domain_name
  admin_domain_name      = var.admin_domain_name
  api_domain_name        = var.api_domain_name
  cloudfront_domain_name = module.cloudfront.domain_name
  cloudfront_zone_id     = module.cloudfront.hosted_zone_id
  alb_dns_name           = module.alb.alb_dns_name
  alb_zone_id            = module.alb.alb_zone_id
}
