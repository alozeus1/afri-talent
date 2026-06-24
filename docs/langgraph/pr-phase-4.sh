#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Open the Phase 4 (candidate autopilot) PR.
# Run from your authenticated machine IN /Users/ocheme/afri-talent (the folder
# that has the files), AFTER Phase 3 is merged to main.
# Purely additive: a new graph + tests. No existing runtime file changes.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="feat/langgraph-phase-4-candidate-autopilot"
BASE="main"

git fetch origin "$BASE"
git switch -c "$BRANCH" "origin/$BASE"

git add \
  backend/src/lib/ai/langgraph/graphs/candidateAutopilot.graph.ts \
  backend/src/lib/ai/langgraph/tests/candidateAutopilot.test.ts \
  docs/langgraph/PHASE_4_AUTOPILOT.md \
  docs/langgraph/pr-phase-4.sh

git commit -m "feat(ai): candidate autopilot graph with safety gates (Phase 4)

Purely additive; not wired into the worker → zero behavior change.
- deterministic gates: opt-in, entitlement+billing, profile completeness,
  trust/risk tier, apply capacity (typed block reasons)
- generates apply packs only; NO submit path (deps interface has no submit)
- caps generation by min(remaining caps, AI apply-pack quota, matches)
- idempotent candidate notification; deterministic thread id
- 9 new tests; full typecheck + 50/50 langgraph tests green"

git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create --base "$BASE" --head "$BRANCH" \
    --title "LangGraph Phase 4 — Candidate autopilot (additive, safe-by-construction)" \
    --body-file docs/langgraph/PHASE_4_AUTOPILOT.md
fi

echo "Phase 4 branch pushed. Review CI, then merge."
