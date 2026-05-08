output "guardduty_detector_id" {
  description = "GuardDuty detector ID."
  value       = aws_guardduty_detector.this.id
}

output "security_hub_account_id" {
  description = "Security Hub account resource ID (account number when enabled)."
  value       = aws_securityhub_account.this.id
}

output "config_recorder_name" {
  description = "Name of the AWS Config configuration recorder."
  value       = aws_config_configuration_recorder.this.name
}

output "config_delivery_channel_name" {
  description = "Name of the AWS Config delivery channel."
  value       = aws_config_delivery_channel.this.name
}

output "config_log_bucket" {
  description = "Bucket name receiving AWS Config logs."
  value       = aws_s3_bucket.config.bucket
}

output "config_log_bucket_arn" {
  description = "ARN of the AWS Config log bucket."
  value       = aws_s3_bucket.config.arn
}

output "config_kms_key_arn" {
  description = "KMS CMK ARN encrypting the AWS Config bucket."
  value       = aws_kms_key.config.arn
}

output "cloudtrail_arn" {
  description = "ARN of the CloudTrail trail."
  value       = aws_cloudtrail.this.arn
}

output "cloudtrail_name" {
  description = "Name of the CloudTrail trail."
  value       = aws_cloudtrail.this.name
}

output "cloudtrail_log_bucket" {
  description = "Bucket name receiving CloudTrail logs."
  value       = aws_s3_bucket.cloudtrail.bucket
}

output "cloudtrail_log_bucket_arn" {
  description = "ARN of the CloudTrail log bucket."
  value       = aws_s3_bucket.cloudtrail.arn
}

output "cloudtrail_kms_key_arn" {
  description = "ARN of the KMS CMK encrypting CloudTrail data."
  value       = aws_kms_key.cloudtrail.arn
}

output "cloudtrail_kms_key_alias" {
  description = "Alias of the CloudTrail KMS CMK."
  value       = aws_kms_alias.cloudtrail.name
}

output "cloudtrail_log_group_arn" {
  description = "CloudWatch Logs group ARN receiving CloudTrail events."
  value       = aws_cloudwatch_log_group.cloudtrail.arn
}

output "cloudtrail_log_group_name" {
  description = "CloudWatch Logs group name receiving CloudTrail events."
  value       = aws_cloudwatch_log_group.cloudtrail.name
}

output "config_rule_names" {
  description = "Names of the managed AWS Config rules created by this module."
  value       = [for r in aws_config_config_rule.managed : r.name]
}
