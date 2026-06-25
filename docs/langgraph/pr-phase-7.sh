#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Open the Phase 7 (blog automation) PR.
# Run from your authenticated machine IN /Users/ocheme/afri-talent, AFTER Phase 6
# is merged to main. Purely additive: one graph + tests. No existing file changes.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="feat/langgraph-phase-7-blog-automation"
BASE="main"

git fetch origin "$BASE"
git switch -c "$BRANCH" "origin/$BASE"

git add \
  backend/src/lib/ai/langgraph/graphs/blogAutomation.graph.ts \
  backend/src/lib/ai/langgraph/tests/blogAutomation.test.ts \
  docs/langgraph/PHASE_7_BLOG.md \
  docs/langgraph/pr-phase-7.sh

git commit -m "feat(ai): blog automation graph with human-gated publish (Phase 7)

Purely additive; not wired into the worker → zero behavior change.
- source -> factCheck -> write -> createDraft -> admin interrupt -> publish
- deterministic source-credibility scoring; low-credibility blocked pre-draft
- preserves Resource(published=false)+AdminReview(PENDING); publishes only after
  admin approval; idempotent publish (no double-publish on replay)
- nothing reaches readers without approval (test-covered); injected deps
- 6 new tests; full typecheck + 78/78 langgraph tests green"

git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create --base "$BASE" --head "$BRANCH" \
    --title "LangGraph Phase 7 — Blog automation (human-gated publish, additive)" \
    --body-file docs/langgraph/PHASE_7_BLOG.md
fi

echo "Phase 7 branch pushed. Review CI, then merge."
