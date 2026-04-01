# Claude Start Here

For any deployment, staging, infrastructure, incident, or recovery task in this repo:

1. Read `STAGING_RUNBOOK.md` first
2. Treat it as the current source of truth for:
   - live staging state
   - App Runner services and URLs
   - AWS resource names
   - last known deployment progress
   - troubleshooting and recovery steps
3. After any material live change, update `STAGING_RUNBOOK.md` in the same session

Secondary references:

- `AGENTS.md` for repo rules and build/test guidance
- `infra/terraform/README.md` for Terraform and AWS stack details
- `OPS_README.md` for application-level logging and health behavior
