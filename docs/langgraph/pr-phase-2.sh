#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Open the Phase 2 (wrap existing orchestrator) PR.
# Run from your authenticated machine, AFTER Phase 1 is merged to main.
# Code-only: no schema/dep/migration changes. Flag-gated off → zero behavior change.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="feat/langgraph-phase-2-wrap-orchestrator"
BASE="main"

git fetch origin "$BASE"
git switch -c "$BRANCH" "origin/$BASE"

git add \
  backend/src/server.ts \
  backend/src/lib/ai/orchestrator/index.ts \
  backend/src/lib/ai/langgraph/index.ts \
  backend/src/lib/ai/langgraph/graphs/orchestratorWrap.graph.ts \
  backend/src/lib/ai/langgraph/tools/prismaTools.ts \
  backend/src/lib/ai/langgraph/tests/orchestratorWrap.test.ts \
  docs/langgraph/PHASE_2_WRAP.md \
  docs/langgraph/pr-phase-2.sh

git commit -m "feat(ai): wrap orchestrator in LangGraph (Phase 2)

Flag-gated (LANGGRAPH_ENABLED / per-graph), default off → zero behavior change.
- runOrchestrator split into thin dispatcher + unchanged runOrchestratorCore
- orchestratorWrap graph: init->execute->finalize with checkpointing + events
- GraphRun/GraphRunEvent best-effort persistence + Prisma event sink
- bootstrapLangGraph() wired into server startup (no-op when flag off)
- output parity preserved; PII kept out of checkpointed channels
- 5 new wrap tests; full project typecheck + 50/50 AI tests green"

git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create --base "$BASE" --head "$BRANCH" \
    --title "LangGraph Phase 2 — Wrap orchestrator (flag-off, parity)" \
    --body-file docs/langgraph/PHASE_2_WRAP.md
fi

echo "Phase 2 branch pushed. Review CI, then merge."
