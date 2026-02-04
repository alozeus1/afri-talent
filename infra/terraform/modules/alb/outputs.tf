output "alb_arn" {
  value = aws_lb.app.arn
}

output "alb_dns_name" {
  value = aws_lb.app.dns_name
}

output "alb_zone_id" {
  value = aws_lb.app.zone_id
}

output "frontend_target_group_arn" {
  value = aws_lb_target_group.frontend.arn
}

output "backend_target_group_arn" {
  value = aws_lb_target_group.backend.arn
}

output "listener_http_arn" {
  value = aws_lb_listener.http.arn
}

output "listener_https_arn" {
  value = length(aws_lb_listener.https) > 0 ? aws_lb_listener.https[0].arn : ""
}
