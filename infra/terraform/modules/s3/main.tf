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
    allowed_headers = [
      "Content-Type",
      "Content-Length",
      "x-amz-server-side-encryption",
      "x-amz-server-side-encryption-aws-kms-key-id",
    ]
    expose_headers  = ["ETag"]
    max_age_seconds = 300
  }
}

# Lifecycle — Wave 8 §9.3:
#   - noncurrent versions older than 90 days transition to Glacier (kept, not deleted)
#   - abort incomplete multipart uploads after 7 days (cost hygiene)
#
# Previous behavior was to expire (delete) noncurrent versions at 90 days,
# which loses recovery material. Master prompt §9.3 explicitly calls for a
# transition rule so versions remain restorable indefinitely from Glacier.
resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "archive-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_transition {
      noncurrent_days = 90
      storage_class   = "GLACIER"
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# §2.11 — IAM policy parameterised by `prefix_acl`. The previous policy hard-
# coded `resumes/*` only, which silently broke uploads under any other prefix
# (e.g. trust/candidates/) with AccessDenied at runtime. Now the caller
# enumerates every prefix it intends to store under.
locals {
  put_get_resources = [for p in var.prefix_acl : "${aws_s3_bucket.uploads.arn}/${p}*"]
  list_prefixes     = [for p in var.prefix_acl : "${p}*"]
}

resource "aws_iam_policy" "uploads_access" {
  name        = "${var.bucket_name}-access"
  description = "Allow ECS backend to Put/Get/Delete under ${join(", ", var.prefix_acl)}"

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
        Resource = local.put_get_resources
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.uploads.arn
        Condition = {
          StringLike = {
            "s3:prefix" = local.list_prefixes
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
