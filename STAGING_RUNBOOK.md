# AfriTalent Dev/Staging Runbook

## Architecture
- Frontend: ECS Fargate on dev.afri-talent.com (CloudFront → ALB → ECS)
- Backend API: ECS Fargate on api.dev.afri-talent.com (ALB → ECS)
- Database: RDS PostgreSQL db.t4g.micro (private subnet, us-east-1)
- Secrets: AWS Secrets Manager (afritalent-dev/app-secrets)
- Container Registry: ECR (afritalent-dev-backend, afritalent-dev-frontend)
- State: S3 afritalent-dev-terraform-state / DynamoDB afritalent-dev-terraform-locks

## Prerequisites
- AWS CLI configured (aws sso login or credentials)
- Terraform >= 1.5
- Docker
- Node.js 20

## First-Time Bootstrap

### 1. Bootstrap Terraform state
```bash
cd infra/terraform
chmod +x bootstrap.sh
./bootstrap.sh dev
```

### 2. Request/create ACM certificate
```bash
# Request wildcard cert for afri-talent.com
aws acm request-certificate \
  --domain-name "*.afri-talent.com" \
  --validation-method DNS \
  --region us-east-1

# Get the cert ARN and DNS validation records
aws acm describe-certificate --certificate-arn <ARN> --region us-east-1
# Add the CNAME records to Route53
# Wait for validation (~2 min)
```

### 3. Get Route53 Hosted Zone ID
```bash
aws route53 list-hosted-zones-by-name --dns-name afri-talent.com \
  --query 'HostedZones[0].Id' --output text
# Update infra/terraform/envs/dev/terraform.tfvars with the zone ID and cert ARN
```

### 4. Initialize and apply Terraform
```bash
cd infra/terraform
terraform init -backend-config=envs/dev/backend.config
terraform plan -var-file=envs/dev/terraform.tfvars -out=dev.plan
terraform apply dev.plan
```

### 5. Store application secrets
```bash
# After Terraform apply, add app-level secrets not managed by TF
aws secretsmanager put-secret-value \
  --secret-id afritalent-dev-app-secrets \
  --secret-string '{
    "ANTHROPIC_API_KEY": "<your-key>",
    "STRIPE_SECRET_KEY": "<your-key>",
    "STRIPE_WEBHOOK_SECRET": "<your-key>",
    "AWS_S3_BUCKET": "<bucket>",
    "REDIS_URL": "<if-using-elasticache>"
  }'
```

### 6. Build and push initial Docker images
```bash
# Authenticate to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  108188564905.dkr.ecr.us-east-1.amazonaws.com

# Build and push backend
docker build -t 108188564905.dkr.ecr.us-east-1.amazonaws.com/afritalent-dev-backend:latest ./backend
docker push 108188564905.dkr.ecr.us-east-1.amazonaws.com/afritalent-dev-backend:latest

# Build and push frontend (with correct API URL)
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.dev.afri-talent.com \
  --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.dev.afri-talent.com \
  -t 108188564905.dkr.ecr.us-east-1.amazonaws.com/afritalent-dev-frontend:latest \
  ./frontend
docker push 108188564905.dkr.ecr.us-east-1.amazonaws.com/afritalent-dev-frontend:latest
```

### 7. Run database migrations
```bash
# Run as ECS task (backend image includes Prisma CLI)
aws ecs run-task \
  --cluster afritalent-dev-cluster \
  --task-definition afritalent-dev-backend \
  --launch-type FARGATE \
  --overrides '{"containerOverrides":[{"name":"backend","command":["sh","-c","npx prisma migrate deploy && echo DONE"]}]}' \
  --network-configuration "awsvpcConfiguration={subnets=[<private-subnet-id>],securityGroups=[<ecs-sg-id>],assignPublicIp=DISABLED}" \
  --region us-east-1
```

### 8. Force ECS service redeployment
```bash
aws ecs update-service --cluster afritalent-dev-cluster --service afritalent-dev-backend --force-new-deployment
aws ecs update-service --cluster afritalent-dev-cluster --service afritalent-dev-frontend --force-new-deployment
aws ecs wait services-stable --cluster afritalent-dev-cluster --services afritalent-dev-backend afritalent-dev-frontend
```

## CI/CD (Automated)
- Push to `develop` → GitHub Actions builds + pushes ECR + deploys ECS automatically
- PRs to `develop` or `main` → CI tests run (no deploy)

## Operational Procedures

### View live logs
```bash
aws logs tail /ecs/afritalent-dev/backend --follow
aws logs tail /ecs/afritalent-dev/frontend --follow
```

### AI Kill Switch (emergency)
```bash
# Via AWS console: ECS → afritalent-dev-backend service → Update → Environment variables → AI_DISABLED=1
# Or via Secrets Manager update + force redeploy
# Immediate effect: all /api/orchestrator/run calls return 503
```

### Scale ECS service
```bash
aws ecs update-service --cluster afritalent-dev-cluster \
  --service afritalent-dev-backend --desired-count 2
```

### Rollback to previous image
```bash
# Get previous task definition
aws ecs describe-task-definition --task-definition afritalent-dev-backend
# Update service to previous revision
aws ecs update-service --cluster afritalent-dev-cluster \
  --service afritalent-dev-backend \
  --task-definition afritalent-dev-backend:<PREVIOUS_REVISION>
```

### Tear down dev environment (full)
```bash
cd infra/terraform
terraform destroy -var-file=envs/dev/terraform.tfvars
# Then manually: delete ECR images, empty S3 state bucket, delete DynamoDB table
```

## Monitoring & Alerts
- CloudWatch alarms → SNS → alozeus1@gmail.com
- Alarm thresholds:
  - Backend 5xx > 10 in 5 min
  - Unhealthy ECS hosts > 0
  - RDS CPU > 80% for 15 min
  - RDS free storage < 2GB

## Cost Estimate (dev, us-east-1)
| Resource | Instance | Est. Monthly |
|----------|----------|-------------|
| RDS Postgres | db.t4g.micro | ~$14 |
| ECS Fargate (backend 1x) | 0.25 vCPU / 0.5GB | ~$8 |
| ECS Fargate (frontend 1x) | 0.25 vCPU / 0.5GB | ~$8 |
| ALB | - | ~$16 |
| NAT Gateway | - | ~$32 |
| CloudFront | - | ~$1 |
| CloudWatch + ECR + SM | - | ~$5 |
| **Total** | | **~$84/mo** |
