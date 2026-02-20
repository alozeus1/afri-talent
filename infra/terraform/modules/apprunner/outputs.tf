output "backend_service_arn" {
  description = "ARN of the backend App Runner service"
  value       = aws_apprunner_service.backend.arn
}

output "backend_service_url" {
  description = "URL of the backend App Runner service"
  value       = "https://${aws_apprunner_service.backend.service_url}"
}

output "backend_service_id" {
  description = "ID of the backend App Runner service"
  value       = aws_apprunner_service.backend.service_id
}

output "frontend_service_arn" {
  description = "ARN of the frontend App Runner service"
  value       = aws_apprunner_service.frontend.arn
}

output "frontend_service_url" {
  description = "URL of the frontend App Runner service"
  value       = "https://${aws_apprunner_service.frontend.service_url}"
}

output "frontend_service_id" {
  description = "ID of the frontend App Runner service"
  value       = aws_apprunner_service.frontend.service_id
}

output "vpc_connector_arn" {
  description = "ARN of the VPC connector"
  value       = aws_apprunner_vpc_connector.main.arn
}

output "instance_role_arn" {
  description = "ARN of the App Runner instance role"
  value       = aws_iam_role.apprunner_instance.arn
}

output "instance_role_name" {
  description = "Name of the App Runner instance role"
  value       = aws_iam_role.apprunner_instance.name
}

# Custom domain validation records (for Route53)
output "backend_custom_domain_records" {
  description = "DNS validation records for backend custom domain"
  value       = var.api_domain_name != "" ? aws_apprunner_custom_domain_association.backend[0].certificate_validation_records : []
}

output "frontend_custom_domain_records" {
  description = "DNS validation records for frontend custom domain"
  value       = var.frontend_domain_name != "" ? aws_apprunner_custom_domain_association.frontend[0].certificate_validation_records : []
}
