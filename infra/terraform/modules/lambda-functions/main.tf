terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.70" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
}

#
# Async / event-driven compute:
#   - webhook-stripe        Function URL, no auth (Stripe signs body)
#   - webhook-flutterwave   Function URL, no auth (Flutterwave signs body)
#   - orchestrator-step     Step Functions Task (no Function URL)
#
# CI builds zips and passes paths via *_zip_path. Without zips, each Lambda is
# packaged from the local placeholder/ directory so `terraform plan/apply` is
# self-contained for dev work — once CI runs, real artifacts replace these.
#

locals {
  use_placeholder_stripe          = length(trimspace(var.webhook_stripe_zip_path)) == 0
  use_placeholder_flutterwave     = length(trimspace(var.webhook_flutterwave_zip_path)) == 0
  use_placeholder_orchestrator    = length(trimspace(var.orchestrator_zip_path)) == 0
  use_placeholder_blog_automation = length(trimspace(var.blog_automation_zip_path)) == 0

  use_cloudwatch_kms = length(trimspace(var.cloudwatch_kms_key_arn)) > 0

  ssm_param_arn_glob = "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/${var.ssm_path_prefix}/*"

  webhook_stripe_name      = "${var.name_prefix}-webhook-stripe"
  webhook_flutterwave_name = "${var.name_prefix}-webhook-flutterwave"
  orchestrator_name        = "${var.name_prefix}-orchestrator-step"
  blog_automation_name     = "${var.name_prefix}-blog-automation"
  state_machine_name       = "${var.name_prefix}-orchestrator"
  blog_schedule_rule_name  = "${var.name_prefix}-blog-automation-weekly"
}

# ---------------------------------------------------------------------------
# Placeholder zip — only built when no real zip path is provided
# ---------------------------------------------------------------------------

data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/.build/placeholder.zip"
}

# ---------------------------------------------------------------------------
# IAM — assume role doc shared by all three Lambdas
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# Common SSM-read + KMS-decrypt + Logs policy applied to every function.
data "aws_iam_policy_document" "lambda_common" {
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

  statement {
    sid    = "WriteLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${var.aws_region}:${var.aws_account_id}:*"]
  }
}

# ---------------------------------------------------------------------------
# webhook-stripe
# ---------------------------------------------------------------------------
# DB access (Aurora via RDS Proxy) uses password auth in v1 — credentials live
# in SSM SecureString and are read at cold start. No IAM auth wiring here.

resource "aws_iam_role" "webhook_stripe" {
  name               = "${local.webhook_stripe_name}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "webhook_stripe_vpc" {
  role       = aws_iam_role.webhook_stripe.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "webhook_stripe_common" {
  name   = "${local.webhook_stripe_name}-common"
  role   = aws_iam_role.webhook_stripe.id
  policy = data.aws_iam_policy_document.lambda_common.json
}

resource "aws_cloudwatch_log_group" "webhook_stripe" {
  name              = "/aws/lambda/${local.webhook_stripe_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = local.use_cloudwatch_kms ? var.cloudwatch_kms_key_arn : null
}

resource "aws_lambda_function" "webhook_stripe" {
  function_name = local.webhook_stripe_name
  role          = aws_iam_role.webhook_stripe.arn
  runtime       = "nodejs20.x"
  handler       = "dist/lambda/webhook-stripe.handler"
  memory_size   = var.webhook_memory_mb
  timeout       = var.webhook_timeout_sec

  filename         = local.use_placeholder_stripe ? data.archive_file.placeholder.output_path : var.webhook_stripe_zip_path
  source_code_hash = local.use_placeholder_stripe ? data.archive_file.placeholder.output_base64sha256 : filebase64sha256(var.webhook_stripe_zip_path)

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.sg_lambda_id]
  }

  environment {
    variables = var.webhook_stripe_env
  }

  depends_on = [
    aws_cloudwatch_log_group.webhook_stripe,
    aws_iam_role_policy_attachment.webhook_stripe_vpc,
    aws_iam_role_policy.webhook_stripe_common,
  ]
}

resource "aws_lambda_function_url" "webhook_stripe" {
  function_name      = aws_lambda_function.webhook_stripe.function_name
  authorization_type = "NONE"

  cors {
    allow_origins = var.webhook_function_url_allow_origins
    # Lambda Function URL CORS allow_methods only accepts strings ≤ 6 chars
    # from {GET, PUT, HEAD, POST, PATCH, DELETE, *}. OPTIONS is omitted because
    # webhook providers (Stripe/Flutterwave) only POST.
    allow_methods = ["POST"]
    allow_headers = ["*"]
    max_age       = 0
  }
}

