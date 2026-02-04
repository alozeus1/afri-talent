resource "random_password" "db" {
  length           = 24
  special          = true
  override_characters = "!@#%^*()-_=+[]{}"
}

resource "random_password" "jwt" {
  length  = 64
  special = true
}

resource "aws_secretsmanager_secret" "app" {
  name        = "${local.name_prefix}/app-secrets"
  description = "Application secrets for AfriTalent"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id

  secret_string = jsonencode({
    DATABASE_URL = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}"
    JWT_SECRET   = random_password.jwt.result
  })
}

