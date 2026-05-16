terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

############################################
# OIDC provider for GitHub Actions
#
# We create the provider unconditionally when var.create_oidc_provider = true.
# In a fresh account there is no provider, so creation succeeds. If the
# provider already exists Terraform will error on duplicate creation, which
# the supervisor can resolve by setting create_oidc_provider = false and
# running `terraform import` once. This avoids a fragile data-source dance.
############################################

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [var.github_oidc_thumbprint]

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-github-oidc"
    },
  )
}

# When the provider already exists in the account (create_oidc_provider = false)
# look it up so we can wire the role's trust policy to the existing ARN.
data "aws_iam_openid_connect_provider" "existing" {
  count = var.create_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.existing[0].arn

  ssm_parameter_arn_prefix = "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/${var.name_prefix_path}/*"

  ecs_resource_targets = compact(concat([var.ecs_cluster_arn], var.ecs_service_arns))

  backup_service_role_arn  = "arn:aws:iam::${var.aws_account_id}:role/${var.name_prefix}-backup-service-role"
  blog_automation_role_arn = "arn:aws:iam::${var.aws_account_id}:role/${var.name_prefix}-blog-automation-role"

  iam_role_exception_arns = [
    local.backup_service_role_arn,
    local.blog_automation_role_arn,
  ]
}

############################################
# Trust policy: allow the GitHub repo to assume the role via OIDC.
# Phase 1 broad scope: any branch / PR (`repo:owner/repo:*`).
# Tighten to specific refs (e.g. `:ref:refs/heads/main`) in a follow-up.
############################################

data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    sid     = "AllowGitHubOIDCAssume"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_owner}/${var.github_repo}:*"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = "${var.name_prefix}-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.github_actions_assume_role.json
  max_session_duration = var.max_session_duration

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-github-deploy"
    },
  )
}

############################################
# Deploy policy (inline scoped permissions).
#
# Covers: ECR push, ECS rolling deploy, Lambda code update, SSM read/write
# scoped to /${name_prefix_path}/*, and S3 + DynamoDB for Terraform state.
############################################

data "aws_iam_policy_document" "github_deploy" {
  # ----- ECR auth (must be on `*`)
  statement {
    sid       = "EcrAuth"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  # ----- ECR push/pull on the two repos
  statement {
    sid    = "EcrRepoPushPull"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:DescribeRepositories",
      "ecr:GetDownloadUrlForLayer",
      "ecr:GetRepositoryPolicy",
      "ecr:InitiateLayerUpload",
      "ecr:ListImages",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = var.ecr_repository_arns
  }

  # ----- ECS rolling deploy
  statement {
    sid    = "EcsRollingDeploy"
    effect = "Allow"
    actions = [
      "ecs:DescribeServices",
      "ecs:UpdateService",
      "ecs:RegisterTaskDefinition",
      "ecs:DescribeTaskDefinition",
      "ecs:ListTasks",
      "ecs:DescribeTasks",
    ]
    # ECS RegisterTaskDefinition does not honor resource-level constraints,
    # so we widen to "*" here while scoping the cluster-bound calls to the
    # provided ARNs is best-effort.
    resources = concat(local.ecs_resource_targets, ["*"])
  }

  # ----- Lambda code/config updates on the three functions
  dynamic "statement" {
    for_each = length(var.lambda_function_arns) > 0 ? [1] : []
    content {
      sid    = "LambdaUpdate"
      effect = "Allow"
      actions = [
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:PublishVersion",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
      ]
      resources = var.lambda_function_arns
    }
  }

  # ----- SSM Parameter Store, scoped to the env-specific prefix
  statement {
    sid    = "SsmParameterAccess"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
      "ssm:PutParameter",
      "ssm:DescribeParameters",
    ]
    resources = [local.ssm_parameter_arn_prefix]
  }

  # ----- Stack-local IAM roles required by managed service resources.
  statement {
    sid    = "ServiceRoleLifecycle"
    effect = "Allow"
    actions = [
      "iam:AttachRolePolicy",
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:GetRole",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:PassRole",
      "iam:PutRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
    ]
    resources = local.iam_role_exception_arns
  }

  # ----- S3: Terraform state bucket
  statement {
    sid    = "TerraformStateBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketVersioning",
    ]
    resources = [var.tfstate_bucket_arn]
  }

  statement {
    sid    = "TerraformStateObjects"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${var.tfstate_bucket_arn}/*"]
  }

  # ----- DynamoDB: Terraform lock table
  statement {
    sid    = "TerraformLockTable"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:DescribeTable",
    ]
    resources = [var.tflock_table_arn]
  }
}

resource "aws_iam_policy" "github_deploy" {
  name        = "${var.name_prefix}-github-deploy"
  description = "Scoped deploy permissions for ${var.github_owner}/${var.github_repo} via GitHub Actions OIDC."
  policy      = data.aws_iam_policy_document.github_deploy.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "github_deploy" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = aws_iam_policy.github_deploy.arn
}

############################################
# Phase 1 broad-scope policy: PowerUserAccess + IAM/Org guardrails.
#
# Rationale: Terraform manages many service domains (CloudFront, WAF, RDS,
# Aurora, EC2, VPC, Logs, KMS, GuardDuty, SecurityHub, Config, CloudTrail,
# Step Functions, EventBridge). Enumerating each action is high effort and
# error-prone for a fresh-account migration. We start from PowerUserAccess
# and explicitly DENY IAM trust mutation + Organizations actions so CI
# cannot escalate privilege or alter org-level controls.
#
# TODO(post-migration): Replace this with a least-privilege managed policy
# enumerating only the actions Terraform plans require. Track in a follow-up
# issue. This is intentionally Phase 1 broad; tighten in a follow-up.
############################################

resource "aws_iam_role_policy_attachment" "power_user" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

data "aws_iam_policy_document" "iam_org_guardrail" {
  statement {
    sid    = "DenyIamTrustMutation"
    effect = "Deny"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:CreateUser",
      "iam:DeleteUser",
      "iam:CreateAccessKey",
      "iam:DeleteAccessKey",
      "iam:CreateLoginProfile",
      "iam:UpdateLoginProfile",
    ]
    not_resources = local.iam_role_exception_arns
  }

  statement {
    sid       = "DenyOrganizationsAll"
    effect    = "Deny"
    actions   = ["organizations:*"]
    resources = ["*"]
  }

  statement {
    sid    = "DenyAccountControls"
    effect = "Deny"
    actions = [
      "account:CloseAccount",
      "account:DeleteAlternateContact",
      "account:PutAlternateContact",
      "billing:*",
      "aws-portal:*",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "iam_org_guardrail" {
  name        = "${var.name_prefix}-github-deploy-guardrail"
  description = "Phase 1 deny-list preventing CI from mutating IAM trust, Organizations, or account/billing settings."
  policy      = data.aws_iam_policy_document.iam_org_guardrail.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "iam_org_guardrail" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = aws_iam_policy.iam_org_guardrail.arn
}
