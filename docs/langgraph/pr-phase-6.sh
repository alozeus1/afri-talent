#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Open the Phase 6 (job ingestion quality + RAG upgrade) PR.
# Run from your authenticated machine IN /Users/ocheme/afri-talent, AFTER Phase 5
# is merged to main. Additive: new graph + RAG tools + an ADDITIVE nullable
# pgvector column/index migration. All new behavior is flag-gated (RAG_PGVECTOR).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="feat/langgraph-phase-6-rag-job-quality"
BASE="main"

git fetch origin "$BASE"
git switch -c "$BRANCH" "origin/$BASE"

# Regenerate the Prisma client for the additive (Unsupported) field on a clean base.
( cd backend && npx prisma generate )

git add \
  backend/src/lib/ai/langgraph/graphs/jobIngestionQuality.graph.ts \
  backend/src/lib/ai/langgraph/tools/ragTools.ts \
  backend/src/lib/ai/langgraph/tests/jobIngestionQuality.test.ts \
  backend/src/lib/ai/langgraph/tests/ragTools.test.ts \
  backend/prisma/schema.prisma \
  backend/prisma/migrations/20260624010000_add_semantic_pgvector_column \
  docs/langgraph/PHASE_6_RAG.md \
  docs/langgraph/pr-phase-6.sh

git commit -m "feat(ai): job ingestion quality graph + RAG upgrade (Phase 6)

Additive + flag-gated (RAG_PGVECTOR off by default) → zero behavior change.
- jobIngestionQuality graph: deterministic quality+source-reliability rubric;
  scam gate (CRITICAL reject / HIGH hold); publish/warn/hold/reject; embed-if-new
- ragTools: explainableSearch with source refs + graceful no-context fallback
- pgvectorSearch (native ANN) behind RAG_PGVECTOR with fallback to in-app path
- additive nullable SemanticDocument.embeddingVector vector(1536) + HNSW index
- 10 new tests; full typecheck + 72/72 langgraph tests green; schema valid"

git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create --base "$BASE" --head "$BRANCH" \
    --title "LangGraph Phase 6 — Job ingestion quality + RAG/pgvector (additive, flag-gated)" \
    --body-file docs/langgraph/PHASE_6_RAG.md
fi

echo "Phase 6 branch pushed. Review CI + the additive migration, then merge."
