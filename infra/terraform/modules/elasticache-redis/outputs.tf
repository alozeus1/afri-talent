output "replication_group_id" {
  description = "ElastiCache replication group identifier."
  value       = aws_elasticache_replication_group.redis.id
}

output "primary_endpoint_address" {
  description = "Primary endpoint hostname. Writes go here. Use for the SSM REDIS_URL."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "reader_endpoint_address" {
  description = "Reader endpoint hostname. Round-robins across replicas. Use for read-heavy workloads."
  value       = aws_elasticache_replication_group.redis.reader_endpoint_address
}

output "port" {
  description = "Redis port (always 6379 for this module)."
  value       = aws_elasticache_replication_group.redis.port
}

output "security_group_id" {
  description = "Security group attached to the Redis replication group. Other modules add ingress rules from their own SGs as needed."
  value       = aws_security_group.redis.id
}

output "auth_secret_arn" {
  description = "Secrets Manager ARN for the AUTH token. Read with `aws secretsmanager get-secret-value` to compose the rediss:// URL."
  value       = aws_secretsmanager_secret.auth_token.arn
}

output "auth_secret_name" {
  description = "Secrets Manager name for the AUTH token (useful for the post-apply script that writes SSM REDIS_URL)."
  value       = aws_secretsmanager_secret.auth_token.name
}

output "kms_key_arn" {
  description = "KMS key ARN used for at-rest encryption and the slow-log group."
  value       = aws_kms_key.redis.arn
}
