output "rds_proxy_endpoint" {
  description = "Endpoint clients connect to. This is what goes into DATABASE_URL."
  value       = aws_db_proxy.proxy.endpoint
}

output "rds_proxy_arn" {
  description = "ARN of the RDS Proxy."
  value       = aws_db_proxy.proxy.arn
}

output "rds_proxy_name" {
  description = "Name of the RDS Proxy."
  value       = aws_db_proxy.proxy.name
}

output "rds_proxy_role_arn" {
  description = "ARN of the IAM role the proxy uses to read the master secret."
  value       = aws_iam_role.proxy.arn
}
