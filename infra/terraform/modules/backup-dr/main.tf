terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.70"
      configuration_aliases = [aws.dr]
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# AWS Backup — primary vault (this region) + DR vault (DR region) + plan that
# runs daily and copies every recovery point to the DR vault.
#
# Wave 8 §9.3:
#   - Aurora PITR ≥ 14 days (handled at the Aurora cluster level).
#   - Snapshot retention 30 days (this module).
#   - Cross-region snapshots to us-west-2 via Backup Vault (this module).
#
# Recovery flow:
#   1. Daily 06:00 UTC: AWS Backup snapshots the Aurora cluster into the primary
#      vault, encrypted with the primary-region CMK created here.
#   2. The same job copies the recovery point to the DR vault (DR region),
#      re-encrypted with the DR-region CMK.
#   3. Both copies expire after var.retention_days days.
#
# The Backup service role is account-scoped; it can be reused across stacks
# but creating per-stack instances keeps blast radius small and avoids
# coordinating IAM ownership across waves.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  primary_vault_name = "${var.name_prefix}-backup-vault"
  dr_vault_name      = "${var.name_prefix}-backup-vault-dr"
  plan_name          = "${var.name_prefix}-backup-plan"
  rule_name          = "${var.name_prefix}-daily"
  selection_name     = "${var.name_prefix}-aurora-selection"
  service_role_name  = "${var.name_prefix}-backup-service-role"
  primary_kms_alias  = "alias/${var.name_prefix}-backup-vault"
  dr_kms_alias       = "alias/${var.name_prefix}-backup-vault-dr"

  base_tags = merge(
    var.tags,
    {
      Component = "backup-dr"
      Module    = "backup-dr"
    }
  )

  cold_storage_enabled = var.cold_storage_after_days > 0
}

# ── KMS CMKs ──────────────────────────────────────────────────────────────────

resource "aws_kms_key" "primary" {
  description             = "CMK for AWS Backup vault ${local.primary_vault_name} (${var.primary_region})"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags = merge(local.base_tags, {
    Name = "${var.name_prefix}-backup-kms"
  })
}

resource "aws_kms_alias" "primary" {
  name          = local.primary_kms_alias
  target_key_id = aws_kms_key.primary.key_id
}

resource "aws_kms_key" "dr" {
  provider                = aws.dr
  description             = "CMK for AWS Backup vault ${local.dr_vault_name} (${var.dr_region})"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags = merge(local.base_tags, {
    Name = "${var.name_prefix}-backup-kms-dr"
  })
}

resource "aws_kms_alias" "dr" {
  provider      = aws.dr
  name          = local.dr_kms_alias
  target_key_id = aws_kms_key.dr.key_id
}

# ── Vaults ────────────────────────────────────────────────────────────────────

resource "aws_backup_vault" "primary" {
  name        = local.primary_vault_name
  kms_key_arn = aws_kms_key.primary.arn
  tags = merge(local.base_tags, {
    Name = local.primary_vault_name
  })
}

resource "aws_backup_vault" "dr" {
  provider    = aws.dr
  name        = local.dr_vault_name
  kms_key_arn = aws_kms_key.dr.arn
  tags = merge(local.base_tags, {
    Name = local.dr_vault_name
  })
}

# ── Backup Plan (daily snapshot + cross-region copy) ─────────────────────────

resource "aws_backup_plan" "main" {
  name = local.plan_name

  rule {
    rule_name                = local.rule_name
    target_vault_name        = aws_backup_vault.primary.name
    schedule                 = var.schedule_expression
    start_window             = var.start_window_minutes
    completion_window        = var.completion_window_minutes
    enable_continuous_backup = false # Aurora's own PITR provides continuous; daily snapshots are point-in-time copies

    lifecycle {
      delete_after       = var.retention_days
      cold_storage_after = local.cold_storage_enabled ? var.cold_storage_after_days : null
    }

    copy_action {
      destination_vault_arn = aws_backup_vault.dr.arn

      lifecycle {
        delete_after       = var.retention_days
        cold_storage_after = local.cold_storage_enabled ? var.cold_storage_after_days : null
      }
    }
  }

  tags = local.base_tags
}

# ── IAM service role for AWS Backup ──────────────────────────────────────────

data "aws_iam_policy_document" "backup_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["backup.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name               = local.service_role_name
  assume_role_policy = data.aws_iam_policy_document.backup_assume.json
  tags               = local.base_tags
}

# AWS-managed policies for Backup + Restore (covers RDS/Aurora, EBS, EFS, etc.)
resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "restore" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

# ── Selection — which resources the plan covers ──────────────────────────────

resource "aws_backup_selection" "aurora" {
  iam_role_arn = aws_iam_role.backup.arn
  name         = local.selection_name
  plan_id      = aws_backup_plan.main.id

  resources = [var.aurora_cluster_arn]
}
