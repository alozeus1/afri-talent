locals {
  name_prefix = "${var.project_name}-${var.environment}"
  protocol    = var.acm_certificate_arn == "" ? "http" : "https"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

