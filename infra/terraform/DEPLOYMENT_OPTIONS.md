# AfriTalent Infrastructure Deployment Options

## Overview

This infrastructure supports two deployment modes:

| Mode | Monthly Cost | Best For |
|------|-------------|----------|
| **ECS Fargate** (default) | ~$150-200 | Production, high traffic |
| **App Runner** | ~$30-50 | Staging, dev, low traffic |

## Current Configuration

By default, `main.tf` uses **ECS Fargate** with:
- Application Load Balancer
- NAT Gateway for private subnets
- Auto-scaling (min 1, max 6 instances)

## Switching to App Runner (Cost-Effective Mode)

To use App Runner instead of ECS:

```bash
cd infra/terraform

# Disable ECS configuration
mv main.tf main-ecs.tf.disabled

# Enable App Runner configuration  
mv main-apprunner.tf.disabled main-apprunner.tf

# Re-initialize and apply
terraform init
terraform plan -var-file=envs/dev/terraform.tfvars
terraform apply -var-file=envs/dev/terraform.tfvars
```

## Switching Back to ECS

```bash
cd infra/terraform

# Disable App Runner
mv main-apprunner.tf main-apprunner.tf.disabled

# Enable ECS
mv main-ecs.tf.disabled main.tf

terraform init
terraform plan -var-file=envs/dev/terraform.tfvars
terraform apply -var-file=envs/dev/terraform.tfvars
```

## Cost Breakdown

### ECS Fargate (~$150-200/month)
- ECS Tasks (2 services x 0.25 vCPU): ~$30
- Application Load Balancer: ~$20
- NAT Gateway: ~$32/AZ
- RDS db.t4g.micro: ~$15
- CloudWatch Logs: ~$5
- ECR Storage: ~$2

### App Runner (~$30-50/month)
- App Runner (2 services, pay-per-request): ~$10-25
- RDS db.t4g.micro: ~$15
- CloudWatch Logs: ~$3
- ECR Storage: ~$2

## Important Notes

1. **Don't run both configs simultaneously** - They define the same resources
2. **State migration** - Switching modes will destroy existing ECS/App Runner resources
3. **DNS updates** - App Runner provides different URLs; update Route53 if using custom domains
