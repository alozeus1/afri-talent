# ─────────────────────────────────────────────────────────────────────────────
# Wave 9 §10.1 — SLO alarms
#
# Six alarms covering the launch SLO targets:
#   1. API availability (5xx-free) — 99.9% on /api/jobs + /api/auth/*
#   2. p95 /api/jobs latency      — ≤ 500 ms
#   3. Match Agent end-to-end p95 — ≤ 6 s
#   4. Apply Agent delivery rate  — ≥ 95%
#   5. Job-field classifier accuracy — ≥ 92%
#   6. Stale-job removal latency  — ≤ 24 h after detection
#
# Alarms #1 and #2 use existing AWS/ApplicationELB metrics (no application
# change required). Alarms #3-#6 reference custom CloudWatch metrics
# emitted by the backend in the `AfriTalent/Agents` namespace; those
# emission sites are added in a separate PR (Wave 9 §10.2 PR-B —
# `release/launch-wave-9-agent-metrics`). Until PR-B merges and applies,
# alarms #3-#6 sit in INSUFFICIENT_DATA — `treat_missing_data =
# "notBreaching"` so they don't page on a cold start.
#
# Routing: every alarm publishes to a single SNS topic
# `${name_prefix}-slo-alerts`. Subscriptions are intentionally left
# commented out — the founder wires PagerDuty (preferred) or Opsgenie
# post-merge by uncommenting the subscription block in this file and
# supplying the integration URL via SSM.
# ─────────────────────────────────────────────────────────────────────────────

# ── SNS topic for SLO alerts ─────────────────────────────────────────────────

resource "aws_sns_topic" "slo_alerts" {
  name = "${local.name_prefix}-slo-alerts"

  # KMS-encrypted at rest. The AWS-managed `alias/aws/sns` key is fine
  # here — the topic does not carry payloads from outside AWS.
  kms_master_key_id = "alias/aws/sns"

  tags = merge(var.tags, { Name = "${local.name_prefix}-slo-alerts" })
}

# Email subscription — fallback channel until PagerDuty/Opsgenie is wired.
# Conditional on var.alerts_email being non-empty so dev/test stacks can skip.
resource "aws_sns_topic_subscription" "alerts_email" {
  count = var.alerts_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.slo_alerts.arn
  protocol  = "email"
  endpoint  = var.alerts_email
}

# ── PagerDuty / Opsgenie placeholder ─────────────────────────────────────────
# Founder action post-merge:
#   1. Create a PagerDuty service + CloudWatch integration (or Opsgenie equiv).
#   2. Store the integration URL in SSM at
#      /${ssm_path_prefix}/PAGERDUTY_SNS_ENDPOINT (SecureString).
#   3. Uncomment the block below and re-run `terraform apply` from main.
#
# resource "aws_sns_topic_subscription" "pagerduty" {
#   topic_arn = aws_sns_topic.slo_alerts.arn
#   protocol  = "https"
#   endpoint  = data.aws_ssm_parameter.pagerduty_endpoint.value
# }
#
# data "aws_ssm_parameter" "pagerduty_endpoint" {
#   name            = "/${var.ssm_path_prefix}/PAGERDUTY_SNS_ENDPOINT"
#   with_decryption = true
# }

# ─────────────────────────────────────────────────────────────────────────────
# SLO #1 — API availability (5xx-free) on /api/jobs + /api/auth/*
#
# ALB-level proxy: we alarm on HTTPCode_Target_5XX_Count exceeding 0.1% of
# RequestCount over 5 minutes (= 99.9% target). Path-specific filtering
# would require custom metric filters on ALB access logs (deferred — Wave
# 9.5). The target-group dimension scopes this to the backend tasks only.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "api_availability_5xx" {
  count = var.alb_arn_suffix != "" && var.target_group_backend_arn_suffix != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-slo-api-5xx-rate"
  alarm_description   = "SLO #1 — Backend 5xx rate exceeded 0.1% over 5 minutes (target: 99.9% availability)."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0.001 # 0.1% = 1 - 99.9%
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "rate"
    expression  = "IF(requests > 0, errors / requests, 0)"
    label       = "Backend 5xx rate"
    return_data = true
  }

  metric_query {
    id = "errors"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      period      = 300
      stat        = "Sum"
      dimensions = {
        LoadBalancer = var.alb_arn_suffix
        TargetGroup  = var.target_group_backend_arn_suffix
      }
    }
  }

  metric_query {
    id = "requests"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      period      = 300
      stat        = "Sum"
      dimensions = {
        LoadBalancer = var.alb_arn_suffix
        TargetGroup  = var.target_group_backend_arn_suffix
      }
    }
  }

  alarm_actions = [aws_sns_topic.slo_alerts.arn]
  ok_actions    = [aws_sns_topic.slo_alerts.arn]

  tags = merge(var.tags, { SLO = "api-availability", Severity = "P1" })
}

# ─────────────────────────────────────────────────────────────────────────────
# SLO #2 — p95 /api/jobs latency ≤ 500 ms
#
# ALB target response time p95 over 5 min. Threshold = 0.5 s. Like SLO #1
# this is path-blind at the ALB layer; per-path latency is a Wave 9.5
# upgrade once OTel + X-Ray are running.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "api_jobs_latency_p95" {
  count = var.alb_arn_suffix != "" && var.target_group_backend_arn_suffix != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-slo-api-latency-p95"
  alarm_description   = "SLO #2 — Backend p95 latency exceeded 500 ms over 5 minutes."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 0.5 # seconds
  treat_missing_data  = "notBreaching"

  metric_name        = "TargetResponseTime"
  namespace          = "AWS/ApplicationELB"
  period             = 300
  extended_statistic = "p95"
  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_backend_arn_suffix
  }

  alarm_actions = [aws_sns_topic.slo_alerts.arn]
  ok_actions    = [aws_sns_topic.slo_alerts.arn]

  tags = merge(var.tags, { SLO = "api-latency", Severity = "P1" })
}

