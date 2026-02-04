resource "aws_secretsmanager_secret" "app" {
  name        = "${var.name_prefix}/app-secrets"
  description = "Application secrets for AfriTalent"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id

  secret_string = jsonencode({
    DATABASE_URL = "postgresql://${var.db_username}:${var.db_password}@${var.db_endpoint}:${var.db_port}/${var.db_name}"
    JWT_SECRET   = var.jwt_secret
  })
}
