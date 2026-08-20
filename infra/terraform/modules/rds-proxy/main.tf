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

  base_tags = merge(
    var.tags,
    {
      Component = "rds-proxy"
      Module    = "rds-proxy"
    }
  )
}

# ---------------------------------------------------------------------------
# RDS Proxy
# ---------------------------------------------------------------------------

resource "aws_db_proxy" "proxy" {
  name                   = local.proxy_name
  engine_family          = "POSTGRESQL"
  # IAM ownership is deliberately outside this module. The restricted
  # application deployment role is denied iam:PutRolePolicy, so it must only
  # consume a platform-provisioned RDS Proxy role with least-privilege access
  # to the selected secret and KMS key.
  role_arn               = var.proxy_role_arn
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
