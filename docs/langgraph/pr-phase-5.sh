#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Open the Phase 5 (trust verification & moderation) PR.
# Run from your authenticated machine IN /Users/ocheme/afri-talent, AFTER Phase 4
# is merged to main. Purely additive: 3 graphs + tooling + tests. No existing
# runtime file changes.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="feat/langgraph-phase-5-trust-verification"
BASE="main"

git fetch origin "$BASE"
git switch -c "$BRANCH" "origin/$BASE"

git add \
  backend/src/lib/ai/langgraph/tools/trustTools.ts \
  backend/src/lib/ai/langgraph/graphs/employerVerification.graph.ts \
  backend/src/lib/ai/langgraph/graphs/candidateVerification.graph.ts \
  backend/src/lib/ai/langgraph/graphs/trustModeration.graph.ts \
  backend/src/lib/ai/langgraph/tests/trustGraphs.test.ts \
  docs/langgraph/PHASE_5_TRUST.md \
  docs/langgraph/pr-phase-5.sh

git commit -m "feat(ai): trust verification + moderation graphs (Phase 5)

Purely additive; not wired into routes/workers → zero behavior change.
- employer verification: tier branch; CRITICAL auto-suspend; HIGH admin interrupt
- trust moderation: severity triage (log/queue/admin-review/suspend)
- candidate verification: deterministic rubric; document needs admin+TOTP
- admin actions TOTP-gated (totp_required if not verified); audited
- PII-safe (document refs only, never content); injected deps
- 13 new tests; full typecheck + 62/62 langgraph tests green"

git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create --base "$BASE" --head "$BRANCH" \
    --title "LangGraph Phase 5 — Trust verification & moderation (additive, TOTP-gated)" \
    --body-file docs/langgraph/PHASE_5_TRUST.md
fi

echo "Phase 5 branch pushed. Review CI, then merge."
