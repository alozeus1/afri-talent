# Generated overrides for the dev-new stack against AWS account 108188564905.
# This file is gitignored — see .gitignore in the repo root.

aws_account_id  = "108188564905"
aws_region      = "us-east-1"
environment     = "dev"
name_prefix     = "afritalent-dev"
ssm_path_prefix = "afritalent/dev"
owner_tag       = "platform"

# Using the existing Route 53 hosted zone Z06846713DL9KFNFBIRTI in this account.
domain_name         = "afri-talent.com"
create_route53_zone = false # zone already exists in this account

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
