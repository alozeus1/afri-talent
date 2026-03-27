variable "bucket_name" {
  description = "S3 bucket name (e.g. afritalent-staging-uploads)"
  type        = string
}

variable "environment" {
  description = "Environment tag (staging, prod)"
  type        = string
  default     = "staging"
}

variable "allowed_origins" {
  description = "Origins allowed in CORS for presigned PUT uploads"
  type        = list(string)
  default     = ["http://localhost:3000"]
}
