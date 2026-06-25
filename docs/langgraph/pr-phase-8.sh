#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Open the Phase 8 (final: complete graph set + hardening) PR.
# Run from your authenticated machine IN /Users/ocheme/afri-talent, AFTER Phase 7
# is merged to main. Purely additive: 3 graphs + catalog + tests + docs.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="feat/langgraph-phase-8-finalize"
BASE="main"

git fetch origin "$BASE"
git switch -c "$BRANCH" "origin/$BASE"

git add \
  backend/src/lib/ai/langgraph/graphs/followUp.graph.ts \
  backend/src/lib/ai/langgraph/graphs/interviewPrep.graph.ts \
  backend/src/lib/ai/langgraph/graphs/billingRecovery.graph.ts \
  backend/src/lib/ai/langgraph/registry/graphInventory.ts \
  backend/src/lib/ai/langgraph/tests/phase8Graphs.test.ts \
  docs/langgraph/README.md \
  docs/langgraph/DEPLOYMENT_CHECKLIST.md \
  docs/langgraph/pr-phase-8.sh

git commit -m "feat(ai): complete graph set + hardening (Phase 8)

Purely additive; flag-gated → zero behavior change. Completes the 12-workflow set.
- follow_up graph: cadence draft + user-approved idempotent send
- interview_prep graph: questions + deterministic readiness score
- billing_recovery graph: reconcile provider vs local; pause/resume premium
- graphInventory: catalog covering all 12 workflows (coverage test)
- docs: README overview + DEPLOYMENT_CHECKLIST (deploy + rollback runbook)
- full typecheck + 89/89 langgraph tests green"

git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create --base "$BASE" --head "$BRANCH" \
    --title "LangGraph Phase 8 — Finalize (complete graph set + hardening)" \
    --body-file docs/langgraph/README.md
fi

echo "Phase 8 branch pushed. Review CI, then merge. This completes the LangGraph program."
