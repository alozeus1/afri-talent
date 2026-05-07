# Claude Start Here

Claude agents must also follow `AGENTS.md`, `CODEX.md`, and
`docs/agent-rules.md` when working in this repository.

Non-negotiable: No agent may push directly to main, deploy production, modify
production secrets, apply infrastructure changes, or run destructive database
migrations without explicit human approval.

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
- `CODEX.md` for Codex-specific operating guidance
- `docs/engineering-team.md` for supervised agent roles
- `docs/agent-heartbeat.md` for latest local-safe heartbeat status
- `infra/terraform/README.md` for Terraform and AWS stack details
- `OPS_README.md` for application-level logging and health behavior

Agent-team work should stay branch-based, reversible, and PR-reviewed. Use
`scripts/safe-repo-audit.sh`, `scripts/run-agent-checks.sh`, and
`scripts/agent-heartbeat.sh` for read-only or local-safe maintenance checks.
