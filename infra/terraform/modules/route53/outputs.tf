output "frontend_fqdn" {
  value = aws_route53_record.frontend_a.fqdn
}

output "admin_fqdn" {
  value = length(aws_route53_record.admin_a) > 0 ? aws_route53_record.admin_a[0].fqdn : ""
}

output "api_fqdn" {
  value = length(aws_route53_record.api_a) > 0 ? aws_route53_record.api_a[0].fqdn : ""
}
