terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

############################################
# Locals & data
############################################

locals {
  name_prefix = var.name_prefix

  config_bucket_name     = "${var.name_prefix}-config-logs-${data.aws_caller_identity.current.account_id}"
  cloudtrail_bucket_name = "${var.name_prefix}-cloudtrail-logs-${data.aws_caller_identity.current.account_id}"
  cloudtrail_log_group   = "/aws/cloudtrail/${var.name_prefix}"

  # Standard managed Config rules to provision (keys are stable rule identifiers).
  managed_config_rules = {
    cloudtrail_enabled                       = "CLOUD_TRAIL_ENABLED"
    s3_bucket_public_read_prohibited         = "S3_BUCKET_PUBLIC_READ_PROHIBITED"
    s3_bucket_public_write_prohibited        = "S3_BUCKET_PUBLIC_WRITE_PROHIBITED"
    s3_bucket_server_side_encryption_enabled = "S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED"
    s3_bucket_versioning_enabled             = "S3_BUCKET_VERSIONING_ENABLED"
    kms_cmk_not_scheduled_for_deletion       = "KMS_CMK_NOT_SCHEDULED_FOR_DELETION"
    iam_root_access_key_check                = "IAM_ROOT_ACCESS_KEY_CHECK"
    iam_password_policy                      = "IAM_PASSWORD_POLICY"
    restricted_ssh                           = "INCOMING_SSH_DISABLED"
    vpc_default_security_group_closed        = "VPC_DEFAULT_SECURITY_GROUP_CLOSED"
    encrypted_volumes                        = "ENCRYPTED_VOLUMES"
    rds_storage_encrypted                    = "RDS_STORAGE_ENCRYPTED"
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

############################################
# GuardDuty
############################################

resource "aws_guardduty_detector" "this" {
  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"

  datasources {
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    # NOTE: Malware Protection intentionally NOT enabled — it incurs additional
    # per-volume scan charges. Enable explicitly later if required.
    s3_logs {
      enable = true
    }
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-guardduty"
  })
}

############################################
# Security Hub
############################################

resource "aws_securityhub_account" "this" {
  enable_default_standards = false
}

resource "aws_securityhub_standards_subscription" "aws_foundational" {
  count         = var.enable_security_hub_standards ? 1 : 0
  standards_arn = "arn:${data.aws_partition.current.partition}:securityhub:${data.aws_region.current.name}::standards/aws-foundational-security-best-practices/v/1.0.0"

  depends_on = [aws_securityhub_account.this]
}

resource "aws_securityhub_standards_subscription" "cis_v3" {
  count         = var.enable_security_hub_standards ? 1 : 0
  standards_arn = "arn:${data.aws_partition.current.partition}:securityhub:${data.aws_region.current.name}::standards/cis-aws-foundations-benchmark/v/3.0.0"

  depends_on = [aws_securityhub_account.this]
}

############################################
# AWS Config — service-linked role
############################################

# The AWSServiceRoleForConfig SLR is account-global and can only be created
# once. Toggle `create_config_service_linked_role = false` if it already
# exists (the recorder will look it up via the data source instead).
resource "aws_iam_service_linked_role" "config" {
  count            = var.create_config_service_linked_role ? 1 : 0
  aws_service_name = "config.amazonaws.com"
  description      = "Service-linked role for AWS Config (${local.name_prefix})"
}

data "aws_iam_role" "config_slr_existing" {
  count = var.create_config_service_linked_role ? 0 : 1
  name  = "AWSServiceRoleForConfig"
}

locals {
  config_role_arn = var.create_config_service_linked_role ? aws_iam_service_linked_role.config[0].arn : data.aws_iam_role.config_slr_existing[0].arn
}

############################################
# AWS Config — S3 bucket (dedicated)
############################################

resource "aws_kms_key" "config" {
  description             = "${local.name_prefix} AWS Config logs encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableRootAccountAdmin"
        Effect    = "Allow"
        Principal = { AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "AllowConfigService"
        Effect    = "Allow"
        Principal = { Service = "config.amazonaws.com" }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, { Name = "${local.name_prefix}-config-kms" })
}

resource "aws_kms_alias" "config" {
  name          = "alias/${local.name_prefix}-config"
  target_key_id = aws_kms_key.config.key_id
}

resource "aws_s3_bucket" "config" {
  bucket        = local.config_bucket_name
  force_destroy = false

  tags = merge(var.tags, { Name = local.config_bucket_name })
}

resource "aws_s3_bucket_versioning" "config" {
  bucket = aws_s3_bucket.config.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "config" {
  bucket = aws_s3_bucket.config.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.config.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "config" {
  bucket                  = aws_s3_bucket.config.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "config" {
  bucket = aws_s3_bucket.config.id

  rule {
    id     = "expire-noncurrent"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.config_log_expiration_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Grant AWS Config permission to write into the bucket.
data "aws_iam_policy_document" "config_bucket" {
  statement {
    sid    = "AWSConfigBucketPermissionsCheck"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }

    actions   = ["s3:GetBucketAcl", "s3:ListBucket"]
    resources = [aws_s3_bucket.config.arn]
  }

  statement {
    sid    = "AWSConfigBucketDelivery"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }

    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.config.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/Config/*"]

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }
}

resource "aws_s3_bucket_policy" "config" {
  bucket = aws_s3_bucket.config.id
  policy = data.aws_iam_policy_document.config_bucket.json
}

############################################
# AWS Config — recorder + delivery channel
############################################

resource "aws_config_configuration_recorder" "this" {
  name     = "${local.name_prefix}-recorder"
  role_arn = local.config_role_arn

  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }

  depends_on = [aws_iam_service_linked_role.config]
}

resource "aws_config_delivery_channel" "this" {
  name           = "${local.name_prefix}-delivery"
  s3_bucket_name = aws_s3_bucket.config.bucket
  # No s3_key_prefix — Config writes to AWSLogs/<account>/Config/* which is what
  # the bucket policy allows. Adding a prefix here forces Config to write to
  # <prefix>/AWSLogs/... which the policy does not match.

  snapshot_delivery_properties {
    delivery_frequency = "TwentyFour_Hours"
  }

  depends_on = [
    aws_s3_bucket_policy.config,
    aws_config_configuration_recorder.this,
  ]
}

resource "aws_config_configuration_recorder_status" "this" {
  name       = aws_config_configuration_recorder.this.name
  is_enabled = true

  depends_on = [aws_config_delivery_channel.this]
}

############################################
# AWS Config — managed rules
############################################

resource "aws_config_config_rule" "managed" {
  for_each = var.enable_config_rules ? local.managed_config_rules : {}

  name = "${local.name_prefix}-${replace(each.key, "_", "-")}"

  source {
    owner             = "AWS"
    source_identifier = each.value
  }

  depends_on = [aws_config_configuration_recorder_status.this]
}

############################################
# CloudTrail — KMS CMK
############################################

resource "aws_kms_key" "cloudtrail" {
  description             = "${local.name_prefix} CloudTrail encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableRootAccountAdmin"
        Effect    = "Allow"
        Principal = { AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "AllowCloudTrailEncrypt"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "kms:GenerateDataKey*"
        Resource  = "*"
        Condition = {
          StringLike = {
            "kms:EncryptionContext:aws:cloudtrail:arn" = "arn:${data.aws_partition.current.partition}:cloudtrail:*:${data.aws_caller_identity.current.account_id}:trail/*"
          }
        }
      },
      {
        Sid       = "AllowCloudTrailDescribe"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "kms:DescribeKey"
        Resource  = "*"
      },
      {
        Sid       = "AllowCloudWatchLogsUseOfTheKey"
        Effect    = "Allow"
        Principal = { Service = "logs.${data.aws_region.current.name}.amazonaws.com" }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, { Name = "${local.name_prefix}-cloudtrail-kms" })
}

resource "aws_kms_alias" "cloudtrail" {
  name          = "alias/${local.name_prefix}-cloudtrail"
  target_key_id = aws_kms_key.cloudtrail.key_id
}

############################################
# CloudTrail — S3 bucket (dedicated)
############################################

resource "aws_s3_bucket" "cloudtrail" {
  bucket        = local.cloudtrail_bucket_name
  force_destroy = false

  tags = merge(var.tags, { Name = local.cloudtrail_bucket_name })
}

resource "aws_s3_bucket_versioning" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.cloudtrail.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  bucket                  = aws_s3_bucket.cloudtrail.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  rule {
    id     = "expire-noncurrent"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 365
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "cloudtrail_bucket" {
  statement {
    sid    = "AWSCloudTrailAclCheck"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.cloudtrail.arn]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = ["arn:${data.aws_partition.current.partition}:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/${local.name_prefix}-trail"]
    }
  }

  statement {
    sid    = "AWSCloudTrailWrite"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.cloudtrail.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = ["arn:${data.aws_partition.current.partition}:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/${local.name_prefix}-trail"]
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  policy = data.aws_iam_policy_document.cloudtrail_bucket.json
}

############################################
# CloudTrail — CloudWatch Logs integration
############################################

resource "aws_cloudwatch_log_group" "cloudtrail" {
  name              = local.cloudtrail_log_group
  retention_in_days = var.cloudtrail_log_retention_days
  kms_key_id        = aws_kms_key.cloudtrail.arn

  tags = merge(var.tags, { Name = local.cloudtrail_log_group })
}

data "aws_iam_policy_document" "cloudtrail_assume" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "cloudtrail_to_cwlogs" {
  name               = "${local.name_prefix}-cloudtrail-cwlogs"
  assume_role_policy = data.aws_iam_policy_document.cloudtrail_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "cloudtrail_to_cwlogs" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.cloudtrail.arn}:*"]
  }
}

resource "aws_iam_role_policy" "cloudtrail_to_cwlogs" {
  name   = "${local.name_prefix}-cloudtrail-cwlogs"
  role   = aws_iam_role.cloudtrail_to_cwlogs.id
  policy = data.aws_iam_policy_document.cloudtrail_to_cwlogs.json
}

############################################
# CloudTrail — trail
############################################

resource "aws_cloudtrail" "this" {
  name                          = "${local.name_prefix}-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.bucket
  is_multi_region_trail         = true
  include_global_service_events = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.cloudtrail.arn

  cloud_watch_logs_group_arn = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
  cloud_watch_logs_role_arn  = aws_iam_role.cloudtrail_to_cwlogs.arn

  tags = merge(var.tags, { Name = "${local.name_prefix}-trail" })

  depends_on = [
    aws_s3_bucket_policy.cloudtrail,
    aws_iam_role_policy.cloudtrail_to_cwlogs,
  ]
}

############################################
# IAM — account password policy
############################################

resource "aws_iam_account_password_policy" "this" {
  minimum_password_length        = 14
  require_uppercase_characters   = true
  require_lowercase_characters   = true
  require_numbers                = true
  require_symbols                = true
  allow_users_to_change_password = true
  hard_expiry                    = false
  max_password_age               = 90
  password_reuse_prevention      = 24
}
