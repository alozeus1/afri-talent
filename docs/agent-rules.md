# Agent Rules

## Non-Negotiable Rule

No agent may push directly to main, deploy production, modify production secrets,
apply infrastructure changes, or run destructive database migrations without
explicit human approval.

## General Rules

- Work on branches and deliver through PRs.
- Do not overwrite user or teammate changes.
- Read existing files before editing.
- Stage explicit paths only.
- Keep changes scoped and reversible.
- Prefer tests and documentation updates with every behavior change.
- Do not commit generated reports, local `.env` files, secrets, or production
  credentials.

## Approval Gates

Human approval is required before:

- merge
- production deployment
- staging or production infrastructure apply
- database migration in shared environments
- IAM or secrets changes
- destructive operations
- enabling autonomous scheduled agents with write access

## Escalation

Escalate to a human when a task touches authentication, payments, verification
approval, file upload security, production/staging infrastructure, migrations,
legal/compliance content, or real user data.
