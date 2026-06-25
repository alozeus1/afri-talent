#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Open the Rollout 2 (interview prep graph) PR.
# Run from your authenticated machine IN /Users/ocheme/afri-talent, AFTER Rollout 1
# is merged to main. Flag OFF by default → route behavior unchanged.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="feat/langgraph-rollout-2-interview-prep"
BASE="main"

git fetch origin "$BASE"
git switch -c "$BRANCH" "origin/$BASE"

git add \
  backend/src/lib/ai/langgraph/integration/interviewPrepAdapter.ts \
  backend/src/lib/ai/langgraph/tests/interviewPrepAdapter.test.ts \
  backend/src/routes/autopilot.ts \
  docs/langgraph/ROLLOUT_2_INTERVIEW_PREP.md \
  docs/langgraph/pr-rollout-2.sh

git commit -m "feat(ai): wire interview prep graph into autopilot route (rollout 2)

Flag-gated (LANGGRAPH_INTERVIEW_PREP), default off → route unchanged.
- adapter wraps buildInterviewPrepPack in the interviewPrep graph
- adds deterministic readinessScore + GraphRun audit; pack built once
- no external side effects; backward-compatible response
- 4 new tests; full typecheck + 99/99 langgraph tests green"

git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create --base "$BASE" --head "$BRANCH" \
    --title "Rollout 2 — Interview prep graph (flag-off, no behavior change)" \
    --body-file docs/langgraph/ROLLOUT_2_INTERVIEW_PREP.md
fi

echo "Rollout 2 branch pushed. Review CI, merge, then enable LANGGRAPH_INTERVIEW_PREP in staging."
