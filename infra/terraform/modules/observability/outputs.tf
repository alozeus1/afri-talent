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

# ── SLO alarms (Wave 9 §10.1) ────────────────────────────────────────────────

output "slo_alerts_topic_arn" {
  description = "ARN of the SNS topic that every SLO alarm publishes to. Subscribe PagerDuty / Opsgenie / additional email endpoints to this ARN."
  value       = aws_sns_topic.slo_alerts.arn
}

output "slo_alarm_names" {
  description = "Names of all SLO alarms created by this module (six per master prompt §10.1). Alarms #1 and #2 are conditional on alb/target-group inputs."
  value = compact([
    length(aws_cloudwatch_metric_alarm.api_availability_5xx) > 0 ? aws_cloudwatch_metric_alarm.api_availability_5xx[0].alarm_name : "",
    length(aws_cloudwatch_metric_alarm.api_jobs_latency_p95) > 0 ? aws_cloudwatch_metric_alarm.api_jobs_latency_p95[0].alarm_name : "",
    aws_cloudwatch_metric_alarm.match_agent_p95.alarm_name,
    aws_cloudwatch_metric_alarm.apply_agent_delivery_rate.alarm_name,
    aws_cloudwatch_metric_alarm.classifier_accuracy.alarm_name,
    aws_cloudwatch_metric_alarm.stale_job_removal_latency.alarm_name,
  ])
}
