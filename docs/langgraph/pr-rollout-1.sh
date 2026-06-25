#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Open the Rollout 1 (job ingestion quality gate) PR.
# Run from your authenticated machine IN /Users/ocheme/afri-talent, AFTER Phase 8
# is merged to main. Flag OFF by default → aggregator behavior unchanged.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="feat/langgraph-rollout-1-job-ingestion"
BASE="main"

git fetch origin "$BASE"
git switch -c "$BRANCH" "origin/$BASE"

git add \
  backend/src/lib/ai/langgraph/integration/jobIngestionAdapter.ts \
  backend/src/lib/ai/langgraph/tests/jobIngestionAdapter.test.ts \
  backend/src/lib/jobs/aggregator/index.ts \
  docs/langgraph/ROLLOUT_1_JOB_INGESTION.md \
  docs/langgraph/pr-rollout-1.sh

git commit -m "feat(ai): wire job ingestion quality gate into aggregator (rollout 1)

Flag-gated (LANGGRAPH_JOB_INGESTION_QUALITY), default off → aggregator unchanged.
- adapter maps graph decision to Job status/risk (publish/warn/hold/reject)
- gate runs in upsertJob when enabled; reject → skip persist; hold → PENDING_REVIEW
- deps use real trust content-risk + deterministic source reliability + ops metric
- 6 new tests; full typecheck + 95/95 langgraph + 15/15 aggregator tests green"

git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create --base "$BASE" --head "$BRANCH" \
    --title "Rollout 1 — Job ingestion quality gate (flag-off, no behavior change)" \
    --body-file docs/langgraph/ROLLOUT_1_JOB_INGESTION.md
fi

echo "Rollout 1 branch pushed. Review CI, merge, then enable LANGGRAPH_JOB_INGESTION_QUALITY in staging."
