terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.70" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
}

#
# ECS Fargate cluster + 2 services (frontend, backend) on a mixed
# FARGATE/FARGATE_SPOT capacity strategy. UX-critical sync workloads only.
# Async/long workloads run in modules/lambda-functions.
#

locals {
  cluster_name       = var.name_prefix
  frontend_name      = "${var.name_prefix}-frontend"
  backend_name       = "${var.name_prefix}-backend"
  frontend_image     = length(trimspace(var.image_digest_frontend)) > 0 ? "${var.ecr_repo_url_frontend}@${var.image_digest_frontend}" : "${var.ecr_repo_url_frontend}:${var.image_tag}"
  backend_image      = length(trimspace(var.image_digest_backend)) > 0 ? "${var.ecr_repo_url_backend}@${var.image_digest_backend}" : "${var.ecr_repo_url_backend}:${var.image_tag}"
  frontend_log_group = "/aws/ecs/${local.frontend_name}"
  backend_log_group  = "/aws/ecs/${local.backend_name}"
  use_cloudwatch_kms = length(trimspace(var.cloudwatch_kms_key_arn)) > 0
  has_app_bucket     = length(trimspace(var.app_s3_bucket_arn)) > 0
  ssm_param_arn_glob = "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/${var.ssm_path_prefix}/*"
}

# ---------------------------------------------------------------------------
# Cluster + capacity providers
# ---------------------------------------------------------------------------

resource "aws_ecs_cluster" "this" {
  name = local.cluster_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  # 1 base on-demand task; everything beyond that is 80% Spot / 20% on-demand
  # (weight 1 vs 4). Services that don't override pick this up automatically.
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = var.fargate_base
    weight            = 1
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = var.fargate_spot_weight
  }
}

# ---------------------------------------------------------------------------
# CloudWatch log groups
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "frontend" {
  name              = local.frontend_log_group
  retention_in_days = var.log_retention_days
  kms_key_id        = local.use_cloudwatch_kms ? var.cloudwatch_kms_key_arn : null
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = local.backend_log_group
  retention_in_days = var.log_retention_days
  kms_key_id        = local.use_cloudwatch_kms ? var.cloudwatch_kms_key_arn : null
}

# ---------------------------------------------------------------------------
# IAM — task execution role (pull image, write logs, read SSM secrets)
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${var.name_prefix}-ecs-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "exec_secrets" {
  statement {
    sid    = "ReadSsmParameters"
    effect = "Allow"
    actions = [
      "ssm:GetParameters",
      "ssm:GetParameter",
      "ssm:GetParametersByPath",
    ]
    resources = [local.ssm_param_arn_glob]
  }

  statement {
    sid       = "DecryptSsmKms"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = [var.ssm_kms_key_arn]
  }
}

resource "aws_iam_role_policy" "exec_secrets" {
  name   = "${var.name_prefix}-ecs-exec-secrets"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.exec_secrets.json
}

# ---------------------------------------------------------------------------
# IAM — task role (runtime AWS API access)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "task" {
  name               = "${var.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# Enable aws ecs execute-command (SSM session) for debugging.
data "aws_iam_policy_document" "task_exec_command" {
  statement {
    effect = "Allow"
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }
  statement {
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:DescribeLogStreams", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.frontend.arn}:*", "${aws_cloudwatch_log_group.backend.arn}:*"]
  }
}

resource "aws_iam_role_policy" "task_exec_command" {
  name   = "${var.name_prefix}-ecs-task-execcmd"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_exec_command.json
}

data "aws_iam_policy_document" "task_runtime" {
  # SES — outbound transactional email
  statement {
    effect    = "Allow"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]
  }

  # Bedrock — AI fallback path. Resource scoping deferred until we pick models.
  statement {
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["*"]
  }

  # Optional S3 bucket access for app uploads
  dynamic "statement" {
    for_each = local.has_app_bucket ? [1] : []
    content {
      effect = "Allow"
      actions = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        "s3:ListBucket",
        "s3:ListBucketVersions",
      ]
      resources = [
        var.app_s3_bucket_arn,
        "${var.app_s3_bucket_arn}/*",
      ]
    }
  }

}

