output "nat_instance_id" {
  description = "EC2 instance ID of the NAT instance."
  value       = aws_instance.nat.id
}

output "nat_instance_eni_id" {
  description = "ENI ID of the NAT instance's primary network interface (route target for private subnets)."
  value       = aws_network_interface.nat.id
}

output "nat_instance_role_arn" {
  description = "IAM role ARN attached to the NAT instance (SSM Session Manager)."
  value       = aws_iam_role.nat.arn
}

output "nat_ami_id" {
  description = "AMI ID resolved for the fck-nat image."
  value       = data.aws_ami.fck_nat.id
}
