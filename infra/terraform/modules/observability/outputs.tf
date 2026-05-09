output "log_group_arns_map" {
  description = "Map of cross-cutting CloudWatch Logs group names to their ARNs."
  value       = { for k, lg in aws_cloudwatch_log_group.this : k => lg.arn }
}

output "log_group_names_map" {
  description = "Map of logical keys to CloudWatch Logs group names."
  value       = { for k, lg in aws_cloudwatch_log_group.this : k => lg.name }
}

output "vpc_flow_log_id" {
  description = "ID of the VPC flow log."
  value       = aws_flow_log.vpc.id
}

output "vpc_flow_log_role_arn" {
  description = "IAM role ARN used by VPC Flow Logs to publish to CloudWatch Logs."
  value       = aws_iam_role.flow_logs.arn
}

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard."
  value       = aws_cloudwatch_dashboard.overview.dashboard_name
}

output "dashboard_url" {
  description = "Console URL for the CloudWatch dashboard."
  value       = "https://${data.aws_region.current.name}.console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#dashboards:name=${aws_cloudwatch_dashboard.overview.dashboard_name}"
}
