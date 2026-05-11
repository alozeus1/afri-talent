terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

locals {
  replication_group_id = "${var.name_prefix}-redis"
  subnet_group_name    = "${var.name_prefix}-redis-subnets"
  kms_alias            = "alias/${var.name_prefix}-redis"

  base_tags = merge(
    var.tags,
    {
      Component = "elasticache-redis"
      Module    = "elasticache-redis"
    }
  )
}

# ---------------------------------------------------------------------------
# KMS CMK for at-rest encryption of the Redis storage.
# ---------------------------------------------------------------------------

resource "aws_kms_key" "redis" {
  description             = "CMK for ElastiCache Redis ${local.replication_group_id} (at-rest)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags = merge(local.base_tags, {
    Name = "${var.name_prefix}-redis-kms"
  })
}

resource "aws_kms_alias" "redis" {
  name          = local.kms_alias
  target_key_id = aws_kms_key.redis.key_id
}

# ---------------------------------------------------------------------------
# Redis AUTH token — random, stored in Secrets Manager.
#
# Inject into the application via SSM REDIS_URL =
#   rediss://:<auth>@<primary_endpoint>:6379
# (see module outputs + STAGING_RUNBOOK).
# ---------------------------------------------------------------------------

resource "random_password" "auth_token" {
  length      = 32
  special     = false # ElastiCache AUTH disallows several special chars; alnum is safe
  upper       = true
  lower       = true
  numeric     = true
  min_lower   = 6
  min_upper   = 6
  min_numeric = 6
}

resource "aws_secretsmanager_secret" "auth_token" {
  name        = "${var.name_prefix}-redis-auth"
  description = "AUTH token for ElastiCache Redis ${local.replication_group_id}. Used to compose the rediss:// connection URL written to SSM."
  kms_key_id  = aws_kms_key.redis.arn
  tags        = local.base_tags
}

resource "aws_secretsmanager_secret_version" "auth_token" {
  secret_id     = aws_secretsmanager_secret.auth_token.id
  secret_string = random_password.auth_token.result
}

# ---------------------------------------------------------------------------
# Subnet group + security group.
# ---------------------------------------------------------------------------

resource "aws_elasticache_subnet_group" "redis" {
  name        = local.subnet_group_name
  description = "Private subnets for ${local.replication_group_id}"
  subnet_ids  = var.subnet_ids
  tags        = local.base_tags
}

resource "aws_security_group" "redis" {
  name        = "${var.name_prefix}-redis-sg"
  description = "ElastiCache Redis — ingress from ECS tasks only"
  vpc_id      = var.vpc_id
  tags = merge(local.base_tags, {
    Name = "${var.name_prefix}-redis-sg"
  })
}

resource "aws_security_group_rule" "redis_ingress" {
  for_each = toset(var.ingress_security_group_ids)

  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = aws_security_group.redis.id
  source_security_group_id = each.value
  description              = "Redis 6379 from ${each.value}"
}

resource "aws_security_group_rule" "redis_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.redis.id
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "All egress (Redis itself does not initiate connections — present for symmetry)"
}

# ---------------------------------------------------------------------------
# CloudWatch log group for slow-log delivery.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "slowlog" {
  name              = "/aws/elasticache/${local.replication_group_id}/slow-log"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.redis.arn
  tags              = local.base_tags
}

# ---------------------------------------------------------------------------
# Replication group (primary + N-1 replicas).
# ---------------------------------------------------------------------------

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = local.replication_group_id
  description          = "AfriTalent Redis — JWT revocation + BullMQ queues"

  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_clusters
  parameter_group_name = "default.redis7"
  engine               = "redis"
  engine_version       = var.engine_version
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  kms_key_id                 = aws_kms_key.redis.arn
  auth_token                 = random_password.auth_token.result

  automatic_failover_enabled = true
  multi_az_enabled           = true

  snapshot_retention_limit = var.snapshot_retention_days
  snapshot_window          = "03:00-05:00"

  apply_immediately = false

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.slowlog.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  tags = merge(local.base_tags, {
    Name = local.replication_group_id
  })
}
