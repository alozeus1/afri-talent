output "vpc_id" {
  description = "ID of the VPC."
  value       = aws_vpc.this.id
}

output "vpc_cidr" {
  description = "Primary IPv4 CIDR block of the VPC."
  value       = aws_vpc.this.cidr_block
}

output "internet_gateway_id" {
  description = "ID of the Internet Gateway attached to the VPC."
  value       = aws_internet_gateway.this.id
}

output "public_subnet_ids" {
  description = "IDs of the 3 public subnets, ordered by AZ."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the 3 private (NAT-routed) subnets, ordered by AZ."
  value       = aws_subnet.private[*].id
}

output "isolated_subnet_ids" {
  description = "IDs of the 3 isolated (DB-only, no internet) subnets."
  value       = aws_subnet.isolated[*].id
}

output "public_route_table_id" {
  description = "ID of the shared public route table."
  value       = aws_route_table.public.id
}

output "private_route_table_ids" {
  description = "IDs of the per-AZ private route tables. Pass these to the NAT instance module so it can add the 0.0.0.0/0 route."
  value       = aws_route_table.private[*].id
}

output "isolated_route_table_ids" {
  description = "IDs of the per-AZ isolated route tables (no internet routes)."
  value       = aws_route_table.isolated[*].id
}

output "sg_alb_id" {
  description = "Security group ID for the ALB."
  value       = aws_security_group.alb.id
}

output "sg_ecs_tasks_id" {
  description = "Security group ID for ECS Fargate tasks."
  value       = aws_security_group.ecs_tasks.id
}

output "sg_lambda_id" {
  description = "Security group ID for Lambda functions in the VPC."
  value       = aws_security_group.lambda.id
}

output "sg_aurora_id" {
  description = "Security group ID for the Aurora cluster."
  value       = aws_security_group.aurora.id
}

output "sg_rds_proxy_id" {
  description = "Security group ID for RDS Proxy."
  value       = aws_security_group.rds_proxy.id
}

output "sg_nat_id" {
  description = "Security group ID for the NAT instance."
  value       = aws_security_group.nat.id
}

output "sg_vpc_endpoints_id" {
  description = "Security group ID applied to interface VPC endpoints."
  value       = aws_security_group.vpc_endpoints.id
}

output "vpc_endpoint_s3_id" {
  description = "ID of the S3 gateway endpoint."
  value       = aws_vpc_endpoint.s3.id
}

output "vpc_endpoint_dynamodb_id" {
  description = "ID of the DynamoDB gateway endpoint."
  value       = aws_vpc_endpoint.dynamodb.id
}

output "interface_vpc_endpoint_ids" {
  description = "Map of interface VPC endpoint name -> endpoint ID."
  value       = { for k, ep in aws_vpc_endpoint.interface : k => ep.id }
}
