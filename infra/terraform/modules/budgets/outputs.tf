output "budget_arn" {
  description = "ARN of the AWS Budgets budget."
  value       = aws_budgets_budget.monthly.arn
}

output "budget_name" {
  description = "Name of the AWS Budgets budget."
  value       = aws_budgets_budget.monthly.name
}