# ─────────────────────────────────────────────────────────────────────────────
# SLO #3 — Match Agent end-to-end p95 ≤ 6 s
#
# Custom metric AfriTalent/Agents → MatchAgentDurationSeconds, emitted from
# backend (PR-B). Until PR-B applies, alarm sits INSUFFICIENT_DATA.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "match_agent_p95" {
  alarm_name          = "${local.name_prefix}-slo-match-agent-p95"
  alarm_description   = "SLO #3 — Match Agent end-to-end p95 exceeded 6 s over 5 minutes."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 6
  treat_missing_data  = "notBreaching"

  metric_name        = "MatchAgentDurationSeconds"
  namespace          = "AfriTalent/Agents"
  period             = 300
  extended_statistic = "p95"
  dimensions = {
    Environment = var.environment
  }

  alarm_actions = [aws_sns_topic.slo_alerts.arn]
  ok_actions    = [aws_sns_topic.slo_alerts.arn]

  tags = merge(var.tags, { SLO = "match-agent-latency", Severity = "P2" })
}

# ─────────────────────────────────────────────────────────────────────────────
# SLO #4 — Apply Agent delivery rate ≥ 95%
#
# Custom metrics: ApplyAgentSubmissions (count, Sum) and
# ApplyAgentConfirmed (count, Sum). Alarm fires when confirmed/submissions
# drops below 0.95 over a 15-minute window (more data → less noisy than 5
# min for low-volume metrics).
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "apply_agent_delivery_rate" {
  alarm_name          = "${local.name_prefix}-slo-apply-delivery-rate"
  alarm_description   = "SLO #4 — Apply Agent confirmed-delivery rate dropped below 95% over 15 minutes."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  threshold           = 0.95
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "rate"
    expression  = "IF(submissions > 0, confirmed / submissions, 1)"
    label       = "Apply Agent confirmed-delivery rate"
    return_data = true
  }

  metric_query {
    id = "submissions"
    metric {
      namespace   = "AfriTalent/Agents"
      metric_name = "ApplyAgentSubmissions"
      period      = 900
      stat        = "Sum"
      dimensions = {
        Environment = var.environment
      }
    }
  }

  metric_query {
    id = "confirmed"
    metric {
      namespace   = "AfriTalent/Agents"
      metric_name = "ApplyAgentConfirmed"
      period      = 900
      stat        = "Sum"
      dimensions = {
        Environment = var.environment
      }
    }
  }

  alarm_actions = [aws_sns_topic.slo_alerts.arn]
  ok_actions    = [aws_sns_topic.slo_alerts.arn]

  tags = merge(var.tags, { SLO = "apply-delivery-rate", Severity = "P1" })
}

# ─────────────────────────────────────────────────────────────────────────────
# SLO #5 — Job-field classifier accuracy ≥ 92%
#
# Custom metrics: ClassifierEvaluations and ClassifierCorrect. Backend
# emits these when post-hoc validation (human-reviewed label or downstream
# matcher feedback) confirms a classifier output. The denominator is small
# and lumpy, so the alarm uses a 1-hour window.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "classifier_accuracy" {
  alarm_name          = "${local.name_prefix}-slo-classifier-accuracy"
  alarm_description   = "SLO #5 — Job-field classifier accuracy dropped below 92% over the trailing hour."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  threshold           = 0.92
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "rate"
    expression  = "IF(evaluations > 0, correct / evaluations, 1)"
    label       = "Classifier accuracy"
    return_data = true
  }

  metric_query {
    id = "evaluations"
    metric {
      namespace   = "AfriTalent/Agents"
      metric_name = "ClassifierEvaluations"
      period      = 3600
      stat        = "Sum"
      dimensions = {
        Environment = var.environment
      }
    }
  }

  metric_query {
    id = "correct"
    metric {
      namespace   = "AfriTalent/Agents"
      metric_name = "ClassifierCorrect"
      period      = 3600
      stat        = "Sum"
      dimensions = {
        Environment = var.environment
      }
    }
  }

  alarm_actions = [aws_sns_topic.slo_alerts.arn]
  ok_actions    = [aws_sns_topic.slo_alerts.arn]

  tags = merge(var.tags, { SLO = "classifier-accuracy", Severity = "P2" })
}

# ─────────────────────────────────────────────────────────────────────────────
# SLO #6 — Stale-job removal latency ≤ 24 h after detection
#
# Custom metric StaleJobRemovalLatencySeconds — emitted by the worker that
# tombstones stale jobs. Alarm fires when the max (worst-case) age exceeds
# 24 h (86400 s) over a 1-hour window.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "stale_job_removal_latency" {
  alarm_name          = "${local.name_prefix}-slo-stale-job-removal-latency"
  alarm_description   = "SLO #6 — Stale-job removal latency exceeded 24 hours (max over trailing hour)."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 86400 # 24 hours in seconds
  treat_missing_data  = "notBreaching"

  metric_name = "StaleJobRemovalLatencySeconds"
  namespace   = "AfriTalent/Agents"
  period      = 3600
  statistic   = "Maximum"
  dimensions = {
    Environment = var.environment
  }

  alarm_actions = [aws_sns_topic.slo_alerts.arn]
  ok_actions    = [aws_sns_topic.slo_alerts.arn]

  tags = merge(var.tags, { SLO = "stale-job-removal", Severity = "P2" })
}
