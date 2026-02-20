# ── VPC Endpoints (cost optimization: reduces NAT gateway traffic) ────────────
# Note: ECS still needs NAT for external APIs (Anthropic, Stripe, etc.)
# These endpoints reduce NAT traffic for AWS service calls.

# S3 Gateway endpoint (FREE)
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = module.network.vpc_id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = module.network.private_route_table_ids

  tags = merge(local.tags, { Name = "${local.name_prefix}-s3-endpoint" })
}

# ECR API Interface endpoint
resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = module.network.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.network.private_subnet_ids
  security_group_ids  = [module.security.ecs_sg_id]
  private_dns_enabled = true

  tags = merge(local.tags, { Name = "${local.name_prefix}-ecr-api-endpoint" })
}

# ECR DKR Interface endpoint
resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = module.network.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.network.private_subnet_ids
  security_group_ids  = [module.security.ecs_sg_id]
  private_dns_enabled = true

  tags = merge(local.tags, { Name = "${local.name_prefix}-ecr-dkr-endpoint" })
}

# CloudWatch Logs Interface endpoint
resource "aws_vpc_endpoint" "logs" {
  vpc_id              = module.network.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.network.private_subnet_ids
  security_group_ids  = [module.security.ecs_sg_id]
  private_dns_enabled = true

  tags = merge(local.tags, { Name = "${local.name_prefix}-logs-endpoint" })
}

# Secrets Manager Interface endpoint
resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = module.network.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.network.private_subnet_ids
  security_group_ids  = [module.security.ecs_sg_id]
  private_dns_enabled = true

  tags = merge(local.tags, { Name = "${local.name_prefix}-sm-endpoint" })
}
