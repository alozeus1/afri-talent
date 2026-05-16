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
# stack region (CloudFront WAFv2, ACM cert for CloudFront).
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

# DR-region alias (Wave 8 §9.3). Hosts the cross-region AWS Backup vault that
# receives copies of every Aurora recovery point produced by the primary plan.
# Region driven by var.dr_region (default us-west-2 per spec).
provider "aws" {
  alias  = "dr"
  region = var.dr_region

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
