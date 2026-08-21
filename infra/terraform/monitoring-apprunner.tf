data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "ops_alerts_kms" {
  count = var.enable_ops_monitoring ? 1 : 0

  statement {
    sid       = "EnableAccountRootAdministration"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid       = "AllowSnsTopicEncryption"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["sns.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_kms_key" "ops_alerts" {
  count                   = var.enable_ops_monitoring ? 1 : 0
  description             = "Encrypts AfriTalent operations alert SNS messages"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.ops_alerts_kms[0].json
  tags                    = local.tags
}

locals {
  backend_apprunner_service_name  = var.apprunner_backend_service_name != "" ? var.apprunner_backend_service_name : "${local.name_prefix}-appr-backend-managed"
  frontend_apprunner_service_name = var.apprunner_frontend_service_name != "" ? var.apprunner_frontend_service_name : "${local.name_prefix}-appr-frontend-managed"

  backend_service_id  = coalesce(try(module.apprunner.backend_service_id, null), "pending-backend-service")
  frontend_service_id = coalesce(try(module.apprunner.frontend_service_id, null), "pending-frontend-service")

  backend_application_log_group  = "/aws/apprunner/${local.backend_apprunner_service_name}/${local.backend_service_id}/application"
  frontend_application_log_group = "/aws/apprunner/${local.frontend_apprunner_service_name}/${local.frontend_service_id}/application"

  ops_metric_namespace = "${var.project_name}/${var.environment}/platform"

  ops_count_metric_filters = {
    login_success = {
      metric_name = "LoginSuccessCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"login_success\" }"
    }
    login_failure = {
      metric_name = "LoginFailureCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"login_failure\" }"
    }
    signup_success = {
      metric_name = "SignupSuccessCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"signup_success\" }"
    }
    signup_failure = {
      metric_name = "SignupFailureCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"signup_failure\" }"
    }
    verification_email_sent = {
      metric_name = "VerificationEmailSentCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"verification_email_sent\" }"
    }
    verification_verify_success = {
      metric_name = "VerificationVerifySuccessCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"verification_verify_success\" }"
    }
    verification_verify_failure = {
      metric_name = "VerificationVerifyFailureCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"verification_verify_failure\" }"
    }
    billing_checkout_session_success = {
      metric_name = "BillingCheckoutSessionSuccessCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"billing_checkout_session_success\" }"
    }
    billing_checkout_success = {
      metric_name = "BillingCheckoutSuccessCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"billing_checkout_success\" }"
    }
    billing_checkout_failure = {
      metric_name = "BillingCheckoutFailureCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"billing_checkout_failure\" }"
    }
    job_publish_success = {
      metric_name = "JobPublishSuccessCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"job_publish_success\" }"
    }
    job_publish_held = {
      metric_name = "JobPublishHeldCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"job_publish_held\" }"
    }
    job_publish_failure = {
      metric_name = "JobPublishFailureCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"job_publish_failure\" }"
    }
    application_submission_success = {
      metric_name = "ApplicationSubmissionSuccessCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"application_submission_success\" }"
    }
    application_submission_held = {
      metric_name = "ApplicationSubmissionHeldCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"application_submission_held\" }"
    }
    application_submission_failure = {
      metric_name = "ApplicationSubmissionFailureCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"application_submission_failure\" }"
    }
    notification_delivery_success = {
      metric_name = "NotificationDeliverySuccessCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"notification_delivery_success\" }"
    }
    notification_delivery_failure = {
      metric_name = "NotificationDeliveryFailureCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"notification_delivery_failure\" }"
    }
    scheduler_task_failure = {
      metric_name = "SchedulerTaskFailureCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"scheduler_task_failure\" }"
    }
    ingestion_source_fetch_failure = {
      metric_name = "IngestionSourceFetchFailureCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_failure\" }"
    }
    source_fetch_success = {
      metric_name = "SourceFetchSuccessCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_success\" }"
    }
    source_fetch_failure = {
      metric_name = "SourceFetchFailureCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_failure\" }"
    }
    source_fetch_success_greenhouse = {
      metric_name = "SourceFetchSuccessCountGreenhouse"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_success\" && $.details.source = \"GREENHOUSE\" }"
    }
    source_fetch_success_lever = {
      metric_name = "SourceFetchSuccessCountLever"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_success\" && $.details.source = \"LEVER\" }"
    }
    source_fetch_success_workable = {
      metric_name = "SourceFetchSuccessCountWorkable"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_success\" && $.details.source = \"WORKABLE\" }"
    }
    source_fetch_failure_greenhouse = {
      metric_name = "SourceFetchFailureCountGreenhouse"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_failure\" && $.details.source = \"GREENHOUSE\" }"
    }
    source_fetch_failure_lever = {
      metric_name = "SourceFetchFailureCountLever"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_failure\" && $.details.source = \"LEVER\" }"
    }
    source_fetch_failure_workable = {
      metric_name = "SourceFetchFailureCountWorkable"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_failure\" && $.details.source = \"WORKABLE\" }"
    }
    source_fetch_failure_reason_network = {
      metric_name = "SourceFetchFailureCountNetwork"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_failure\" && $.details.reason = \"network\" }"
    }
    source_fetch_failure_reason_auth = {
      metric_name = "SourceFetchFailureCountAuth"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_failure\" && $.details.reason = \"auth\" }"
    }
    source_fetch_failure_reason_rate_limited = {
      metric_name = "SourceFetchFailureCountRateLimited"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_failure\" && $.details.reason = \"rate_limited\" }"
    }
  }

  ops_value_metric_filters = {
    job_search_latency = {
      metric_name = "JobSearchLatencyMs"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"job_search_latency\" }"
      unit        = "Milliseconds"
    }
    moderation_queue_backlog = {
      metric_name = "ModerationQueueBacklog"
      pattern     = "{ $.event_type = \"ops_snapshot\" && $.metric_name = \"moderation_queue_backlog\" }"
      unit        = "Count"
    }
    employer_verification_queue_backlog = {
      metric_name = "EmployerVerificationQueueBacklog"
      pattern     = "{ $.event_type = \"ops_snapshot\" && $.metric_name = \"employer_verification_queue_backlog\" }"
      unit        = "Count"
    }
    job_ingestion_freshness_minutes = {
      metric_name = "JobIngestionFreshnessMinutes"
      pattern     = "{ $.event_type = \"ops_snapshot\" && $.metric_name = \"job_ingestion_freshness_minutes\" }"
      unit        = "Count"
    }
    last_successful_ingestion_timestamp = {
      metric_name = "LastSuccessfulIngestionTimestamp"
      pattern     = "{ $.event_type = \"ops_snapshot\" && $.metric_name = \"last_successful_ingestion_timestamp\" }"
      unit        = "Count"
    }
    ingestion_cycle_status = {
      metric_name = "IngestionCycleStatus"
      pattern     = "{ $.event_type = \"ops_snapshot\" && $.metric_name = \"ingestion_cycle_status\" }"
      unit        = "Count"
    }
    consecutive_failure_count = {
      metric_name = "ConsecutiveFailureCount"
      pattern     = "{ $.event_type = \"ops_snapshot\" && $.metric_name = \"consecutive_failure_count\" }"
      unit        = "Count"
    }
    consecutive_zero_result_count = {
      metric_name = "ConsecutiveZeroResultCount"
      pattern     = "{ $.event_type = \"ops_snapshot\" && $.metric_name = \"consecutive_zero_result_count\" }"
      unit        = "Count"
    }
    jobs_ingested_per_cycle = {
      metric_name = "JobsIngestedPerCycle"
      pattern     = "{ $.event_type = \"ops_snapshot\" && $.metric_name = \"jobs_ingested_per_cycle\" }"
      unit        = "Count"
    }
    source_fetch_latency = {
      metric_name = "SourceFetchLatencyMs"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_latency\" }"
      unit        = "Milliseconds"
    }
    source_fetch_error = {
      metric_name = "SourceFetchErrorCount"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_error\" }"
      unit        = "Count"
    }
    source_fetch_error_greenhouse = {
      metric_name = "SourceFetchErrorCountGreenhouse"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_error\" && $.details.source = \"GREENHOUSE\" }"
      unit        = "Count"
    }
    source_fetch_error_lever = {
      metric_name = "SourceFetchErrorCountLever"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_error\" && $.details.source = \"LEVER\" }"
      unit        = "Count"
    }
    source_fetch_error_workable = {
      metric_name = "SourceFetchErrorCountWorkable"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_error\" && $.details.source = \"WORKABLE\" }"
      unit        = "Count"
    }
    source_fetch_latency_greenhouse = {
      metric_name = "SourceFetchLatencyMsGreenhouse"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_latency\" && $.details.source = \"GREENHOUSE\" }"
      unit        = "Milliseconds"
    }
    source_fetch_latency_lever = {
      metric_name = "SourceFetchLatencyMsLever"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_latency\" && $.details.source = \"LEVER\" }"
      unit        = "Milliseconds"
    }
    source_fetch_latency_workable = {
      metric_name = "SourceFetchLatencyMsWorkable"
      pattern     = "{ $.event_type = \"ops_metric\" && $.metric_name = \"source_fetch_latency\" && $.details.source = \"WORKABLE\" }"
      unit        = "Milliseconds"
    }
    fraud_detections_24h = {
      metric_name = "FraudDetections24h"
      pattern     = "{ $.event_type = \"ops_snapshot\" && $.metric_name = \"fraud_detections_24h\" }"
      unit        = "Count"
    }
    dead_letter_backlog = {
      metric_name = "DeadLetterBacklog"
      pattern     = "{ $.event_type = \"ops_snapshot\" && $.metric_name = \"dead_letter_backlog\" }"
      unit        = "Count"
    }
  }
}

resource "aws_sns_topic" "ops_critical" {
  count             = var.enable_ops_monitoring ? 1 : 0
  name              = "${local.name_prefix}-ops-critical"
  kms_master_key_id = aws_kms_key.ops_alerts[0].arn
  tags              = local.tags
}

resource "aws_sns_topic" "ops_warning" {
  count             = var.enable_ops_monitoring ? 1 : 0
  name              = "${local.name_prefix}-ops-warning"
  kms_master_key_id = aws_kms_key.ops_alerts[0].arn
  tags              = local.tags
}

resource "aws_sns_topic_subscription" "ops_critical_email" {
  count     = var.enable_ops_monitoring && var.alerts_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.ops_critical[0].arn
  protocol  = "email"
  endpoint  = var.alerts_email
}

resource "aws_sns_topic_subscription" "ops_warning_email" {
  count     = var.enable_ops_monitoring && var.alerts_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.ops_warning[0].arn
  protocol  = "email"
  endpoint  = var.alerts_email
}

resource "aws_iam_role_policy" "cleanup_guardrails" {
  for_each = var.enable_ops_monitoring ? toset(var.cleanup_guardrail_role_names) : toset([])

  name = "${local.name_prefix}-deny-critical-network-mutations"
  role = each.value

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyNatGatewayDeletion"
        Effect = "Deny"
        Action = [
          "ec2:DeleteNatGateway",
        ]
        Resource = "*"
      },
      {
        Sid    = "DenyRouteMutations"
        Effect = "Deny"
        Action = [
          "ec2:CreateRoute",
          "ec2:ReplaceRoute",
          "ec2:DeleteRoute",
        ]
        Resource = "*"
      },
    ]
  })
}