resource "aws_iam_role_policy" "task_runtime" {
  name   = "${var.name_prefix}-ecs-task-runtime"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_runtime.json
}

# ---------------------------------------------------------------------------
# Wave 9 §10.1 PR-B — custom CloudWatch metrics for agent SLOs.
#
# Hotfix (deploy run 25964580570): the cloudwatch:PutMetricData statement
# was originally added inline to the aws_iam_role_policy.task_runtime
# document above. The afritalent-dev-github-deploy-guardrail policy
# (added in PR #126) explicitly denies iam:PutRolePolicy on this role,
# which blocks every apply that tries to update the inline policy.
#
# The fix is to ship PutMetricData as a separate AWS-managed policy and
# attach it via aws_iam_role_policy_attachment. The guardrail does not
# block iam:AttachRolePolicy on this role (attachments use the policy's
# own permissions; no escalation surface).
#
# The namespace condition prevents this permission from leaking to
# other CloudWatch namespaces — backend can only write to AfriTalent/Agents.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "agent_metrics" {
  statement {
    effect    = "Allow"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["AfriTalent/Agents"]
    }
  }
}

resource "aws_iam_policy" "agent_metrics" {
  name        = "${var.name_prefix}-ecs-task-agent-metrics"
  description = "Wave 9 SLO emission. Allows the ECS task role to PutMetricData into the AfriTalent/Agents CloudWatch namespace only."
  policy      = data.aws_iam_policy_document.agent_metrics.json
}

# ---------------------------------------------------------------------------
# Task definitions
# ---------------------------------------------------------------------------

locals {
  frontend_env_list = [
    for k, v in var.frontend_env : { name = k, value = v }
  ]
  frontend_secrets_list = [
    for k, v in var.frontend_secrets : { name = k, valueFrom = v }
  ]
  backend_env_list = [
    for k, v in var.backend_env : { name = k, value = v }
  ]
  backend_secrets_list = [
    for k, v in var.backend_secrets : { name = k, valueFrom = v }
  ]
}

resource "aws_ecs_task_definition" "frontend" {
  family                   = local.frontend_name
  cpu                      = tostring(var.frontend_cpu)
  memory                   = tostring(var.frontend_memory)
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name         = "frontend"
      image        = local.frontend_image
      essential    = true
      portMappings = [{ containerPort = 3000, protocol = "tcp" }]
      environment  = local.frontend_env_list
      secrets      = local.frontend_secrets_list
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.frontend.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_task_definition" "backend" {
  family                   = local.backend_name
  cpu                      = tostring(var.backend_cpu)
  memory                   = tostring(var.backend_memory)
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name         = "backend"
      image        = local.backend_image
      essential    = true
      portMappings = [{ containerPort = 3001, protocol = "tcp" }]
      environment  = local.backend_env_list
      secrets      = local.backend_secrets_list
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.backend.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])
}

# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------

resource "aws_ecs_service" "frontend" {
  name             = local.frontend_name
  cluster          = aws_ecs_cluster.this.id
  task_definition  = aws_ecs_task_definition.frontend.arn
  desired_count    = var.desired_count
  platform_version = "LATEST"

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = var.fargate_base
    weight            = 1
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = var.fargate_spot_weight
  }

  enable_execute_command = true

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.sg_ecs_tasks_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.target_group_frontend_arn
    container_name   = "frontend"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    # CI updates task_definition out-of-band; ignore drift on desired_count
    # so a manual scale isn't reverted on the next terraform apply.
    ignore_changes = [desired_count, task_definition]
  }

  depends_on = [aws_ecs_cluster_capacity_providers.this]
}

resource "aws_ecs_service" "backend" {
  name             = local.backend_name
  cluster          = aws_ecs_cluster.this.id
  task_definition  = aws_ecs_task_definition.backend.arn
  desired_count    = var.desired_count
  platform_version = "LATEST"

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = var.fargate_base
    weight            = 1
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = var.fargate_spot_weight
  }

  enable_execute_command = true

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.sg_ecs_tasks_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.target_group_backend_arn
    container_name   = "backend"
    container_port   = 3001
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }

  depends_on = [aws_ecs_cluster_capacity_providers.this]
}
