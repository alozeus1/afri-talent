# ── SSM Parameter Store — optional blog pipeline keys ────────────────────────
# Created by Terraform with a placeholder value. Update the real value via
# AWS Console → Systems Manager → Parameter Store → edit each parameter.
# Terraform will NOT overwrite your manual updates (ignore_changes on value).

resource "aws_kms_key" "ssm_parameters" {
  description             = "KMS key for ${var.name_prefix} blog SSM parameters"
  deletion_window_in_days = 7
  enable_key_rotation     = true
}

resource "aws_kms_alias" "ssm_parameters" {
  name          = "alias/${var.name_prefix}-blog-ssm"
  target_key_id = aws_kms_key.ssm_parameters.key_id
}

resource "aws_ssm_parameter" "news_api_key" {
  name        = "/${var.name_prefix}/blog/NEWS_API_KEY"
  description = "NewsAPI.org key for blog content sourcing"
  type        = "SecureString"
  value       = "placeholder"
  key_id      = aws_kms_key.ssm_parameters.arn

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "unsplash_access_key" {
  name        = "/${var.name_prefix}/blog/UNSPLASH_ACCESS_KEY"
  description = "Unsplash API access key for blog cover images"
  type        = "SecureString"
  value       = "placeholder"
  key_id      = aws_kms_key.ssm_parameters.arn

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "pexels_api_key" {
  name        = "/${var.name_prefix}/blog/PEXELS_API_KEY"
  description = "Pexels API key — fallback cover image source"
  type        = "SecureString"
  value       = "placeholder"
  key_id      = aws_kms_key.ssm_parameters.arn

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "blog_admin_email" {
  name        = "/${var.name_prefix}/blog/BLOG_ADMIN_NOTIFICATION_EMAIL"
  description = "Email address to notify when a blog draft is ready for review"
  type        = "SecureString"
  value       = "placeholder"
  key_id      = aws_kms_key.ssm_parameters.arn

  lifecycle {
    ignore_changes = [value]
  }
}

# ── Secrets Manager — core application secrets ────────────────────────────────

resource "aws_secretsmanager_secret" "app" {
  name        = "${var.name_prefix}/app-secrets"
  description = "Application secrets for AfriTalent"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id

  secret_string = jsonencode({
    DATABASE_URL                  = "postgresql://${urlencode(var.db_username)}:${urlencode(var.db_password)}@${var.db_endpoint}:${var.db_port}/${var.db_name}"
    JWT_SECRET                    = var.jwt_secret
    ANTHROPIC_API_KEY             = var.anthropic_api_key
    STRIPE_SECRET_KEY             = var.stripe_secret_key
    STRIPE_WEBHOOK_SECRET         = var.stripe_webhook_secret
    STRIPE_PRICE_CATALOG_JSON     = var.stripe_price_catalog_json
    FLUTTERWAVE_PUBLIC_KEY        = var.flutterwave_public_key
    FLUTTERWAVE_SECRET_KEY        = var.flutterwave_secret_key
    FLUTTERWAVE_SECRET_HASH       = var.flutterwave_secret_hash
    FLUTTERWAVE_PLAN_CATALOG_JSON = var.flutterwave_plan_catalog_json
    FLUTTERWAVE_PAYMENT_OPTIONS   = var.flutterwave_payment_options
    ADZUNA_APP_ID                 = var.adzuna_app_id
    ADZUNA_API_KEY                = var.adzuna_api_key
    APIFY_TOKEN                   = var.apify_token
    APIFY_JOB_TASKS_JSON          = var.apify_job_tasks_json
    GREENHOUSE_BOARD_TOKENS       = var.greenhouse_board_tokens
    LEVER_SITE_TOKENS             = var.lever_site_tokens
    WORKABLE_COMPANY_TOKENS       = var.workable_company_tokens
    REDIS_URL                     = var.redis_url
    SENTRY_DSN                    = var.sentry_dsn
    ADMIN_BOOTSTRAP_EMAIL         = var.admin_bootstrap_email
    ADMIN_BOOTSTRAP_PASSWORD      = var.admin_bootstrap_password
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
