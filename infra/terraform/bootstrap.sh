#!/usr/bin/env bash
# Bootstrap Terraform state backend (run ONCE before terraform init)
# Usage: ./bootstrap.sh <environment>
set -euo pipefail

ENV=${1:-dev}
ACCOUNT_ID=108188564905
REGION=us-east-1
BUCKET="afritalent-${ENV}-terraform-state"
TABLE="afritalent-${ENV}-terraform-locks"
PROJECT="AfriTalent"

echo "Bootstrapping Terraform state for environment: $ENV"
echo "Account: $ACCOUNT_ID, Region: $REGION"

# Create S3 bucket for state
aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region "$REGION" 2>/dev/null || echo "Bucket $BUCKET already exists"

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms"
      }
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Tag the bucket
aws s3api put-bucket-tagging \
  --bucket "$BUCKET" \
  --tagging "TagSet=[{Key=Project,Value=$PROJECT},{Key=Environment,Value=$ENV},{Key=Owner,Value=alozeus1},{Key=CostCenter,Value=AfriTalent},{Key=ManagedBy,Value=Terraform}]"

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name "$TABLE" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" \
  --tags Key=Project,Value=$PROJECT Key=Environment,Value=$ENV Key=Owner,Value=alozeus1 Key=CostCenter,Value=AfriTalent Key=ManagedBy,Value=Terraform \
  2>/dev/null || echo "DynamoDB table $TABLE already exists"

echo ""
echo "✓ Bootstrap complete!"
echo "  S3 bucket:      s3://$BUCKET"
echo "  DynamoDB table: $TABLE"
echo ""
echo "Next steps:"
echo "  cd infra/terraform"
echo "  terraform init -backend-config=envs/${ENV}/backend.config -var-file=envs/${ENV}/terraform.tfvars"
echo "  terraform plan -var-file=envs/${ENV}/terraform.tfvars"
echo "  terraform apply -var-file=envs/${ENV}/terraform.tfvars"
