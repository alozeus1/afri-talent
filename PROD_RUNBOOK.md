# AfriTalent Production Runbook

> ⚠️ Production is not yet deployed. Use this as the blueprint when ready.

## Pre-Production Checklist
- [ ] Separate prod tfvars with prod-grade sizing
- [ ] RDS: db.t4g.small, Multi-AZ, deletion_protection=true, 30-day backups
- [ ] ECS: min 2 tasks each service, max 6
- [ ] CloudFront: WAF attached
- [ ] Secrets rotated from dev
- [ ] ANTHROPIC_API_KEY set with separate prod key
- [ ] Stripe production keys configured
- [ ] DNS: prod.afri-talent.com or afri-talent.com
- [ ] ACM cert for production domain
- [ ] GitHub branch protection on main (require PR + CI pass)
- [ ] DAILY_APPLY_PACK_LIMIT reviewed for prod

## Deploy to Prod (when ready)
```bash
cd infra/terraform
./bootstrap.sh prod
terraform init -backend-config=envs/prod/backend.config
terraform apply -var-file=envs/prod/terraform.tfvars
```

## Emergency Procedures
- AI kill switch: set AI_DISABLED=1 in ECS task environment → redeploy
- DB failover: RDS Multi-AZ handles automatically (Multi-AZ required for prod)
- Full rollback: `terraform destroy` (DANGEROUS — data loss risk; backup first)
