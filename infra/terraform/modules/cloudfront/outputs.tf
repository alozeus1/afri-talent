output "domain_name" {
  value = aws_cloudfront_distribution.app.domain_name
}

output "distribution_id" {
  value = aws_cloudfront_distribution.app.id
}

output "hosted_zone_id" {
  value = aws_cloudfront_distribution.app.hosted_zone_id
}
