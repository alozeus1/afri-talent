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
  name = var.name_prefix

  # Interface VPC endpoints (PrivateLink) needed for AWS service access from
  # private subnets without a NAT Gateway.
  interface_endpoints = [
    "ecr.api",
    "ecr.dkr",
    "logs",
    "ssm",
    "ssmmessages",
    "ec2messages",
    "secretsmanager",
    "sts",
    "kms",
    "sqs",
    "states",
    "events",
  ]
}

# ---------------------------------------------------------------------------
# VPC + Internet Gateway
# ---------------------------------------------------------------------------

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${local.name}-vpc"
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${local.name}-igw"
  }
}

# ---------------------------------------------------------------------------
# Subnets — 3 public, 3 private (NAT-routed), 3 isolated (DB-only)
# ---------------------------------------------------------------------------

resource "aws_subnet" "public" {
  count                   = 3
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${local.name}-public-${var.azs[count.index]}"
    Tier = "public"
  }
}

resource "aws_subnet" "private" {
  count             = 3
  vpc_id            = aws_vpc.this.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.azs[count.index]

  tags = {
    Name = "${local.name}-private-${var.azs[count.index]}"
    Tier = "private"
  }
}

resource "aws_subnet" "isolated" {
  count             = 3
  vpc_id            = aws_vpc.this.id
  cidr_block        = var.isolated_subnet_cidrs[count.index]
  availability_zone = var.azs[count.index]

  tags = {
    Name = "${local.name}-isolated-${var.azs[count.index]}"
    Tier = "isolated"
  }
}

# ---------------------------------------------------------------------------
# Route tables
# ---------------------------------------------------------------------------

# Public — default route to IGW
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${local.name}-rt-public"
  }
}

resource "aws_route" "public_default" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = 3
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private — one route table per AZ. Default route to NAT instance is added
# OUTSIDE this module by `modules/nat-instance/` so it can reference the ENI.
resource "aws_route_table" "private" {
  count  = 3
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${local.name}-rt-private-${var.azs[count.index]}"
  }
}

resource "aws_route_table_association" "private" {
  count          = 3
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# Isolated — no route to internet at all. Only local VPC + (optional) gateway
# endpoints for S3/DynamoDB.
resource "aws_route_table" "isolated" {
  count  = 3
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${local.name}-rt-isolated-${var.azs[count.index]}"
  }
}

resource "aws_route_table_association" "isolated" {
  count          = 3
  subnet_id      = aws_subnet.isolated[count.index].id
  route_table_id = aws_route_table.isolated[count.index].id
}

# ---------------------------------------------------------------------------
# Security groups
# ---------------------------------------------------------------------------

