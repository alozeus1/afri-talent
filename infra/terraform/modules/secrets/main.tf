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
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
