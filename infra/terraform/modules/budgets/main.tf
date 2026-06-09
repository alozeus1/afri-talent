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
  name_prefix = var.name_prefix
  budget_name = "${var.name_prefix}-monthly-cost"
}

resource "aws_budgets_budget" "monthly" {
  name              = local.budget_name
  budget_type       = "COST"
  limit_amount      = format("%g", var.monthly_budget_usd)
  limit_unit        = "USD"
  time_unit         = "MONTHLY"
  time_period_start = "2026-01-01_00:00"

  # Filter spend to resources tagged with Project=<value>. Cost allocation
  # tags must be activated in Billing for this filter to take effect; if not,
  # the budget tracks all account spend (still useful as a safety net).
  cost_filter {
    name   = "TagKeyValue"
    values = [format("user:Project$%s", var.project_tag_value)]
  }

  # 50% — actual spend
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  # 80% — forecasted spend
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  # 100% — forecasted spend
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
