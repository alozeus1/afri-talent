plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

# The root stack still carries a small set of ECS/CloudFront-era inputs while the
# App Runner rollout is the active path. We keep these declarations to preserve a
# controlled rollback path, but we do not want them blocking Terraform validation.
rule "terraform_unused_declarations" {
  enabled = false
}
