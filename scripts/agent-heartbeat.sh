#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
branch="$(git branch --show-current 2>/dev/null || echo unknown)"
status_output="$(git status --short --branch)"
checks_status="not run"
known_failures="none"
recommended_next_tasks="Review open tickets under tickets/ and run targeted checks for active work."
risks="No production, infrastructure, secret, or database changes are permitted without human approval."
pending_approvals="Merge, deployment, infrastructure apply, database migration, IAM changes, and secret changes."

if [ -z "$(git status --porcelain)" ]; then
  default_branch="$(git remote show origin 2>/dev/null | awk '/HEAD branch/ {print $NF}' || true)"
  if [ -n "$default_branch" ]; then
    echo "Clean working tree; fetching latest origin/$default_branch."
    git fetch origin "$default_branch" --quiet || true
  fi
else
  echo "Working tree is dirty; skipping pull/fetch merge."
fi

if scripts/run-agent-checks.sh; then
  checks_status="pass"
else
  checks_status="fail"
  known_failures="One or more agent checks failed. Review command output."
fi

ticket_summary="$(find tickets -type f -name '*.md' 2>/dev/null | sort | sed 's#^#- #' || true)"
if [ -z "$ticket_summary" ]; then
  ticket_summary="- No tickets found."
fi

cat > docs/agent-heartbeat.md <<EOF
# Agent Heartbeat

Last run: $timestamp

## Latest Status

- Branch: $branch
- Test status: $checks_status
- Known failures: $known_failures
- Recommended next tasks: $recommended_next_tasks
- Risks: $risks
- Pending human approvals: $pending_approvals

## Git Status

\`\`\`text
$status_output
\`\`\`

## Open Tickets

$ticket_summary

## Safety

This heartbeat did not commit, push, deploy, apply infrastructure, modify
secrets, or run destructive database commands.
EOF

echo "Updated docs/agent-heartbeat.md"
