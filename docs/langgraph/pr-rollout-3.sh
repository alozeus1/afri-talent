#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Open the Rollout 3 (candidate autopilot safety gate) PR.
# Run from your authenticated machine IN /Users/ocheme/afri-talent.
# Independent of Rollout 2 (different files). Flag OFF by default → worker unchanged.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="feat/langgraph-rollout-3-autopilot-gate"
BASE="main"

git fetch origin "$BASE"
git switch -c "$BRANCH" "origin/$BASE"

git add \
  backend/src/lib/ai/langgraph/integration/candidateAutopilotAdapter.ts \
  backend/src/lib/ai/langgraph/tests/candidateAutopilotAdapter.test.ts \
  backend/src/workers/auto-apply.ts \
  docs/langgraph/ROLLOUT_3_AUTOPILOT.md \
  docs/langgraph/pr-rollout-3.sh

git commit -m "feat(ai): wire candidate autopilot safety gate into auto-apply (rollout 3)

Flag-gated (LANGGRAPH_CANDIDATE_AUTOPILOT), default off → worker unchanged.
- per-user preflight gate: opt-in, entitlement+billing, profile completeness,
  trust/risk tier, capacity; blocked users skipped before pack prep
- gate-only mode (no matches) reuses the Phase 4 graph; cached per user/cycle
- generation loop untouched; reversible
- 7 new tests; full typecheck + 106/106 langgraph tests green"

git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create --base "$BASE" --head "$BRANCH" \
    --title "Rollout 3 — Candidate autopilot safety gate (flag-off, no behavior change)" \
    --body-file docs/langgraph/ROLLOUT_3_AUTOPILOT.md
fi

echo "Rollout 3 branch pushed. Review CI, merge, then enable LANGGRAPH_CANDIDATE_AUTOPILOT in staging."