# ---------------------------------------------------------------------------
# webhook-flutterwave  (mirror of stripe — separate role for blast-radius)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "webhook_flutterwave" {
  name               = "${local.webhook_flutterwave_name}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "webhook_flutterwave_vpc" {
  role       = aws_iam_role.webhook_flutterwave.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "webhook_flutterwave_common" {
  name   = "${local.webhook_flutterwave_name}-common"
  role   = aws_iam_role.webhook_flutterwave.id
  policy = data.aws_iam_policy_document.lambda_common.json
}

resource "aws_cloudwatch_log_group" "webhook_flutterwave" {
  name              = "/aws/lambda/${local.webhook_flutterwave_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = local.use_cloudwatch_kms ? var.cloudwatch_kms_key_arn : null
}

resource "aws_lambda_function" "webhook_flutterwave" {
  function_name = local.webhook_flutterwave_name
  role          = aws_iam_role.webhook_flutterwave.arn
  runtime       = "nodejs20.x"
  handler       = "dist/lambda/webhook-flutterwave.handler"
  memory_size   = var.webhook_memory_mb
  timeout       = var.webhook_timeout_sec

  filename         = local.use_placeholder_flutterwave ? data.archive_file.placeholder.output_path : var.webhook_flutterwave_zip_path
  source_code_hash = local.use_placeholder_flutterwave ? data.archive_file.placeholder.output_base64sha256 : filebase64sha256(var.webhook_flutterwave_zip_path)

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.sg_lambda_id]
  }

  environment {
    variables = var.webhook_flutterwave_env
  }

  depends_on = [
    aws_cloudwatch_log_group.webhook_flutterwave,
    aws_iam_role_policy_attachment.webhook_flutterwave_vpc,
    aws_iam_role_policy.webhook_flutterwave_common,
  ]
}

resource "aws_lambda_function_url" "webhook_flutterwave" {
  function_name      = aws_lambda_function.webhook_flutterwave.function_name
  authorization_type = "NONE"

  cors {
    allow_origins = var.webhook_function_url_allow_origins
    # Lambda Function URL CORS allow_methods only accepts strings ≤ 6 chars
    # from {GET, PUT, HEAD, POST, PATCH, DELETE, *}. OPTIONS is omitted because
    # webhook providers (Stripe/Flutterwave) only POST.
    allow_methods = ["POST"]
    allow_headers = ["*"]
    max_age       = 0
  }
}

# ---------------------------------------------------------------------------
# orchestrator-step  (Step Functions task — no Function URL)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "orchestrator" {
  name               = "${local.orchestrator_name}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "orchestrator_vpc" {
  role       = aws_iam_role.orchestrator.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "orchestrator_common" {
  name   = "${local.orchestrator_name}-common"
  role   = aws_iam_role.orchestrator.id
  policy = data.aws_iam_policy_document.lambda_common.json
}

# Bedrock for AI fallback. Anthropic egress goes via NAT instance (VPC config
# + private subnets + sg_lambda_id) — no extra IAM needed for that path.
data "aws_iam_policy_document" "orchestrator_bedrock" {
  statement {
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "orchestrator_bedrock" {
  name   = "${local.orchestrator_name}-bedrock"
  role   = aws_iam_role.orchestrator.id
  policy = data.aws_iam_policy_document.orchestrator_bedrock.json
}

resource "aws_cloudwatch_log_group" "orchestrator" {
  name              = "/aws/lambda/${local.orchestrator_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = local.use_cloudwatch_kms ? var.cloudwatch_kms_key_arn : null
}

resource "aws_lambda_function" "orchestrator" {
  function_name = local.orchestrator_name
  role          = aws_iam_role.orchestrator.arn
  runtime       = "nodejs20.x"
  handler       = "dist/lambda/orchestrator-step.handler"
  memory_size   = var.orchestrator_memory_mb
  timeout       = var.orchestrator_timeout_sec

  filename         = local.use_placeholder_orchestrator ? data.archive_file.placeholder.output_path : var.orchestrator_zip_path
  source_code_hash = local.use_placeholder_orchestrator ? data.archive_file.placeholder.output_base64sha256 : filebase64sha256(var.orchestrator_zip_path)

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.sg_lambda_id]
  }

  environment {
    variables = var.orchestrator_env
  }

  depends_on = [
    aws_cloudwatch_log_group.orchestrator,
    aws_iam_role_policy_attachment.orchestrator_vpc,
    aws_iam_role_policy.orchestrator_common,
    aws_iam_role_policy.orchestrator_bedrock,
  ]
}

# ---------------------------------------------------------------------------
# Step Functions state machine
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "sfn_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sfn" {
  name               = "${local.state_machine_name}-sfn-role"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume.json
}

data "aws_iam_policy_document" "sfn_invoke_lambda" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.orchestrator.arn, "${aws_lambda_function.orchestrator.arn}:*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogDelivery",
      "logs:GetLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries",
      "logs:PutResourcePolicy",
      "logs:DescribeResourcePolicies",
      "logs:DescribeLogGroups",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "sfn_invoke_lambda" {
  name   = "${local.state_machine_name}-sfn-policy"
  role   = aws_iam_role.sfn.id
  policy = data.aws_iam_policy_document.sfn_invoke_lambda.json
}

