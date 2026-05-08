terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

############################################
# Locals
############################################

locals {
  name_prefix = var.name_prefix

  log_groups = {
    waf       = "/aws/waf/${var.name_prefix}"
    alb       = "/aws/alb/${var.name_prefix}"
    flow_logs = "/aws/vpc/flow-logs/${var.name_prefix}"
  }
}

data "aws_region" "current" {}

############################################
# CloudWatch log groups (cross-cutting only)
############################################

resource "aws_cloudwatch_log_group" "this" {
  for_each = local.log_groups

  name              = each.value
  retention_in_days = var.log_retention_days

  tags = merge(var.tags, { Name = each.value })
}

############################################
# VPC Flow Logs — IAM role + flow log
############################################

data "aws_iam_policy_document" "flow_logs_assume" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "flow_logs" {
  name               = "${local.name_prefix}-vpc-flow-logs"
  assume_role_policy = data.aws_iam_policy_document.flow_logs_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "flow_logs" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "flow_logs" {
  name   = "${local.name_prefix}-vpc-flow-logs"
  role   = aws_iam_role.flow_logs.id
  policy = data.aws_iam_policy_document.flow_logs.json
}

resource "aws_flow_log" "vpc" {
  iam_role_arn         = aws_iam_role.flow_logs.arn
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.this["flow_logs"].arn
  traffic_type         = "ALL"
  vpc_id               = var.vpc_id

  tags = merge(var.tags, { Name = "${local.name_prefix}-vpc-flow-log" })
}

############################################
# CloudWatch dashboard
############################################

locals {
  dashboard_name = "${local.name_prefix}-overview"
  region         = data.aws_region.current.name

  # Build metric tuples as JSON strings (Terraform list elements must share
  # a type; metric tuples mix strings + maps). They are jsondecoded into
  # heterogeneous arrays for the dashboard body.
  ecs_metrics_raw = compact([
    var.ecs_cluster_name != "" && var.ecs_service_frontend_name != "" ? jsonencode(["AWS/ECS", "CPUUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_frontend_name]) : "",
    var.ecs_cluster_name != "" && var.ecs_service_backend_name != "" ? jsonencode(["AWS/ECS", "CPUUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_backend_name]) : "",
    var.ecs_cluster_name != "" && var.ecs_service_frontend_name != "" ? jsonencode(["AWS/ECS", "MemoryUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_frontend_name]) : "",
    var.ecs_cluster_name != "" && var.ecs_service_backend_name != "" ? jsonencode(["AWS/ECS", "MemoryUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_backend_name]) : "",
  ])

  alb_metrics_raw = compact([
    var.alb_arn_suffix != "" ? jsonencode(["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix]) : "",
    var.alb_arn_suffix != "" ? jsonencode(["AWS/ApplicationELB", "HTTPCode_ELB_5XX_Count", "LoadBalancer", var.alb_arn_suffix]) : "",
    var.alb_arn_suffix != "" ? jsonencode(["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", var.alb_arn_suffix]) : "",
    var.target_group_frontend_arn_suffix != "" && var.alb_arn_suffix != "" ? jsonencode(["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", var.target_group_frontend_arn_suffix, "LoadBalancer", var.alb_arn_suffix, { stat = "Average" }]) : "",
    var.target_group_backend_arn_suffix != "" && var.alb_arn_suffix != "" ? jsonencode(["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", var.target_group_backend_arn_suffix, "LoadBalancer", var.alb_arn_suffix, { stat = "Average" }]) : "",
  ])

  lambda_metrics_raw = flatten([
    for fn in var.lambda_function_names : [
      jsonencode(["AWS/Lambda", "Invocations", "FunctionName", fn]),
      jsonencode(["AWS/Lambda", "Errors", "FunctionName", fn]),
      jsonencode(["AWS/Lambda", "Duration", "FunctionName", fn, { stat = "Average" }]),
    ]
  ])

  aurora_metrics_raw = compact([
    var.aurora_cluster_identifier != "" ? jsonencode(["AWS/RDS", "ServerlessDatabaseCapacity", "DBClusterIdentifier", var.aurora_cluster_identifier]) : "",
    var.aurora_cluster_identifier != "" ? jsonencode(["AWS/RDS", "DatabaseConnections", "DBClusterIdentifier", var.aurora_cluster_identifier]) : "",
    var.aurora_cluster_identifier != "" ? jsonencode(["AWS/RDS", "CPUUtilization", "DBClusterIdentifier", var.aurora_cluster_identifier]) : "",
  ])

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "ECS Service CPU/Memory"
          view    = "timeSeries"
          region  = local.region
          stat    = "Average"
          period  = 300
          metrics = [for m in local.ecs_metrics_raw : jsondecode(m)]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "ALB Requests / 5xx / Healthy Hosts"
          view    = "timeSeries"
          region  = local.region
          stat    = "Sum"
          period  = 60
          metrics = [for m in local.alb_metrics_raw : jsondecode(m)]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Lambda Invocations / Errors / Duration"
          view    = "timeSeries"
          region  = local.region
          stat    = "Sum"
          period  = 60
          metrics = [for m in local.lambda_metrics_raw : jsondecode(m)]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Aurora ACU / Connections / CPU"
          view    = "timeSeries"
          region  = local.region
          stat    = "Average"
          period  = 300
          metrics = [for m in local.aurora_metrics_raw : jsondecode(m)]
        }
      },
    ]
  })
}

resource "aws_cloudwatch_dashboard" "overview" {
  dashboard_name = local.dashboard_name
  dashboard_body = local.dashboard_body
}
