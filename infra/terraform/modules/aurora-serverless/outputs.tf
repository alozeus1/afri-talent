output "aurora_cluster_identifier" {
  description = "Cluster identifier (used by RDS Proxy target)."
  value       = aws_rds_cluster.aurora.cluster_identifier
}

output "aurora_cluster_arn" {
  description = "ARN of the Aurora cluster."
  value       = aws_rds_cluster.aurora.arn
}

output "aurora_cluster_endpoint" {
  description = "Writer endpoint of the Aurora cluster (use RDS Proxy in front of this for app traffic)."
  value       = aws_rds_cluster.aurora.endpoint
}

output "aurora_cluster_reader_endpoint" {
  description = "Reader endpoint of the Aurora cluster."
  value       = aws_rds_cluster.aurora.reader_endpoint
}

output "aurora_cluster_port" {
  description = "TCP port the cluster listens on."
  value       = aws_rds_cluster.aurora.port
}

output "aurora_database_name" {
  description = "Initial database name."
  value       = aws_rds_cluster.aurora.database_name
}

output "aurora_master_username" {
  description = "Master username."
  value       = aws_rds_cluster.aurora.master_username
}

output "aurora_master_user_secret_arn" {
  description = "ARN of the AWS-managed Secrets Manager secret holding the master password (rotated by RDS)."
  # manage_master_user_password = true populates master_user_secret as a list of one.
  value = try(aws_rds_cluster.aurora.master_user_secret[0].secret_arn, null)
}

output "aurora_kms_key_arn" {
  description = "ARN of the CMK encrypting Aurora storage and Performance Insights."
  value       = aws_kms_key.aurora.arn
}

output "aurora_kms_key_alias" {
  description = "Alias of the Aurora CMK."
  value       = aws_kms_alias.aurora.name
}

output "aurora_subnet_group_name" {
  description = "Name of the DB subnet group."
  value       = aws_db_subnet_group.aurora.name
}

output "aurora_cluster_parameter_group_name" {
  description = "Name of the cluster parameter group."
  value       = aws_rds_cluster_parameter_group.aurora.name
}
