# Release Process

## Branching

- Branch from `develop` for normal work.
- Open PRs back into `develop`.
- Merge only after review and required checks pass.
- Promote to `main` only after staging validation and human approval.

## Validation Before PR

Run the smallest relevant set first, then broaden as needed:

```bash
cd backend && npm run lint && npm run typecheck && npm test && npm run build
cd frontend && npm run lint && npx tsc --noEmit && npm run test:unit:ci && npm run build
cd frontend && npm run test:e2e
cd infra/terraform && terraform fmt -check -recursive && terraform init -backend=false && terraform validate
```

## Staging

- `develop` is the staging integration branch.
- Shared staging deploys through GitHub Actions and AWS App Runner.
- Validate backend `/health`, backend `/api/health`, and frontend root after
  deployment.

## Production

- Production deploys require explicit human approval.
- Production secrets, IAM, Terraform applies, and migrations require explicit
  human approval.
- Rollback plans must be documented before production-impacting changes.
