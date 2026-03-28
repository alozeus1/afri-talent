## AfriTalent Terraform Infrastructure (AWS App Runner)

This Terraform stack provisions the active AWS deployment path for AfriTalent:

- VPC with public and private subnets across multiple AZs
- NAT-enabled outbound path for private backend egress when third-party APIs are required
- App Runner services for frontend and backend
- Amazon RDS PostgreSQL in private subnets
- ECR repositories for application images
- AWS Secrets Manager for application runtime secrets
- S3 uploads bucket with KMS encryption
- CloudWatch dashboards, alarms, log-derived operational metrics, and synthetic public journey monitoring
- GitHub Actions OIDC role for CI/CD

### Environment Layout

- `envs/staging`
- `envs/prod`

Each environment has:

- `backend.config` for remote state
- `terraform.tfvars` for environment sizing and domain configuration

### Prerequisites

- Terraform `>= 1.5`
- AWS CLI configured
- Docker

### Staging Quick Start

```bash
cd infra/terraform
terraform init -backend-config=envs/staging/backend.config
terraform plan -var-file=envs/staging/terraform.tfvars -out=staging.plan
terraform apply staging.plan
```

### Production Quick Start

```bash
cd infra/terraform
terraform init -backend-config=envs/prod/backend.config
terraform plan -var-file=envs/prod/terraform.tfvars -out=prod.plan
terraform apply prod.plan
```

### Key Outputs

```bash
terraform output -raw frontend_url
terraform output -raw backend_url
terraform output -raw ecr_frontend_repo_url
terraform output -raw ecr_backend_repo_url
terraform output -raw github_actions_role_arn
```

### CI/CD

- `deploy-apprunner.yml` auto-deploys `staging` from `develop`
- `deploy-apprunner.yml` also supports manual `staging` and `prod` deployments
- `terraform.yml` validates and plans Terraform changes

### GitHub Configuration

Required secrets:

- `AWS_ROLE_ARN`
- `SENTRY_AUTH_TOKEN`

Required variables:

- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `NEXT_PUBLIC_SENTRY_DSN`

### Health Verification

```bash
curl https://api.staging.afri-talent.com/health
curl https://staging.afri-talent.com
curl https://api.afri-talent.com/health
curl https://api.afri-talent.com/api/health
curl https://afri-talent.com
```

### Notes

- The frontend build bakes `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_BACKEND_URL`.
- The backend supports both `/health` and `/api/health` for direct and path-prefixed probes.
- If the backend needs both private RDS access and public internet egress, keep NAT enabled.
- Monitoring resources are defined in `monitoring-apprunner.tf`.
- Operational docs live in `docs/ops/` and `docs/runbooks/`.
