output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution."
  value       = aws_cloudfront_distribution.this.id
}

output "cloudfront_domain_name" {
  description = "Default CloudFront domain (d?????.cloudfront.net)."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "cloudfront_arn" {
  description = "ARN of the CloudFront distribution."
  value       = aws_cloudfront_distribution.this.arn
}

output "cloudfront_hosted_zone_id" {
  description = "Hosted zone ID for CloudFront (used for Route 53 alias records)."
  value       = aws_cloudfront_distribution.this.hosted_zone_id
}

output "waf_web_acl_arn" {
  description = "ARN of the WAFv2 web ACL attached to CloudFront."
  value       = aws_wafv2_web_acl.this.arn
}

output "waf_web_acl_id" {
  description = "ID of the WAFv2 web ACL."
  value       = aws_wafv2_web_acl.this.id
}

output "acm_certificate_arn" {
  description = "ARN of the ACM certificate (us-east-1) issued for the domain. Empty if no domain configured."
  value       = length(aws_acm_certificate.this) > 0 ? aws_acm_certificate.this[0].arn : ""
}

output "acm_certificate_validation_options" {
  description = "DNS validation records for the ACM certificate. Empty list if no domain configured. Caller must create these in Route 53."
  value       = length(aws_acm_certificate.this) > 0 ? aws_acm_certificate.this[0].domain_validation_options : []
}
