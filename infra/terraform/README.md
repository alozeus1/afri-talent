## AfriTalent Terraform Infrastructure (AWS ECS)

This Terraform stack provisions an enterprise-ready AWS deployment for the AfriTalent application:

- VPC with public/private subnets across multiple AZs
- Internet Gateway + NAT for outbound access
- ECS Fargate cluster and services (frontend + backend)
- Application Load Balancer with path routing (`/api/*` → backend)
- RDS PostgreSQL (private subnets)
- ECR repositories for container images
- Secrets Manager for `DATABASE_URL` + `JWT_SECRET`
- CloudWatch logs + autoscaling policies

### Prerequisites

- Terraform >= 1.5
- AWS CLI configured with credentials
- Docker installed for building/pushing images

### Remote State (Recommended)

This stack uses an S3 backend. Configure it during init:

```bash
terraform init \
  -backend-config="bucket=your-tf-state-bucket" \
  -backend-config="key=afritalent/prod/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=your-tf-lock-table"
```

### Quick Start

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

### Build & Push Images

Terraform creates ECR repos. Build images using the repo URLs from outputs:

```bash
# Backend
docker build -t <backend_repo_url>:latest ./backend
docker push <backend_repo_url>:latest

# Frontend (NEXT_PUBLIC_API_URL is baked at build time)
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://<alb_dns_name> \
  -t <frontend_repo_url>:latest ./frontend
docker push <frontend_repo_url>:latest
```

Then update `frontend_image` / `backend_image` in `terraform.tfvars` and re-apply.

### Notes

- The frontend uses `NEXT_PUBLIC_API_URL` during build; ensure it matches the ALB URL.
- The backend expects `/health` for ALB health checks.
- HTTPS is supported by passing `acm_certificate_arn`.

