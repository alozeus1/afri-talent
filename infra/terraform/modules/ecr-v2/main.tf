terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.70" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
}

#
# ECR v2 — separate from the App Runner-era `modules/ecr/` so the migration to
# the new account (108188564905) can run in parallel with the legacy stack.
#
# Two repositories, MUTABLE tags (we use `latest` + git SHA), scan on push,
# lifecycle policy keeping last 10 untagged + last 30 tagged images, optional
# KMS encryption.
#

locals {
  repos = {
    frontend = "${var.name_prefix}-frontend"
    backend  = "${var.name_prefix}-backend"
  }

  use_kms = length(trimspace(var.kms_key_arn)) > 0

  encryption_type = local.use_kms ? "KMS" : "AES256"

  # Lifecycle policy: priority order matters. Untagged first, then total cap.
  lifecycle_policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 untagged images"
        selection = {
          tagStatus   = "untagged"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep last 30 tagged images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 30
        }
        action = { type = "expire" }
      }
    ]
  })
}

resource "aws_ecr_repository" "this" {
  for_each = local.repos

  name                 = each.value
  image_tag_mutability = "MUTABLE"
  force_delete         = var.force_delete

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = local.encryption_type
    kms_key         = local.use_kms ? var.kms_key_arn : null
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each = aws_ecr_repository.this

  repository = each.value.name
  policy     = local.lifecycle_policy
}
