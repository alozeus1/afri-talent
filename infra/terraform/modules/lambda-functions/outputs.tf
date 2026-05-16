output "lambda_webhook_stripe_arn" {
  description = "ARN of the Stripe webhook Lambda."
  value       = aws_lambda_function.webhook_stripe.arn
}

output "lambda_webhook_stripe_name" {
  description = "Name of the Stripe webhook Lambda."
  value       = aws_lambda_function.webhook_stripe.function_name
}

output "lambda_webhook_stripe_url" {
  description = "Function URL for the Stripe webhook (configure in Stripe dashboard)."
  value       = aws_lambda_function_url.webhook_stripe.function_url
}

output "lambda_webhook_flutterwave_arn" {
  description = "ARN of the Flutterwave webhook Lambda."
  value       = aws_lambda_function.webhook_flutterwave.arn
}

output "lambda_webhook_flutterwave_name" {
  description = "Name of the Flutterwave webhook Lambda."
  value       = aws_lambda_function.webhook_flutterwave.function_name
}

output "lambda_webhook_flutterwave_url" {
  description = "Function URL for the Flutterwave webhook."
  value       = aws_lambda_function_url.webhook_flutterwave.function_url
}

output "lambda_orchestrator_arn" {
  description = "ARN of the orchestrator-step Lambda (invoked by Step Functions)."
  value       = aws_lambda_function.orchestrator.arn
}

output "lambda_orchestrator_name" {
  description = "Name of the orchestrator-step Lambda."
  value       = aws_lambda_function.orchestrator.function_name
}

output "state_machine_orchestrator_arn" {
  description = "ARN of the orchestrator Step Functions state machine."
  value       = aws_sfn_state_machine.orchestrator.arn
}

output "state_machine_orchestrator_name" {
  description = "Name of the orchestrator Step Functions state machine."
  value       = aws_sfn_state_machine.orchestrator.name
}

output "lambda_blog_automation_arn" {
  description = "ARN of the blog-automation Lambda (invoked weekly by EventBridge)."
  value       = aws_lambda_function.blog_automation.arn
}

output "lambda_blog_automation_name" {
  description = "Name of the blog-automation Lambda."
  value       = aws_lambda_function.blog_automation.function_name
}

output "blog_automation_schedule_rule_arn" {
  description = "ARN of the EventBridge rule that triggers the blog-automation Lambda."
  value       = aws_cloudwatch_event_rule.blog_automation_weekly.arn
}

output "blog_automation_schedule_rule_name" {
  description = "Name of the EventBridge rule that triggers the blog-automation Lambda."
  value       = aws_cloudwatch_event_rule.blog_automation_weekly.name
}

output "lambda_role_arns" {
  description = "Map of Lambda role ARNs by logical name (for cross-module trust policies if needed)."
  value = {
    webhook_stripe      = aws_iam_role.webhook_stripe.arn
    webhook_flutterwave = aws_iam_role.webhook_flutterwave.arn
    orchestrator        = aws_iam_role.orchestrator.arn
    blog_automation     = aws_iam_role.blog_automation.arn
  }
}
