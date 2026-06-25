#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Docs-only PR: add the LangGraph operations section to STAGING_RUNBOOK.md.
# Run from /Users/ocheme/afri-talent. No code/behavior change.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="docs/langgraph-runbook-section"
BASE="main"

git fetch origin "$BASE"
git switch -c "$BRANCH" "origin/$BASE"

git add STAGING_RUNBOOK.md docs/langgraph/pr-runbook-langgraph.sh

git commit -m "docs(runbook): document LangGraph layer, flags, DB objects, rollback

STAGING_RUNBOOK.md had no LangGraph section. Adds current staging flag state
(LANGGRAPH_ENABLED=1 + LANGGRAPH_JOB_INGESTION_QUALITY=1), which graphs are live
vs inert, the additive DB objects, verification signals, and flag rollback."

git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create --base "$BASE" --head "$BRANCH" \
    --title "docs(runbook): LangGraph operations section" \
    --body "Documents the now-live LangGraph layer in STAGING_RUNBOOK.md: flags, DB objects (GraphRun/GraphRunEvent/IdempotencyKey, pgvector column, checkpointer tables), verification signals, and flag-based rollback. No code change."
fi

echo "Runbook docs branch pushed. Review + merge."
