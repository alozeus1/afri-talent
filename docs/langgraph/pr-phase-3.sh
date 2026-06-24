#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Open the Phase 3 (human approval + side-effect safety) PR.
# Run from your authenticated machine, AFTER Phase 2 is merged to main.
# Additive graph + idempotency ledger. Live-path change (SES dedup) is flag-gated
# OFF by default → zero behavior change until APPLY_SES_IDEMPOTENCY=1.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="feat/langgraph-phase-3-human-approval"
BASE="main"

git fetch origin "$BASE"
git switch -c "$BRANCH" "origin/$BASE"

git add \
  backend/src/lib/ai/langgraph/tools/idempotency.ts \
  backend/src/lib/ai/langgraph/tools/applyTools.ts \
  backend/src/lib/ai/langgraph/graphs/applicationSubmission.graph.ts \
  backend/src/lib/ai/langgraph/tests/idempotency.test.ts \
  backend/src/lib/ai/langgraph/tests/applicationSubmission.test.ts \
  backend/src/lib/apply/email-draft.ts \
  docs/langgraph/PHASE_3_HITL.md \
  docs/langgraph/pr-phase-3.sh

git commit -m "feat(ai): human-approval interrupt + idempotent side effects (Phase 3)

Additive + flag-gated; default behavior unchanged.
- idempotency ledger runOnce() over IdempotencyKey (dedup, fail-open, crash recovery)
- applicationSubmission graph: interrupt()->resume with exact acknowledgements;
  injected dispatch; idempotent submit; deterministic thread id
- reuses existing apply state machine validateAcknowledgements (single source)
- SES send wrapped in runOnce when APPLY_SES_IDEMPOTENCY=1 (off by default)
- 10 new tests; full typecheck + 60/60 apply+ai tests green"

git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create --base "$BASE" --head "$BRANCH" \
    --title "LangGraph Phase 3 — Human approval + idempotency (additive, flag-off)" \
    --body-file docs/langgraph/PHASE_3_HITL.md
fi

echo "Phase 3 branch pushed. Review CI, then merge."
