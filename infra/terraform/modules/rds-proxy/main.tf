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
  proxy_name = "${var.name_prefix}-rds-proxy"
  role_name  = "${var.name_prefix}-rds-proxy-role"

  base_tags = merge(
    var.tags,
    {
      Component = "rds-proxy"
      Module    = "rds-proxy"
    }
  )
}

# ---------------------------------------------------------------------------
# IAM role assumed by the RDS Proxy service to read the master secret.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "proxy" {
  name               = local.role_name
  assume_role_policy = data.aws_iam_policy_document.trust.json
  description        = "Allows ${local.proxy_name} to fetch the Aurora master credentials secret"
  tags = merge(local.base_tags, {
    Name = local.role_name
  })
}

data "aws_iam_policy_document" "secret_access" {
  statement {
    sid    = "ReadMasterSecret"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [var.master_user_secret_arn]
  }

  statement {
    sid    = "DecryptSecretKms"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
    ]
    resources = [var.secret_kms_key_arn]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.us-east-1.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "proxy_secret" {
  name   = "${local.role_name}-secret-access"
  role   = aws_iam_role.proxy.id
  policy = data.aws_iam_policy_document.secret_access.json
}

# ---------------------------------------------------------------------------
# RDS Proxy
# ---------------------------------------------------------------------------

resource "aws_db_proxy" "proxy" {
  name                   = local.proxy_name
  engine_family          = "POSTGRESQL"
  role_arn               = aws_iam_role.proxy.arn
  vpc_subnet_ids         = var.private_subnet_ids
  vpc_security_group_ids = [var.sg_rds_proxy_id]
  require_tls            = var.require_tls
  idle_client_timeout    = var.idle_client_timeout
  debug_logging          = false

  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = var.master_user_secret_arn
    description = "Aurora master credentials (auto-rotated by Secrets Manager)"
  }

  tags = merge(local.base_tags, {
    Name = local.proxy_name
  })
}

resource "aws_db_proxy_default_target_group" "proxy" {
  db_proxy_name = aws_db_proxy.proxy.name

  connection_pool_config {
    connection_borrow_timeout    = var.connection_borrow_timeout
    max_connections_percent      = var.max_connections_percent
    max_idle_connections_percent = var.max_idle_connections_percent
  }
}

resource "aws_db_proxy_target" "aurora" {
  db_proxy_name         = aws_db_proxy.proxy.name
  target_group_name     = aws_db_proxy_default_target_group.proxy.name
  db_cluster_identifier = var.aurora_cluster_identifier
}
