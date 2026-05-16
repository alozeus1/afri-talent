output "ssm_parameter_path_prefix" {
  description = "Leading slash path prefix all parameters live under (e.g., '/afritalent/dev')."
  value       = local.prefix_path
}

output "name_prefix" {
  description = "Echo of the input name_prefix (without leading slash), useful for downstream module wiring."
  value       = var.name_prefix
}

output "ssm_kms_key_arn" {
  description = "ARN of the CMK encrypting all SSM SecureString parameters in this module."
  value       = aws_kms_key.ssm.arn
}

output "ssm_kms_key_alias" {
  description = "Alias for the SSM CMK."
  value       = aws_kms_alias.ssm.name
}

output "required_parameter_arns" {
  description = "Map of required parameter NAME -> ARN."
  value       = { for k, p in aws_ssm_parameter.required : k => p.arn }
}

output "optional_parameter_arns" {
  description = "Map of optional parameter NAME -> ARN."
  value       = { for k, p in aws_ssm_parameter.optional : k => p.arn }
}

output "blog_parameter_arns" {
  description = "Map of blog parameter NAME -> ARN."
  value       = { for k, p in aws_ssm_parameter.blog : k => p.arn }
}

output "toggle_parameter_arns" {
  description = "Map of toggle parameter NAME -> ARN."
  value       = { for k, p in aws_ssm_parameter.toggle : k => p.arn }
}

output "database_url_parameter_arn" {
  description = "ARN of the DATABASE_URL SSM parameter shell."
  value       = aws_ssm_parameter.database_url.arn
}

output "database_url_parameter_name" {
  description = "Name of the DATABASE_URL SSM parameter (full path)."
  value       = aws_ssm_parameter.database_url.name
}

output "all_parameter_arns" {
  description = "Combined map of every parameter NAME -> ARN that this module manages (required + optional + blog + toggle + DATABASE_URL)."
  value = merge(
    { for k, p in aws_ssm_parameter.required : k => p.arn },
    { for k, p in aws_ssm_parameter.optional : k => p.arn },
    { for k, p in aws_ssm_parameter.blog : "blog/${k}" => p.arn },
    { for k, p in aws_ssm_parameter.toggle : k => p.arn },
    { "DATABASE_URL" = aws_ssm_parameter.database_url.arn },
  )
}
