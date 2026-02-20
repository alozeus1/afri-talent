output "frontend_repo_url" {
  value = var.create ? aws_ecr_repository.frontend[0].repository_url : data.aws_ecr_repository.frontend[0].repository_url
}

output "backend_repo_url" {
  value = var.create ? aws_ecr_repository.backend[0].repository_url : data.aws_ecr_repository.backend[0].repository_url
}

output "frontend_repo_arn" {
  value = var.create ? aws_ecr_repository.frontend[0].arn : data.aws_ecr_repository.frontend[0].arn
}

output "backend_repo_arn" {
  value = var.create ? aws_ecr_repository.backend[0].arn : data.aws_ecr_repository.backend[0].arn
}
