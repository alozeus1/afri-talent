# Generated overrides for the dev-new stack against AWS account 108188564905.
# This file is gitignored — see .gitignore in the repo root.

aws_account_id  = "108188564905"
aws_region      = "us-east-1"
environment     = "dev"
name_prefix     = "afritalent-dev"
ssm_path_prefix = "afritalent/dev"
owner_tag       = "platform"

# Domain temporarily disabled: afri-talent.com is delegated to DigitalOcean
# nameservers, so AWS Route 53 zone records are not authoritative on the
# public internet — ACM cannot validate via DNS through Route 53. Re-enable
# AFTER either (a) updating the registrar to AWS NS records, or (b) adding
# the ACM validation CNAME at DigitalOcean DNS.
domain_name         = ""
create_route53_zone = false

# Aurora — auto-pause enabled
aurora_min_acu                  = 0
aurora_max_acu                  = 4
aurora_seconds_until_auto_pause = 1800

# ECS — Spot mix
ecs_desired_count       = 1
ecs_fargate_base        = 1
ecs_fargate_spot_weight = 4

# GitHub OIDC — provider already exists in this account, skip create
github_owner         = "alozeus1"
github_repo          = "afri-talent"
create_oidc_provider = false

# Cost
monthly_budget_usd = 150
budget_alert_email = "alozeus1@gmail.com"