resource "aws_cloudwatch_log_group" "sfn" {
  name              = "/aws/states/${local.state_machine_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = local.use_cloudwatch_kms ? var.cloudwatch_kms_key_arn : null
}

resource "aws_sfn_state_machine" "orchestrator" {
  name     = local.state_machine_name
  role_arn = aws_iam_role.sfn.arn
  type     = "STANDARD"

  definition = templatefile(
    "${path.module}/../../../../backend/infra/state-machines/orchestrator.asl.json",
    { orchestrator_lambda_arn = aws_lambda_function.orchestrator.arn }
  )

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.sfn.arn}:*"
    include_execution_data = true
    level                  = "ALL"
  }
}

# ---------------------------------------------------------------------------
# blog-automation (EventBridge weekly cron)
# ---------------------------------------------------------------------------
# Wave 6 §7.3 γ1. Scheduled blog pipeline runner — sources content, fact-checks,
# drafts a post, persists Resource + AdminReview (PENDING). Human review at
# /admin/blog before publication.
#
# Runtime defense: the handler reads BLOG_AUTOMATION_ENABLED from env (sourced
# from SSM at cold start). If the SSM value is "0" the handler exits cleanly
# without invoking the pipeline — TF stays applied, SSM flip is the toggle.

resource "aws_iam_role" "blog_automation" {
  name               = "${local.blog_automation_name}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "blog_automation_vpc" {
  role       = aws_iam_role.blog_automation.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "blog_automation_common" {
  name   = "${local.blog_automation_name}-common"
  role   = aws_iam_role.blog_automation.id
  policy = data.aws_iam_policy_document.lambda_common.json
}

# Bedrock for AI fallback — same pattern as orchestrator. Anthropic egress goes
# via NAT instance (VPC config + private subnets + sg_lambda_id).
data "aws_iam_policy_document" "blog_automation_bedrock" {
  statement {
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "blog_automation_bedrock" {
  name   = "${local.blog_automation_name}-bedrock"
  role   = aws_iam_role.blog_automation.id
  policy = data.aws_iam_policy_document.blog_automation_bedrock.json
}

# SES SendEmail for admin notification (BLOG_ADMIN_NOTIFICATION_EMAIL).
data "aws_iam_policy_document" "blog_automation_ses" {
  statement {
    effect    = "Allow"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "blog_automation_ses" {
  name   = "${local.blog_automation_name}-ses"
  role   = aws_iam_role.blog_automation.id
  policy = data.aws_iam_policy_document.blog_automation_ses.json
}

resource "aws_cloudwatch_log_group" "blog_automation" {
  name              = "/aws/lambda/${local.blog_automation_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = local.use_cloudwatch_kms ? var.cloudwatch_kms_key_arn : null
}

resource "aws_lambda_function" "blog_automation" {
  function_name = local.blog_automation_name
  role          = aws_iam_role.blog_automation.arn
  runtime       = "nodejs20.x"
  handler       = "dist/lambda/blog-automation.handler"
  memory_size   = var.blog_automation_memory_mb
  timeout       = var.blog_automation_timeout_sec

  filename         = local.use_placeholder_blog_automation ? data.archive_file.placeholder.output_path : var.blog_automation_zip_path
  source_code_hash = local.use_placeholder_blog_automation ? data.archive_file.placeholder.output_base64sha256 : filebase64sha256(var.blog_automation_zip_path)

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.sg_lambda_id]
  }

  environment {
    variables = var.blog_automation_env
  }

  depends_on = [
    aws_cloudwatch_log_group.blog_automation,
    aws_iam_role_policy_attachment.blog_automation_vpc,
    aws_iam_role_policy.blog_automation_common,
    aws_iam_role_policy.blog_automation_bedrock,
    aws_iam_role_policy.blog_automation_ses,
  ]
}

# EventBridge weekly schedule. Cron is UTC. Default: Mondays 09:00 UTC.
resource "aws_cloudwatch_event_rule" "blog_automation_weekly" {
  name                = local.blog_schedule_rule_name
  description         = "Weekly trigger for the blog-automation Lambda. Runtime SSM flag BLOG_AUTOMATION_ENABLED also gates execution."
  schedule_expression = var.blog_automation_schedule_expression
  state               = var.blog_automation_schedule_enabled ? "ENABLED" : "DISABLED"
}

resource "aws_cloudwatch_event_target" "blog_automation_weekly" {
  rule      = aws_cloudwatch_event_rule.blog_automation_weekly.name
  target_id = "blog-automation-lambda"
  arn       = aws_lambda_function.blog_automation.arn
}

resource "aws_lambda_permission" "blog_automation_eventbridge" {
  statement_id  = "AllowEventBridgeInvokeBlogAutomation"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.blog_automation.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.blog_automation_weekly.arn
}
