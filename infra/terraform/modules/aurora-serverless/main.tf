terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

locals {
  cluster_identifier   = "${var.name_prefix}-aurora"
  parameter_group_name = "${var.name_prefix}-aurora-cluster-pg"
  subnet_group_name    = "${var.name_prefix}-aurora-subnets"
  kms_alias            = "alias/${var.name_prefix}-aurora"

  base_tags = merge(
    var.tags,
    {
      Component = "aurora-serverless"
      Module    = "aurora-serverless"
    }
  )
}

# ---------------------------------------------------------------------------
# KMS CMK for Aurora storage + Performance Insights encryption
# ---------------------------------------------------------------------------

resource "aws_kms_key" "aurora" {
  description             = "CMK for Aurora cluster ${local.cluster_identifier} (storage + Performance Insights)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags = merge(local.base_tags, {
    Name = "${var.name_prefix}-aurora-kms"
  })
}

resource "aws_kms_alias" "aurora" {
  name          = local.kms_alias
  target_key_id = aws_kms_key.aurora.key_id
}

# ---------------------------------------------------------------------------
# DB subnet group (uses isolated subnets — no internet route)
# ---------------------------------------------------------------------------

resource "aws_db_subnet_group" "aurora" {
  name        = local.subnet_group_name
  description = "Isolated subnets for ${local.cluster_identifier}"
  subnet_ids  = var.isolated_subnet_ids
  tags = merge(local.base_tags, {
    Name = local.subnet_group_name
  })
}

# ---------------------------------------------------------------------------
# Cluster parameter group: enforce SSL + log DDL
# ---------------------------------------------------------------------------

resource "aws_rds_cluster_parameter_group" "aurora" {
  name        = local.parameter_group_name
  family      = "aurora-postgresql15"
  description = "Cluster parameters for ${local.cluster_identifier}: force SSL + DDL audit logging"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "log_statement"
    value        = "ddl"
    apply_method = "pending-reboot"
  }

  tags = merge(local.base_tags, {
    Name = local.parameter_group_name
  })
}

# ---------------------------------------------------------------------------
# Aurora Serverless v2 PostgreSQL cluster
# ---------------------------------------------------------------------------
# NOTE: dev defaults below use deletion_protection=false and skip_final_snapshot=true.
# Production callers MUST override:
#   deletion_protection = true
#   (and remove the skip_final_snapshot override / set to false)
# ---------------------------------------------------------------------------

resource "aws_rds_cluster" "aurora" {
  cluster_identifier = local.cluster_identifier

  engine         = "aurora-postgresql"
  engine_mode    = "provisioned" # Serverless v2 uses 'provisioned' engine_mode
  engine_version = var.engine_version

  database_name   = var.db_name
  master_username = var.master_username

  # Auto-managed master password — AWS rotates it and stores in Secrets Manager.
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.aurora.arn

  # Storage: encrypted with our CMK. Build-phase dev can use Aurora Standard;
  # production or I/O-heavy environments can use I/O-Optimized.
  storage_encrypted = true
  kms_key_id        = aws_kms_key.aurora.arn
  storage_type      = var.storage_type

  db_subnet_group_name            = aws_db_subnet_group.aurora.name
  vpc_security_group_ids          = [var.sg_aurora_id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora.name

  serverlessv2_scaling_configuration {
    min_capacity             = var.min_acu
    max_capacity             = var.max_acu
    seconds_until_auto_pause = var.seconds_until_auto_pause
  }

  backup_retention_period = var.backup_retention_period
  preferred_backup_window = var.preferred_backup_window

  enabled_cloudwatch_logs_exports = ["postgresql"]

  # Dev-friendly defaults — PROD MUST OVERRIDE.
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : (var.final_snapshot_identifier != "" ? var.final_snapshot_identifier : "${local.cluster_identifier}-final")

  apply_immediately = true

  tags = merge(local.base_tags, {
    Name = local.cluster_identifier
  })
}

# ---------------------------------------------------------------------------
# Writer instance — Serverless v2 requires at least one writer.
# Auto-pause works with writer-only; readers are intentionally omitted for v1.
# ---------------------------------------------------------------------------

resource "aws_rds_cluster_instance" "writer" {
  identifier         = "${local.cluster_identifier}-writer"
  cluster_identifier = aws_rds_cluster.aurora.id
  engine             = aws_rds_cluster.aurora.engine
  engine_version     = aws_rds_cluster.aurora.engine_version

  instance_class      = "db.serverless"
  publicly_accessible = false

  db_subnet_group_name = aws_db_subnet_group.aurora.name

  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.aurora.arn
  performance_insights_retention_period = var.performance_insights_retention_period

  tags = merge(local.base_tags, {
    Name = "${local.cluster_identifier}-writer"
  })
}
