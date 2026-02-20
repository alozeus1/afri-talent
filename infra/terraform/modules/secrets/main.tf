resource "aws_secretsmanager_secret" "app" {
  name        = "${var.name_prefix}/app-secrets"
  description = "Application secrets for AfriTalent"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id

  secret_string = jsonencode({
    DATABASE_URL          = "postgresql://${var.db_username}:${var.db_password}@${var.db_endpoint}:${var.db_port}/${var.db_name}"
    JWT_SECRET            = var.jwt_secret
    ANTHROPIC_API_KEY     = var.anthropic_api_key
    STRIPE_SECRET_KEY     = var.stripe_secret_key
    STRIPE_WEBHOOK_SECRET = var.stripe_webhook_secret
    ADZUNA_APP_ID         = var.adzuna_app_id
    ADZUNA_API_KEY        = var.adzuna_api_key
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
