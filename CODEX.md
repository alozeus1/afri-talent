# Codex Operating Guide

Codex agents working on AfriTalent must follow the repository rules in
`AGENTS.md`, the live-environment handoff in `STAGING_RUNBOOK.md`, and the
project skill in `.codex/skills/afritalent-operator/SKILL.md`.

## Required Startup

1. Read `AGENT_BOOTSTRAP.md`.
2. Read `STAGING_RUNBOOK.md` before any deployment, infrastructure, incident, or
   staging task.
3. Run `git status --short --branch`.
4. Inspect existing diffs before editing files that are already dirty.
5. Work on a branch. Do not push without explicit instruction.

## Safety Rule

No agent may push directly to main, deploy production, modify production secrets,
apply infrastructure changes, or run destructive database migrations without
explicit human approval.

## Delivery Pattern

- Understand first, then plan, then edit.
- Keep changes small and reversible.
- Stage explicit paths only.
- Validate with the smallest useful checks before broader checks.
- Document important decisions in the relevant `docs/` file.
- Open PRs for review; humans approve merge and deployment.
