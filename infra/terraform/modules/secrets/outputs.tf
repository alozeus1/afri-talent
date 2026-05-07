output "secret_arn" {
  value = aws_secretsmanager_secret.app.arn
}

# Map of env-var-name → SSM parameter ARN, passed to the apprunner module
output "blog_ssm_parameter_arns" {
  description = "SSM Parameter ARNs for the optional blog pipeline keys"
  value = {
    NEWS_API_KEY                  = aws_ssm_parameter.news_api_key.arn
    UNSPLASH_ACCESS_KEY           = aws_ssm_parameter.unsplash_access_key.arn
    PEXELS_API_KEY                = aws_ssm_parameter.pexels_api_key.arn
    BLOG_ADMIN_NOTIFICATION_EMAIL = aws_ssm_parameter.blog_admin_email.arn
  }
}

output "blog_ssm_kms_key_arn" {
  description = "KMS key ARN used to encrypt blog SSM parameters"
  value       = aws_kms_key.ssm_parameters.arn
}
