variable "bucket_name" {
  description = "S3 bucket name (e.g. afritalent-dev-uploads)"
  type        = string
}

variable "environment" {
  description = "Environment tag (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "allowed_origins" {
  description = "Origins allowed in CORS for presigned PUT uploads"
  type        = list(string)
  default     = ["http://localhost:3000"]
}
