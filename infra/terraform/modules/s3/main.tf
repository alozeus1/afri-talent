##############################################################################
# S3 private uploads bucket with KMS encryption + CORS for presigned uploads
##############################################################################

data "aws_caller_identity" "current" {}

# KMS key for server-side encryption of resume uploads
resource "aws_kms_key" "uploads" {
  description             = "AfriTalent uploads bucket encryption key"
  deletion_window_in_days = 14
  enable_key_rotation     = true

  tags = {
    Name        = "${var.bucket_name}-kms"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "uploads" {
  name          = "alias/${var.bucket_name}"
  target_key_id = aws_kms_key.uploads.id
}

# Private S3 bucket
resource "aws_s3_bucket" "uploads" {
  bucket = var.bucket_name

  tags = {
    Name        = var.bucket_name
    Environment = var.environment
  }
}

# Block ALL public access
resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning (resume history)
resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Default encryption with KMS
resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.uploads.arn
    }
    bucket_key_enabled = true # reduces KMS cost
  }
}

# CORS — allows browser to PUT directly via presigned URL
resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_origins = var.allowed_origins
    allowed_methods = ["PUT"]
    allowed_headers = ["Content-Type", "Content-Length"]
    expose_headers  = ["ETag"]
    max_age_seconds = 300
  }
}

# Lifecycle — expire old non-current versions after 90 days
resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# IAM policy — ECS task role can Put + Get objects in resumes/ prefix
resource "aws_iam_policy" "uploads_access" {
  name        = "${var.bucket_name}-access"
  description = "Allow ECS backend to Put and Get resume objects"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.uploads.arn}/resumes/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.uploads.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["resumes/*"]
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "kms:GenerateDataKey",
          "kms:Decrypt"
        ]
        Resource = aws_kms_key.uploads.arn
      }
    ]
  })
}