resource "aws_cloudwatch_event_rule" "nat_gateway_deletion" {
  count = var.enable_ops_monitoring ? 1 : 0

  name        = "${local.name_prefix}-nat-gateway-deletion"
  description = "Critical event. NAT gateway deletion detected via CloudTrail. Owner: Platform On-Call."

  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["AWS API Call via CloudTrail"]
    detail = {
      eventSource = ["ec2.amazonaws.com"]
      eventName   = ["DeleteNatGateway"]
      requestParameters = {
        vpcId = [module.network.vpc_id]
      }
    }
  })
}

resource "aws_cloudwatch_event_rule" "private_route_mutation" {
  count = var.enable_ops_monitoring ? 1 : 0

  name        = "${local.name_prefix}-private-route-mutation"
  description = "Critical event. Private route table mutation detected via CloudTrail. Owner: Platform On-Call."

  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["AWS API Call via CloudTrail"]
    detail = {
      eventSource = ["ec2.amazonaws.com"]
      eventName   = ["CreateRoute", "ReplaceRoute", "DeleteRoute"]
      requestParameters = {
        routeTableId = module.network.private_route_table_ids
      }
    }
  })
}

resource "aws_cloudwatch_event_target" "nat_gateway_deletion_ops_critical" {
  count = var.enable_ops_monitoring ? 1 : 0

  rule      = aws_cloudwatch_event_rule.nat_gateway_deletion[0].name
  target_id = "ops-critical-sns"
  arn       = aws_sns_topic.ops_critical[0].arn
}

