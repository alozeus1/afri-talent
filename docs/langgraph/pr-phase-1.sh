#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Open the Phase 1 (LangGraph foundation) PR.
# Run from your authenticated machine (the agent sandbox cannot push).
# Safe: additive only, feature-flagged off, no runtime wiring.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="feat/langgraph-phase-1-foundation"
BASE="main"

git fetch origin "$BASE"
git switch -c "$BRANCH" "origin/$BASE"

# Regenerate the lockfile + prisma client for the new deps on a clean base.
( cd backend && npm install && npx prisma generate )

git add \
  backend/package.json backend/package-lock.json \
  backend/prisma/schema.prisma \
  backend/prisma/migrations/20260624000000_add_langgraph_orchestration \
  backend/src/lib/ai/langgraph \
  docs/langgraph/AUDIT_AND_PLAN.md \
  docs/langgraph/PHASE_1_FOUNDATION.md \
  docs/langgraph/pr-phase-1.sh

git commit -m "feat(ai): LangGraph foundation (Phase 1) — state, registries, policies, observability

Additive, feature-flagged (LANGGRAPH_ENABLED, default off). Zero behavior change.
- BaseGraphState (Zod) + Annotation channels + reducers
- model/tool/risk/human-approval/quota policies
- skill + graph registries (seeded from existing agents/skills)
- structured graph events + tracing + metrics (PII-free)
- Postgres checkpointer factory (Memory in test/mock)
- GraphRun/GraphRunEvent/IdempotencyKey models + migration
- 26 unit tests; module typechecks"

git push -u origin "$BRANCH"

# Open the PR (requires gh; otherwise use the URL git prints on push).
if command -v gh >/dev/null 2>&1; then
  gh pr create --base "$BASE" --head "$BRANCH" \
    --title "LangGraph Phase 1 — Foundation (additive, flag-off)" \
    --body-file docs/langgraph/PHASE_1_FOUNDATION.md
fi

echo "Phase 1 branch pushed. Review CI (lint/typecheck/test/security scans), then merge."
