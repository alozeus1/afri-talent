terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.70" }
  }
}

locals {
  service_name = "${var.name_prefix}-pdf-renderer"
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/ecs/${local.service_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.log_kms_key_arn != "" ? var.log_kms_key_arn : null
  tags              = var.tags
}

resource "aws_ecs_task_definition" "this" {
  family                   = local.service_name
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  ephemeral_storage { size_in_gib = var.ephemeral_storage_gib }

  container_definitions = jsonencode([{
    name                   = "pdf-renderer"
    image                  = var.image_ref
    essential              = true
    readonlyRootFilesystem = true
    privileged             = false
    portMappings           = [{ containerPort = 8080, protocol = "tcp" }]
    linuxParameters = {
      initProcessEnabled = true
      capabilities       = { drop = ["ALL"] }
    }
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PDF_RENDERER_MAX_INPUT_BYTES", value = tostring(var.max_input_bytes) },
      { name = "PDF_RENDERER_MAX_OUTPUT_BYTES", value = tostring(var.max_output_bytes) },
      { name = "PDF_RENDERER_MAX_CONCURRENCY", value = tostring(var.max_concurrency) },
      { name = "PDF_RENDERER_TIMEOUT_MS", value = tostring(var.timeout_ms) },
    ]
    secrets = [{ name = "PDF_RENDERER_SHARED_SECRET", valueFrom = var.shared_secret_arn }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.this.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])

  tags = merge(var.tags, { Component = "pdf-renderer" })
}

resource "aws_ecs_service" "this" {
  name             = local.service_name
  cluster          = var.cluster_arn
  task_definition  = aws_ecs_task_definition.this.arn
  desired_count    = var.desired_count
  launch_type      = "FARGATE"
  platform_version = "LATEST"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.security_group_id]
    assign_public_ip = false
  }

  service_registries { registry_arn = var.service_discovery_service_arn }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  depends_on = [aws_cloudwatch_log_group.this]
}
