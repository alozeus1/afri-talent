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

# §2.11 — IAM prefix scope.
#
# The IAM policy this module emits grants Put/Get/Delete on objects whose
# key starts with any of these prefixes. The ListBucket policy is also
# scoped to these prefixes via the `s3:prefix` condition.
#
# Defaults to `resumes/` for backward compatibility. Callers that store
# additional scopes in the same bucket should append them here (e.g. the
# main uploads bucket currently holds both resumes AND trust artefacts,
# so it needs `["resumes/", "trust/candidates/", "trust/employers/"]`).
#
# The recommended long-term layout is a separate trust bucket — see the
# commented `s3_trust` block in dev-new/main.tf.
variable "prefix_acl" {
  description = "Object-key prefixes the ECS task role can access. Must end with a slash."
  type        = list(string)
  default     = ["resumes/"]

  validation {
    condition     = length(var.prefix_acl) > 0
    error_message = "prefix_acl must contain at least one prefix (e.g. \"resumes/\")."
  }

  validation {
    condition     = alltrue([for p in var.prefix_acl : endswith(p, "/")])
    error_message = "Every entry in prefix_acl must end with a slash so the IAM policy ARN pattern is unambiguous."
  }
}