# ALB — public ingress on 80/443
resource "aws_security_group" "alb" {
  name        = "${local.name}-sg-alb"
  description = "ALB ingress 80/443 from internet"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${local.name}-sg-alb"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from internet"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from internet"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_egress_all" {
  security_group_id = aws_security_group.alb.id
  description       = "Allow all egress"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ECS Tasks — only ALB SG can reach the container ports
resource "aws_security_group" "ecs_tasks" {
  name        = "${local.name}-sg-ecs-tasks"
  description = "ECS Fargate task ingress from ALB only"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${local.name}-sg-ecs-tasks"
  }
}

resource "aws_vpc_security_group_ingress_rule" "ecs_tasks_from_alb" {
  for_each = toset([for p in var.container_ports : tostring(p)])

  security_group_id            = aws_security_group.ecs_tasks.id
  description                  = "Container port from ALB"
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = tonumber(each.value)
  to_port                      = tonumber(each.value)
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "ecs_tasks_egress_all" {
  security_group_id = aws_security_group.ecs_tasks.id
  description       = "Allow all egress"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# Lambda — egress only (lives in private subnets)
resource "aws_security_group" "lambda" {
  name        = "${local.name}-sg-lambda"
  description = "Lambda functions in private subnets - egress only"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${local.name}-sg-lambda"
  }
}

resource "aws_vpc_security_group_egress_rule" "lambda_egress_all" {
  security_group_id = aws_security_group.lambda.id
  description       = "Allow all egress"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# RDS Proxy — accepts 5432 from ECS + Lambda; egress to Aurora 5432
resource "aws_security_group" "rds_proxy" {
  name        = "${local.name}-sg-rds-proxy"
  description = "RDS Proxy ingress from ECS/Lambda; egress to Aurora"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${local.name}-sg-rds-proxy"
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_proxy_from_ecs" {
  security_group_id            = aws_security_group.rds_proxy.id
  description                  = "Postgres from ECS tasks"
  referenced_security_group_id = aws_security_group.ecs_tasks.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "rds_proxy_from_lambda" {
  security_group_id            = aws_security_group.rds_proxy.id
  description                  = "Postgres from Lambda"
  referenced_security_group_id = aws_security_group.lambda.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

# Aurora — accepts 5432 from ECS, Lambda, and RDS Proxy
resource "aws_security_group" "aurora" {
  name        = "${local.name}-sg-aurora"
  description = "Aurora cluster ingress from ECS/Lambda/RDS-Proxy"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${local.name}-sg-aurora"
  }
}

resource "aws_vpc_security_group_ingress_rule" "aurora_from_ecs" {
  security_group_id            = aws_security_group.aurora.id
  description                  = "Postgres from ECS tasks"
  referenced_security_group_id = aws_security_group.ecs_tasks.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "aurora_from_lambda" {
  security_group_id            = aws_security_group.aurora.id
  description                  = "Postgres from Lambda"
  referenced_security_group_id = aws_security_group.lambda.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "aurora_from_rds_proxy" {
  security_group_id            = aws_security_group.aurora.id
  description                  = "Postgres from RDS Proxy"
  referenced_security_group_id = aws_security_group.rds_proxy.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "rds_proxy_to_aurora" {
  security_group_id            = aws_security_group.rds_proxy.id
  description                  = "Egress to Aurora 5432"
  referenced_security_group_id = aws_security_group.aurora.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

# NAT instance — accepts 443 from VPC CIDR; egress all
resource "aws_security_group" "nat" {
  name        = "${local.name}-sg-nat"
  description = "NAT instance ingress from VPC for SaaS egress"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${local.name}-sg-nat"
  }
}

resource "aws_vpc_security_group_ingress_rule" "nat_https_from_vpc" {
  security_group_id = aws_security_group.nat.id
  description       = "HTTPS from within the VPC"
  cidr_ipv4         = var.vpc_cidr
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "nat_egress_all" {
  security_group_id = aws_security_group.nat.id
  description       = "Allow all egress"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# VPC endpoints — accepts 443 from VPC CIDR (interface endpoint clients)
resource "aws_security_group" "vpc_endpoints" {
  name        = "${local.name}-sg-vpc-endpoints"
  description = "Interface VPC endpoints - HTTPS from VPC"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${local.name}-sg-vpc-endpoints"
  }
}

resource "aws_vpc_security_group_ingress_rule" "vpc_endpoints_https" {
  security_group_id = aws_security_group.vpc_endpoints.id
  description       = "HTTPS from within the VPC"
  cidr_ipv4         = var.vpc_cidr
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

# ---------------------------------------------------------------------------
# VPC endpoints — gateway (S3, DynamoDB) and interface (PrivateLink)
# ---------------------------------------------------------------------------

# Gateway endpoints (free) — attached to private + isolated route tables.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = concat(aws_route_table.private[*].id, aws_route_table.isolated[*].id)

  tags = {
    Name = "${local.name}-vpce-s3"
  }
}

resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${var.aws_region}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = concat(aws_route_table.private[*].id, aws_route_table.isolated[*].id)

  tags = {
    Name = "${local.name}-vpce-dynamodb"
  }
}

# Interface endpoints — across all 3 private subnets, private DNS enabled.
resource "aws_vpc_endpoint" "interface" {
  for_each = toset(local.interface_endpoints)

  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${var.aws_region}.${each.value}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name = "${local.name}-vpce-${replace(each.value, ".", "-")}"
  }
}
