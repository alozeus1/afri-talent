# Default provider — all modules use this unless they declare a configuration_aliases
# block (only cloudfront-waf does, for the us-east-1 requirement on WAF/CLOUDFRONT).
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "afritalent"
      Environment = var.environment
      Application = "afritalent-platform"
      ManagedBy   = "terraform"
      Owner       = var.owner_tag
      CostCenter  = "engineering"
    }
  }
}

# us-east-1 alias for resources that MUST live in us-east-1 regardless of the
# stack region (CloudFront WAFv2, ACM cert for CloudFront). For this stack
# var.aws_region defaults to us-east-1 anyway, but the alias keeps modules
# explicit and portable to non-us-east-1 stacks later.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "afritalent"
      Environment = var.environment
      Application = "afritalent-platform"
      ManagedBy   = "terraform"
      Owner       = var.owner_tag
      CostCenter  = "engineering"
    }
  }
}