resource "aws_cloudwatch_event_target" "private_route_mutation_ops_critical" {
  count = var.enable_ops_monitoring ? 1 : 0

  rule      = aws_cloudwatch_event_rule.private_route_mutation[0].name
  target_id = "ops-critical-sns"
  arn       = aws_sns_topic.ops_critical[0].arn
}

data "aws_iam_policy_document" "ops_critical_topic_policy" {
  count = var.enable_ops_monitoring ? 1 : 0

  statement {
    sid    = "AllowAccountOwnerManagementAndPublish"
    effect = "Allow"
    actions = [
      "SNS:GetTopicAttributes",
      "SNS:SetTopicAttributes",
      "SNS:AddPermission",
      "SNS:RemovePermission",
      "SNS:DeleteTopic",
      "SNS:Subscribe",
      "SNS:ListSubscriptionsByTopic",
      "SNS:Publish",
    ]
    resources = [aws_sns_topic.ops_critical[0].arn]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceOwner"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid    = "AllowEventBridgePublish"
    effect = "Allow"
    actions = [
      "SNS:Publish",
    ]
    resources = [aws_sns_topic.ops_critical[0].arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values = [
        aws_cloudwatch_event_rule.nat_gateway_deletion[0].arn,
        aws_cloudwatch_event_rule.private_route_mutation[0].arn,
      ]
    }
  }

  statement {
    sid    = "AllowCloudWatchAlarmPublish"
    effect = "Allow"
    actions = [
      "SNS:Publish",
    ]
    resources = [aws_sns_topic.ops_critical[0].arn]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values = [
        "arn:aws:cloudwatch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:*",
      ]
    }
  }
}

