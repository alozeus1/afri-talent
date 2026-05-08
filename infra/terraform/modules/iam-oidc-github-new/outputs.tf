output "oidc_role_arn" {
  description = "ARN of the GitHub Actions deploy IAM role. Used by GitHub Actions OIDC `role-to-assume`."
  value       = aws_iam_role.github_deploy.arn
}

output "oidc_role_name" {
  description = "Name of the GitHub Actions deploy IAM role."
  value       = aws_iam_role.github_deploy.name
}

output "oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider used by the role's trust policy."
  value       = local.oidc_provider_arn
}

output "deploy_policy_arn" {
  description = "ARN of the scoped deploy policy attached to the role."
  value       = aws_iam_policy.github_deploy.arn
}

output "guardrail_policy_arn" {
  description = "ARN of the deny-list guardrail policy attached to the role."
  value       = aws_iam_policy.iam_org_guardrail.arn
}
