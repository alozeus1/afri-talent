output "domain_identity_arn" {
  value = aws_ses_domain_identity.main.arn
}

output "iam_policy_arn" {
  description = "IAM policy ARN to attach to ECS task role"
  value       = aws_iam_policy.ses_send.arn
}

output "dkim_tokens" {
  description = "DKIM tokens for DNS verification"
  value       = aws_ses_domain_dkim.main.dkim_tokens
}