resource "aws_sns_topic_policy" "ops_critical_events" {
  count = var.enable_ops_monitoring ? 1 : 0

  arn    = aws_sns_topic.ops_critical[0].arn
  policy = data.aws_iam_policy_document.ops_critical_topic_policy[0].json
}

resource "aws_cloudwatch_log_metric_filter" "ops_counts" {
  for_each = var.enable_ops_monitoring ? local.ops_count_metric_filters : {}

  name           = "${local.name_prefix}-${each.key}"
  log_group_name = local.backend_application_log_group
  pattern        = each.value.pattern

  metric_transformation {
    name      = each.value.metric_name
    namespace = local.ops_metric_namespace
    value     = "1"
    unit      = "Count"
  }

  depends_on = [module.apprunner]
}

resource "aws_cloudwatch_log_metric_filter" "ops_values" {
  for_each = var.enable_ops_monitoring ? local.ops_value_metric_filters : {}

  name           = "${local.name_prefix}-${each.key}"
  log_group_name = local.backend_application_log_group
  pattern        = each.value.pattern

  metric_transformation {
    name      = each.value.metric_name
    namespace = local.ops_metric_namespace
    value     = "$.value"
    unit      = each.value.unit
  }

  depends_on = [module.apprunner]
}

data "archive_file" "public_journey_canary" {
  count       = var.enable_ops_monitoring && var.enable_synthetic_canaries ? 1 : 0
  type        = "zip"
  source_dir  = "${path.module}/canaries/public-journey"
  output_path = "${path.module}/canaries/public-journey.zip"
}

resource "aws_iam_role" "synthetics" {
  count = var.enable_ops_monitoring && var.enable_synthetic_canaries ? 1 : 0
  name  = "${local.name_prefix}-synthetics"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "synthetics_basic" {
  count      = var.enable_ops_monitoring && var.enable_synthetic_canaries ? 1 : 0
  role       = aws_iam_role.synthetics[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "synthetics_artifacts" {
  count = var.enable_ops_monitoring && var.enable_synthetic_canaries ? 1 : 0
  name  = "${local.name_prefix}-synthetics-artifacts"
  role  = aws_iam_role.synthetics[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = [
          "${module.s3.bucket_arn}/synthetics/${local.name_prefix}/public-journey/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetBucketLocation",
          "s3:ListBucket"
        ]
        Resource = [
          module.s3.bucket_arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/cwsyn-${local.name_prefix}-public-journey*",
          "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/cwsyn-${local.name_prefix}-public-journey*:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListAllMyBuckets",
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = [
          "*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "CloudWatchSynthetics"
          }
        }
      }
    ]
  })
}

