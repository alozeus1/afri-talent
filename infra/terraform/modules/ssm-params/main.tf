terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

# ---------------------------------------------------------------------------
# name_prefix is a slash path WITHOUT leading slash (e.g. "afritalent/dev").
# We derive a single dashed token for resource naming (KMS alias etc.) by
# replacing slashes with dashes: "afritalent-dev".
# ---------------------------------------------------------------------------

locals {
  prefix_path  = "/${var.name_prefix}"              # "/afritalent/dev"
  prefix_token = replace(var.name_prefix, "/", "-") # "afritalent-dev"
  kms_alias    = "alias/${local.prefix_token}-ssm"

  required_param_names = { for k in var.required_params : k => "${local.prefix_path}/${k}" }
  optional_param_names = { for k in var.optional_params : k => "${local.prefix_path}/${k}" }
  blog_param_names     = { for k in var.blog_params : k => "${local.prefix_path}/blog/${k}" }

  database_url_param_name = "${local.prefix_path}/DATABASE_URL"

  base_tags = merge(
    var.tags,
    {
      Component = "ssm-parameters"
      Module    = "ssm-params"
    }
  )
}

# ---------------------------------------------------------------------------
# Dedicated CMK for SSM SecureString parameters. Auto-rotated.
# ---------------------------------------------------------------------------

resource "aws_kms_key" "ssm" {
  description             = "CMK encrypting SSM SecureString parameters under ${local.prefix_path}/*"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags = merge(local.base_tags, {
    Name = "${local.prefix_token}-ssm-kms"
  })
}

resource "aws_kms_alias" "ssm" {
  name          = local.kms_alias
  target_key_id = aws_kms_key.ssm.key_id
}

# ---------------------------------------------------------------------------
# Required SecureString shells.
# Values are 'placeholder'; lifecycle ignore_changes prevents Terraform from
# reverting manual updates done by scripts/migrate/inject-secrets.sh.
# ---------------------------------------------------------------------------

resource "aws_ssm_parameter" "required" {
  for_each = local.required_param_names

  name        = each.value
  description = "Required secret: ${each.key}. Inject real value via scripts/migrate/inject-secrets.sh."
  type        = "SecureString"
  key_id      = aws_kms_key.ssm.arn
  value       = "placeholder"
  tier        = "Standard"

  tags = merge(local.base_tags, {
    Name        = each.value
    SecretClass = "required"
  })

  lifecycle {
    ignore_changes = [value]
  }
}

# ---------------------------------------------------------------------------
# Optional SecureString shells.
# ---------------------------------------------------------------------------

resource "aws_ssm_parameter" "optional" {
  for_each = local.optional_param_names

  name        = each.value
  description = "Optional secret: ${each.key}. Empty placeholder; injection optional."
  type        = "SecureString"
  key_id      = aws_kms_key.ssm.arn
  value       = "placeholder"
  tier        = "Standard"

  tags = merge(local.base_tags, {
    Name        = each.value
    SecretClass = "optional"
  })

  lifecycle {
    ignore_changes = [value]
  }
}

# ---------------------------------------------------------------------------
# Blog SecureString shells (under /<prefix>/blog/<KEY>).
# ---------------------------------------------------------------------------

resource "aws_ssm_parameter" "blog" {
  for_each = local.blog_param_names

  name        = each.value
  description = "Blog pipeline secret: ${each.key}."
  type        = "SecureString"
  key_id      = aws_kms_key.ssm.arn
  value       = "placeholder"
  tier        = "Standard"

  tags = merge(local.base_tags, {
    Name        = each.value
    SecretClass = "blog"
  })

  lifecycle {
    ignore_changes = [value]
  }
}

# ---------------------------------------------------------------------------
# DATABASE_URL parameter.
#
# We could template the URL, but the master password is sealed inside the
# AWS-managed Secrets Manager secret created by aws_rds_cluster's
# manage_master_user_password = true. Terraform cannot read its plaintext at
# plan time without exposing the value into state. Therefore we create the
# parameter as a placeholder and rely on the deploy script
# (scripts/migrate/inject-secrets.sh) to:
#   1. read the secret JSON from var.master_password_secret_arn
#   2. URL-encode the password
#   3. write postgresql://<user>:<pw>@<rds_proxy_endpoint>:5432/<db_name>
#      back into this parameter via `aws ssm put-parameter --overwrite`.
#
# The lifecycle ignore_changes block prevents subsequent terraform apply
# runs from clobbering the real value with the placeholder.
# ---------------------------------------------------------------------------

resource "aws_ssm_parameter" "database_url" {
  name = local.database_url_param_name
  description = format(
    "DATABASE_URL for app. Computed at deploy time from RDS Proxy endpoint=%s db=%s user=%s, secret=%s",
    var.rds_proxy_endpoint,
    var.db_name,
    var.master_username,
    var.master_password_secret_arn,
  )
  type   = "SecureString"
  key_id = aws_kms_key.ssm.arn
  value  = "placeholder"
  tier   = "Standard"

  tags = merge(local.base_tags, {
    Name        = local.database_url_param_name
    SecretClass = "required"
    Computed    = "by-inject-secrets-script"
  })

  lifecycle {
    ignore_changes = [value]
  }
}
