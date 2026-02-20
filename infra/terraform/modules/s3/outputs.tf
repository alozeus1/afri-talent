output "bucket_name" {
  value = aws_s3_bucket.uploads.id
}

output "bucket_arn" {
  value = aws_s3_bucket.uploads.arn
}

output "kms_key_arn" {
  value = aws_kms_key.uploads.arn
}

output "iam_policy_arn" {
  description = "IAM policy ARN to attach to ECS task role"
  value       = aws_iam_policy.uploads_access.arn
}