resource "aws_synthetics_canary" "public_journey" {
  count                    = var.enable_ops_monitoring && var.enable_synthetic_canaries ? 1 : 0
  name                     = "${local.name_prefix}-public-journey"
  artifact_s3_location     = "s3://${module.s3.bucket_name}/synthetics/${local.name_prefix}/public-journey/"
  execution_role_arn       = aws_iam_role.synthetics[0].arn
  handler                  = "index.handler"
  runtime_version          = "syn-nodejs-puppeteer-13.1"
  start_canary             = true
  success_retention_period = 14
  failure_retention_period = 14
  zip_file                 = data.archive_file.public_journey_canary[0].output_path

  schedule {
    expression          = var.synthetics_schedule_expression
    duration_in_seconds = 0
  }

  run_config {
    timeout_in_seconds = 60
    memory_in_mb       = 960
    environment_variables = {
      FRONTEND_URL = local.frontend_url
      BACKEND_URL  = module.apprunner.backend_service_url
    }
  }

  depends_on = [
    module.apprunner,
    aws_iam_role_policy_attachment.synthetics_basic,
    aws_iam_role_policy.synthetics_artifacts
  ]
  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "backend_5xx" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-backend-5xx-sev1"
  alarm_description   = "SEV1 platform alert. Backend App Runner 5xx responses are elevated. Owner: Platform On-Call."
  namespace           = "AWS/AppRunner"
  metric_name         = "5xxStatusResponses"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 5
  period              = 300
  statistic           = "Sum"
  treat_missing_data  = "notBreaching"
  dimensions = {
    ServiceName = local.backend_apprunner_service_name
    ServiceId   = module.apprunner.backend_service_id
  }
  alarm_actions = [aws_sns_topic.ops_critical[0].arn]
  ok_actions    = [aws_sns_topic.ops_critical[0].arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "frontend_5xx" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-frontend-5xx-sev1"
  alarm_description   = "SEV1 platform alert. Frontend App Runner 5xx responses are elevated. Owner: Platform On-Call."
  namespace           = "AWS/AppRunner"
  metric_name         = "5xxStatusResponses"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 5
  period              = 300
  statistic           = "Sum"
  treat_missing_data  = "notBreaching"
  dimensions = {
    ServiceName = local.frontend_apprunner_service_name
    ServiceId   = module.apprunner.frontend_service_id
  }
  alarm_actions = [aws_sns_topic.ops_critical[0].arn]
  ok_actions    = [aws_sns_topic.ops_critical[0].arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "backend_latency_p95" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-backend-latency-p95-sev2"
  alarm_description   = "SEV2 alert. Backend request latency p95 is above target. Owner: Backend Platform."
  namespace           = "AWS/AppRunner"
  metric_name         = "RequestLatency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 2500
  period              = 300
  extended_statistic  = "p95"
  treat_missing_data  = "notBreaching"
  dimensions = {
    ServiceName = local.backend_apprunner_service_name
    ServiceId   = module.apprunner.backend_service_id
  }
  alarm_actions = [aws_sns_topic.ops_warning[0].arn]
  ok_actions    = [aws_sns_topic.ops_warning[0].arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "frontend_latency_p95" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-frontend-latency-p95-sev2"
  alarm_description   = "SEV2 alert. Frontend latency p95 is above target. Owner: Frontend Platform."
  namespace           = "AWS/AppRunner"
  metric_name         = "RequestLatency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 3000
  period              = 300
  extended_statistic  = "p95"
  treat_missing_data  = "notBreaching"
  dimensions = {
    ServiceName = local.frontend_apprunner_service_name
    ServiceId   = module.apprunner.frontend_service_id
  }
  alarm_actions = [aws_sns_topic.ops_warning[0].arn]
  ok_actions    = [aws_sns_topic.ops_warning[0].arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "backend_cpu" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-backend-cpu-sev2"
  alarm_description   = "SEV2 alert. Backend CPU utilization is elevated. Owner: Platform."
  namespace           = "AWS/AppRunner"
  metric_name         = "CPUUtilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 80
  period              = 300
  statistic           = "Average"
  treat_missing_data  = "notBreaching"
  dimensions = {
    ServiceName = local.backend_apprunner_service_name
    ServiceId   = module.apprunner.backend_service_id
  }
  alarm_actions = [aws_sns_topic.ops_warning[0].arn]
  ok_actions    = [aws_sns_topic.ops_warning[0].arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-rds-cpu-sev1"
  alarm_description   = "SEV1 alert. Database CPU utilization is elevated and may impact core flows. Owner: Platform On-Call."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 80
  period              = 300
  statistic           = "Average"
  treat_missing_data  = "notBreaching"
  dimensions = {
    DBInstanceIdentifier = module.rds.db_instance_id
  }
  alarm_actions = [aws_sns_topic.ops_critical[0].arn]
  ok_actions    = [aws_sns_topic.ops_critical[0].arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-rds-storage-sev1"
  alarm_description   = "SEV1 alert. Database free storage is low. Owner: Platform On-Call."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  threshold           = 2147483648
  period              = 300
  statistic           = "Average"
  treat_missing_data  = "notBreaching"
  dimensions = {
    DBInstanceIdentifier = module.rds.db_instance_id
  }
  alarm_actions = [aws_sns_topic.ops_critical[0].arn]
  ok_actions    = [aws_sns_topic.ops_critical[0].arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "job_ingestion_stale" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-job-ingestion-stale-sev2"
  alarm_description   = "SEV2 alert. Last successful ingestion age is above target. Owner: Data Platform."
  namespace           = local.ops_metric_namespace
  metric_name         = "JobIngestionFreshnessMinutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = var.job_ingestion_staleness_threshold_minutes
  period              = 900
  statistic           = "Maximum"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.ops_warning[0].arn]
  ok_actions          = [aws_sns_topic.ops_warning[0].arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.ops_values]
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "ingestion_consecutive_failures" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-ingestion-consecutive-failures-sev2"
  alarm_description   = "SEV2 alert. Ingestion has consecutive failed cycles. Owner: Data Platform."
  namespace           = local.ops_metric_namespace
  metric_name         = "ConsecutiveFailureCount"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = var.ingestion_consecutive_failure_threshold
  period              = 900
  statistic           = "Maximum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops_warning[0].arn]
  ok_actions          = [aws_sns_topic.ops_warning[0].arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.ops_values]
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "ingestion_consecutive_zero_results" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-ingestion-consecutive-zero-results-sev2"
  alarm_description   = "SEV2 alert. Ingestion has consecutive zero-result cycles. Owner: Data Platform."
  namespace           = local.ops_metric_namespace
  metric_name         = "ConsecutiveZeroResultCount"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = var.ingestion_consecutive_zero_result_threshold
  period              = 900
  statistic           = "Maximum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops_warning[0].arn]
  ok_actions          = [aws_sns_topic.ops_warning[0].arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.ops_values]
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "moderation_queue_backlog" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-moderation-backlog-sev3"
  alarm_description   = "SEV3 alert. Moderation queue backlog is elevated. Owner: Trust & Safety Ops."
  namespace           = local.ops_metric_namespace
  metric_name         = "ModerationQueueBacklog"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = var.moderation_queue_backlog_threshold
  period              = 900
  statistic           = "Maximum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops_warning[0].arn]
  ok_actions          = [aws_sns_topic.ops_warning[0].arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.ops_values]
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "verification_queue_backlog" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-verification-backlog-sev3"
  alarm_description   = "SEV3 alert. Employer verification queue backlog is elevated. Owner: Trust & Safety Ops."
  namespace           = local.ops_metric_namespace
  metric_name         = "EmployerVerificationQueueBacklog"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = var.verification_queue_backlog_threshold
  period              = 900
  statistic           = "Maximum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops_warning[0].arn]
  ok_actions          = [aws_sns_topic.ops_warning[0].arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.ops_values]
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "fraud_detection_wave" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-fraud-wave-sev1"
  alarm_description   = "SEV1 alert. Fraud detections spiked and may indicate a scam wave. Owner: Trust & Safety On-Call."
  namespace           = local.ops_metric_namespace
  metric_name         = "FraudDetections24h"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.fraud_detection_wave_threshold
  period              = 900
  statistic           = "Maximum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops_critical[0].arn]
  ok_actions          = [aws_sns_topic.ops_critical[0].arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.ops_values]
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "notification_delivery_failure" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-notification-failure-sev2"
  alarm_description   = "SEV2 alert. Notification delivery failures are elevated. Owner: Platform + Messaging."
  namespace           = local.ops_metric_namespace
  metric_name         = "NotificationDeliveryFailureCount"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = var.notification_failure_threshold
  period              = 300
  statistic           = "Sum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops_warning[0].arn]
  ok_actions          = [aws_sns_topic.ops_warning[0].arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.ops_counts]
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "ingestion_egress_failure" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-ingestion-egress-failure-sev2"
  alarm_description   = "SEV2 alert. Ingestion source egress failures detected from backend runtime path. Owner: Data Platform + Platform On-Call."
  namespace           = local.ops_metric_namespace
  metric_name         = "IngestionSourceFetchFailureCount"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = var.ingestion_egress_failure_threshold
  period              = 300
  statistic           = "Sum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops_critical[0].arn]
  ok_actions          = [aws_sns_topic.ops_critical[0].arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.ops_counts]
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "ingestion_source_failure_spike_greenhouse" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-source-failure-spike-greenhouse-sev3"
  alarm_description   = "SEV3 alert. Greenhouse source failures are elevated. Owner: Data Platform."
  namespace           = local.ops_metric_namespace
  metric_name         = "SourceFetchFailureCountGreenhouse"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = var.ingestion_source_failure_spike_threshold
  period              = 900
  statistic           = "Sum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops_warning[0].arn]
  ok_actions          = [aws_sns_topic.ops_warning[0].arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.ops_counts]
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "ingestion_source_failure_spike_lever" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-source-failure-spike-lever-sev3"
  alarm_description   = "SEV3 alert. Lever source failures are elevated. Owner: Data Platform."
  namespace           = local.ops_metric_namespace
  metric_name         = "SourceFetchFailureCountLever"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = var.ingestion_source_failure_spike_threshold
  period              = 900
  statistic           = "Sum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops_warning[0].arn]
  ok_actions          = [aws_sns_topic.ops_warning[0].arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.ops_counts]
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "ingestion_source_failure_spike_workable" {
  count               = var.enable_ops_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-source-failure-spike-workable-sev3"
  alarm_description   = "SEV3 alert. Workable source failures are elevated. Owner: Data Platform."
  namespace           = local.ops_metric_namespace
  metric_name         = "SourceFetchFailureCountWorkable"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = var.ingestion_source_failure_spike_threshold
  period              = 900
  statistic           = "Sum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops_warning[0].arn]
  ok_actions          = [aws_sns_topic.ops_warning[0].arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.ops_counts]
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "synthetic_public_journey" {
  count               = var.enable_ops_monitoring && var.enable_synthetic_canaries ? 1 : 0
  alarm_name          = "${local.name_prefix}-synthetic-public-journey-sev1"
  alarm_description   = "SEV1 alert. Public synthetic journey failed. Owner: Platform On-Call."
  namespace           = "CloudWatchSynthetics"
  metric_name         = "SuccessPercent"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 100
  period              = 300
  statistic           = "Average"
  treat_missing_data  = "breaching"
  dimensions = {
    CanaryName = aws_synthetics_canary.public_journey[0].name
  }
  alarm_actions = [aws_sns_topic.ops_critical[0].arn]
  ok_actions    = [aws_sns_topic.ops_critical[0].arn]
  tags          = local.tags
}

resource "aws_cloudwatch_dashboard" "platform_overview" {
  count          = var.enable_ops_monitoring ? 1 : 0
  dashboard_name = "${local.name_prefix}-platform-overview"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "App Runner Availability and Errors"
          region  = var.aws_region
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["AWS/AppRunner", "RequestCount", "ServiceName", local.frontend_apprunner_service_name, "ServiceId", module.apprunner.frontend_service_id, { stat = "Sum", label = "Frontend Requests" }],
            [".", "5xxStatusResponses", ".", ".", ".", ".", { stat = "Sum", label = "Frontend 5xx" }],
            ["AWS/AppRunner", "RequestCount", "ServiceName", local.backend_apprunner_service_name, "ServiceId", module.apprunner.backend_service_id, { stat = "Sum", label = "Backend Requests" }],
            [".", "5xxStatusResponses", ".", ".", ".", ".", { stat = "Sum", label = "Backend 5xx" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Latency and Capacity"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            ["AWS/AppRunner", "RequestLatency", "ServiceName", local.frontend_apprunner_service_name, "ServiceId", module.apprunner.frontend_service_id, { stat = "p95", label = "Frontend p95 latency" }],
            ["AWS/AppRunner", "RequestLatency", "ServiceName", local.backend_apprunner_service_name, "ServiceId", module.apprunner.backend_service_id, { stat = "p95", label = "Backend p95 latency" }],
            ["AWS/AppRunner", "CPUUtilization", "ServiceName", local.backend_apprunner_service_name, "ServiceId", module.apprunner.backend_service_id, { stat = "Average", label = "Backend CPU" }],
            ["AWS/AppRunner", "CPUUtilization", "ServiceName", local.frontend_apprunner_service_name, "ServiceId", module.apprunner.frontend_service_id, { stat = "Average", label = "Frontend CPU" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Core Product Flow SLIs"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            [local.ops_metric_namespace, "SignupSuccessCount", { stat = "Sum", label = "Signup success" }],
            [".", "LoginSuccessCount", { stat = "Sum", label = "Login success" }],
            [".", "BillingCheckoutSuccessCount", { stat = "Sum", label = "Billing checkout success" }],
            [".", "JobPublishSuccessCount", { stat = "Sum", label = "Job publish success" }],
            [".", "ApplicationSubmissionSuccessCount", { stat = "Sum", label = "Application submission success" }],
            [".", "NotificationDeliveryFailureCount", { stat = "Sum", label = "Notification failures" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Operational Backlogs and Freshness"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            [local.ops_metric_namespace, "JobIngestionFreshnessMinutes", { stat = "Maximum", label = "Job ingestion freshness (min)" }],
            [".", "IngestionCycleStatus", { stat = "Minimum", label = "Ingestion cycle status (1=success,0=failure)" }],
            [".", "ConsecutiveFailureCount", { stat = "Maximum", label = "Consecutive failures" }],
            [".", "ConsecutiveZeroResultCount", { stat = "Maximum", label = "Consecutive zero-result cycles" }],
            [".", "JobsIngestedPerCycle", { stat = "Maximum", label = "Jobs ingested per cycle" }],
            [".", "ModerationQueueBacklog", { stat = "Maximum", label = "Moderation backlog" }],
            [".", "EmployerVerificationQueueBacklog", { stat = "Maximum", label = "Employer verification backlog" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Database and Synthetic Health"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", module.rds.db_instance_id, { stat = "Average", label = "RDS CPU" }],
            [".", "DatabaseConnections", ".", ".", { stat = "Average", label = "RDS connections" }],
            [".", "FreeStorageSpace", ".", ".", { stat = "Average", label = "RDS free storage" }],
            ["CloudWatchSynthetics", "SuccessPercent", "CanaryName", var.enable_synthetic_canaries ? aws_synthetics_canary.public_journey[0].name : "disabled", { stat = "Average", label = "Public journey success %" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Ingestion Source Reliability"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            [local.ops_metric_namespace, "SourceFetchSuccessCountGreenhouse", { stat = "Sum", label = "Greenhouse success" }],
            [".", "SourceFetchFailureCountGreenhouse", { stat = "Sum", label = "Greenhouse failure" }],
            [".", "SourceFetchSuccessCountLever", { stat = "Sum", label = "Lever success" }],
            [".", "SourceFetchFailureCountLever", { stat = "Sum", label = "Lever failure" }],
            [".", "SourceFetchSuccessCountWorkable", { stat = "Sum", label = "Workable success" }],
            [".", "SourceFetchFailureCountWorkable", { stat = "Sum", label = "Workable failure" }],
            [".", "SourceFetchLatencyMsGreenhouse", { stat = "p95", label = "Greenhouse latency p95 (ms)" }],
            [".", "SourceFetchLatencyMsLever", { stat = "p95", label = "Lever latency p95 (ms)" }],
            [".", "SourceFetchLatencyMsWorkable", { stat = "p95", label = "Workable latency p95 (ms)" }],
            [".", "SourceFetchErrorCountGreenhouse", { stat = "Sum", label = "Greenhouse errors by reason" }],
            [".", "SourceFetchErrorCountLever", { stat = "Sum", label = "Lever errors by reason" }],
            [".", "SourceFetchErrorCountWorkable", { stat = "Sum", label = "Workable errors by reason" }],
          ]
        }
      },
      {
        type   = "alarm"
        x      = 0
        y      = 18
        width  = 24
        height = 3
        properties = {
          title = "Ingestion Alert States"
          alarms = [
            aws_cloudwatch_metric_alarm.job_ingestion_stale[0].arn,
            aws_cloudwatch_metric_alarm.ingestion_consecutive_failures[0].arn,
            aws_cloudwatch_metric_alarm.ingestion_consecutive_zero_results[0].arn,
            aws_cloudwatch_metric_alarm.ingestion_source_failure_spike_greenhouse[0].arn,
            aws_cloudwatch_metric_alarm.ingestion_source_failure_spike_lever[0].arn,
            aws_cloudwatch_metric_alarm.ingestion_source_failure_spike_workable[0].arn,
          ]
        }
      }
    ]
  })
}

resource "aws_cloudwatch_dashboard" "application_ops" {
  count          = var.enable_ops_monitoring ? 1 : 0
  dashboard_name = "${local.name_prefix}-application-ops"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Auth, Verification, and Billing Events"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            [local.ops_metric_namespace, "LoginSuccessCount", { stat = "Sum", label = "Login success" }],
            [".", "LoginFailureCount", { stat = "Sum", label = "Login failure" }],
            [".", "VerificationVerifySuccessCount", { stat = "Sum", label = "Verification success" }],
            [".", "VerificationVerifyFailureCount", { stat = "Sum", label = "Verification failure" }],
            [".", "BillingCheckoutSessionSuccessCount", { stat = "Sum", label = "Checkout session success" }],
            [".", "BillingCheckoutFailureCount", { stat = "Sum", label = "Checkout failure" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Jobs, Applications, and Notifications"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            [local.ops_metric_namespace, "JobPublishSuccessCount", { stat = "Sum", label = "Job publish success" }],
            [".", "JobPublishHeldCount", { stat = "Sum", label = "Job held" }],
            [".", "ApplicationSubmissionSuccessCount", { stat = "Sum", label = "Application success" }],
            [".", "ApplicationSubmissionHeldCount", { stat = "Sum", label = "Application held" }],
            [".", "NotificationDeliverySuccessCount", { stat = "Sum", label = "Notification success" }],
            [".", "NotificationDeliveryFailureCount", { stat = "Sum", label = "Notification failure" }],
          ]
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Backend Errors"
          region = var.aws_region
          view   = "table"
          query  = "SOURCE '${local.backend_application_log_group}' | fields @timestamp, level, @message | filter level = \"error\" or @message like /Internal server error/ | sort @timestamp desc | limit 50"
        }
      },
      {
        type   = "log"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Frontend Errors"
          region = var.aws_region
          view   = "table"
          query  = "SOURCE '${local.frontend_application_log_group}' | fields @timestamp, @message | filter @message like /error/i or @message like /exception/i | sort @timestamp desc | limit 50"
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Fraud Detections and Dead Letters"
          region = var.aws_region
          view   = "table"
          query  = "SOURCE '${local.backend_application_log_group}' | fields @timestamp, metric_name, details, @message | filter event_type = \"ops_snapshot\" or event_type = \"ops_dead_letter\" | sort @timestamp desc | limit 50"
        }
      },
      {
        type   = "log"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Auth and Billing Event Stream"
          region = var.aws_region
          view   = "table"
          query  = "SOURCE '${local.backend_application_log_group}' | fields @timestamp, metric_name, outcome, details | filter event_type = \"ops_metric\" and (metric_name like /login/ or metric_name like /signup/ or metric_name like /billing/) | sort @timestamp desc | limit 100"
        }
      }
    ]
  })
}

output "ops_dashboard_names" {
  description = "CloudWatch dashboards created for platform operations."
  value = var.enable_ops_monitoring ? [
    aws_cloudwatch_dashboard.platform_overview[0].dashboard_name,
    aws_cloudwatch_dashboard.application_ops[0].dashboard_name,
  ] : []
}

output "ops_alert_topics" {
  description = "SNS topics for critical and warning platform alerts."
  value = var.enable_ops_monitoring ? {
    critical = aws_sns_topic.ops_critical[0].arn
    warning  = aws_sns_topic.ops_warning[0].arn
  } : {}
}
