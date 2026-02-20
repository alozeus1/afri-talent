# ─────────────────────────────────────────────────────────────────────────────
# AWS App Runner Module - Cost-effective alternative to ECS Fargate
# Reduces compute costs from ~$70/month to ~$25/month
# ─────────────────────────────────────────────────────────────────────────────

# ── IAM Role for App Runner to pull from ECR ─────────────────────────────────

resource "aws_iam_role" "apprunner_ecr_access" {
  name = "${var.name_prefix}-apprunner-ecr-access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "build.apprunner.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_policy" {
  role       = aws_iam_role.apprunner_ecr_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# ── IAM Role for App Runner instance (task role equivalent) ──────────────────

resource "aws_iam_role" "apprunner_instance" {
  name = "${var.name_prefix}-apprunner-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "tasks.apprunner.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "apprunner_secrets_access" {
  name = "${var.name_prefix}-secrets-access"
  role = aws_iam_role.apprunner_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = var.secret_arns
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = var.s3_bucket_arns
      }
    ]
  })
}

# ── VPC Connector for RDS access ─────────────────────────────────────────────

resource "aws_apprunner_vpc_connector" "main" {
  vpc_connector_name = "${var.name_prefix}-connector"
  subnets            = var.private_subnet_ids
  security_groups    = [var.security_group_id]
}

# ── Backend Service ──────────────────────────────────────────────────────────

resource "aws_apprunner_service" "backend" {
  service_name = "${var.name_prefix}-backend"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }

    image_repository {
      image_identifier      = var.backend_image
      image_repository_type = "ECR"
      image_configuration {
        port = tostring(var.backend_port)
        runtime_environment_variables = {
          NODE_ENV     = "production"
          PORT         = tostring(var.backend_port)
          FRONTEND_URL = var.frontend_url
        }
        runtime_environment_secrets = {
          DATABASE_URL      = "${var.secret_arn}:DATABASE_URL::"
          JWT_SECRET        = "${var.secret_arn}:JWT_SECRET::"
          ANTHROPIC_API_KEY = "${var.secret_arn}:ANTHROPIC_API_KEY::"
        }
      }
    }

    auto_deployments_enabled = false
  }

  instance_configuration {
    cpu               = var.backend_cpu
    memory            = var.backend_memory
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.main.arn
    }
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = var.backend_health_path
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.backend.arn

  tags = {
    Name        = "${var.name_prefix}-backend"
    Environment = var.environment
  }
}

resource "aws_apprunner_auto_scaling_configuration_version" "backend" {
  auto_scaling_configuration_name = "${var.name_prefix}-backend-scaling"
  min_size                        = var.backend_min_size
  max_size                        = var.backend_max_size
  max_concurrency                 = var.backend_max_concurrency
}

# ── Frontend Service ─────────────────────────────────────────────────────────

resource "aws_apprunner_service" "frontend" {
  service_name = "${var.name_prefix}-frontend"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }

    image_repository {
      image_identifier      = var.frontend_image
      image_repository_type = "ECR"
      image_configuration {
        port = tostring(var.frontend_port)
        runtime_environment_variables = {
          NODE_ENV                = "production"
          NEXT_PUBLIC_API_URL     = var.backend_url
          NEXT_PUBLIC_BACKEND_URL = var.backend_url
        }
      }
    }

    auto_deployments_enabled = false
  }

  instance_configuration {
    cpu    = var.frontend_cpu
    memory = var.frontend_memory
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = var.frontend_health_path
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.frontend.arn

  tags = {
    Name        = "${var.name_prefix}-frontend"
    Environment = var.environment
  }
}

resource "aws_apprunner_auto_scaling_configuration_version" "frontend" {
  auto_scaling_configuration_name = "${var.name_prefix}-frontend-scaling"
  min_size                        = var.frontend_min_size
  max_size                        = var.frontend_max_size
  max_concurrency                 = var.frontend_max_concurrency
}

# ── Custom Domain Associations (optional) ────────────────────────────────────

resource "aws_apprunner_custom_domain_association" "backend" {
  count = var.api_domain_name != "" ? 1 : 0

  domain_name          = var.api_domain_name
  service_arn          = aws_apprunner_service.backend.arn
  enable_www_subdomain = false
}

resource "aws_apprunner_custom_domain_association" "frontend" {
  count = var.frontend_domain_name != "" ? 1 : 0

  domain_name          = var.frontend_domain_name
  service_arn          = aws_apprunner_service.frontend.arn
  enable_www_subdomain = false
}
