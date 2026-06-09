output "primary_vault_arn" {
  description = "ARN of the primary-region Backup vault."
  value       = aws_backup_vault.primary.arn
}

output "primary_vault_name" {
  description = "Name of the primary-region Backup vault."
  value       = aws_backup_vault.primary.name
}

output "dr_vault_arn" {
  description = "ARN of the DR-region Backup vault that receives cross-region recovery-point copies."
  value       = aws_backup_vault.dr.arn
}

output "dr_vault_name" {
  description = "Name of the DR-region Backup vault."
  value       = aws_backup_vault.dr.name
}

output "plan_arn" {
  description = "ARN of the Backup plan that drives daily snapshots + DR copies."
  value       = aws_backup_plan.main.arn
}

output "plan_id" {
  description = "ID of the Backup plan."
  value       = aws_backup_plan.main.id
}

output "service_role_arn" {
  description = "ARN of the IAM role assumed by AWS Backup when running plans created by this module."
  value       = aws_iam_role.backup.arn
}

output "primary_kms_key_arn" {
  description = "ARN of the primary-region KMS CMK encrypting recovery points in the primary vault."
  value       = aws_kms_key.primary.arn
}

output "dr_kms_key_arn" {
  description = "ARN of the DR-region KMS CMK encrypting recovery points in the DR vault."
  value       = aws_kms_key.dr.arn
}
