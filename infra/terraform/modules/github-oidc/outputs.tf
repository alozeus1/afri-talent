output "role_arn" {
  value = aws_iam_role.github_actions.arn
}

output "provider_arn" {
  value = local.oidc_provider_arn
}
