output "alb_arn" {
  description = "ARN of the Application Load Balancer."
  value       = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "Public DNS name of the ALB (used as CloudFront origin)."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone ID of the ALB (for Route 53 alias records)."
  value       = aws_lb.this.zone_id
}

output "alb_arn_suffix" {
  description = "ARN suffix of the ALB (used in CloudWatch metric dimensions)."
  value       = aws_lb.this.arn_suffix
}

output "http_listener_arn" {
  description = "ARN of the HTTP :80 listener (redirect to HTTPS)."
  value       = aws_lb_listener.http.arn
}

output "https_listener_arn" {
  description = "ARN of the HTTPS :443 listener (empty when var.acm_certificate_arn is unset)."
  value       = length(aws_lb_listener.https) > 0 ? aws_lb_listener.https[0].arn : ""
}

output "target_group_frontend_arn" {
  description = "ARN of the frontend target group (port 3000)."
  value       = aws_lb_target_group.frontend.arn
}

output "target_group_backend_arn" {
  description = "ARN of the backend target group (port 3001)."
  value       = aws_lb_target_group.backend.arn
}

output "target_group_frontend_arn_suffix" {
  description = "ARN suffix of the frontend target group (CloudWatch dimensions)."
  value       = aws_lb_target_group.frontend.arn_suffix
}

output "target_group_backend_arn_suffix" {
  description = "ARN suffix of the backend target group (CloudWatch dimensions)."
  value       = aws_lb_target_group.backend.arn_suffix
}
