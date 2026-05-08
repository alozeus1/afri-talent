output "ecr_repo_url_frontend" {
  description = "Repository URL for the frontend image."
  value       = aws_ecr_repository.this["frontend"].repository_url
}

output "ecr_repo_url_backend" {
  description = "Repository URL for the backend image."
  value       = aws_ecr_repository.this["backend"].repository_url
}

output "ecr_repo_arn_frontend" {
  description = "ARN of the frontend ECR repository."
  value       = aws_ecr_repository.this["frontend"].arn
}

output "ecr_repo_arn_backend" {
  description = "ARN of the backend ECR repository."
  value       = aws_ecr_repository.this["backend"].arn
}

output "ecr_repo_name_frontend" {
  description = "Name of the frontend ECR repository."
  value       = aws_ecr_repository.this["frontend"].name
}

output "ecr_repo_name_backend" {
  description = "Name of the backend ECR repository."
  value       = aws_ecr_repository.this["backend"].name
}
