# LangGraph — Phase 6: Job ingestion quality + RAG upgrade

**Status:** Implemented, full project typecheck clean, 72/72 langgraph tests green (10 new), Prisma schema valid. **Additive + flag-gated** → zero behavior change by default.

## Part A — Job ingestion quality graph
`graphs/jobIngestionQuality.graph.ts`: `dedup → score → decide → embed → finalize`.
- **Deterministic, explainable rubric** (anti-inflation): penalties for missing salary / location / requirements / thin description / staleness, blended `0.7·contentQuality + 0.3·sourceReliability`. Returns a `breakdown[]`.
- **Scam gate** via the existing trust content-risk assessment (injected): CRITICAL → `reject`, HIGH → `hold`.
- **Decision**: `publish | publish_with_warning | hold | reject`. Only `publish` / `publish_with_warning` get embedded.
- Duplicate fingerprints are rejected without embedding. All deps injected → fully testable.

## Part B — RAG upgrade
`tools/ragTools.ts`:
- **`explainableSearch()`** — every result carries **source references** (`sourceType:sourceId`, title, score) and a **confidence**; graceful **no-context fallback** (`hasContext:false`) so agents never answer from vague memory and never throw on a search backend error.
- **`pgvectorSearch()`** — native pgvector ANN search that fixes the **O(n) in-app cosine scan** (gap G2). Flag-gated behind `RAG_PGVECTOR=1` and **wrapped with a fallback** to the existing path on any error → always safe to enable.
- **Schema/migration (additive):** `SemanticDocument.embeddingVector vector(1536)` (nullable) + an **HNSW cosine index**. The pgvector extension is already enabled. Existing `Float[] embedding` and all current search behavior are untouched.

## Safety guarantees (test-covered)
- Ingestion: high-quality → publish+embed; duplicate → reject (no embed); mid → publish_with_warning; low → hold (no embed); scam CRITICAL → reject; scam HIGH → hold.
- RAG: source refs attached; below-threshold filtered; no-context fallback; never throws on backend error.

## Files
- `backend/src/lib/ai/langgraph/graphs/jobIngestionQuality.graph.ts`, `tools/ragTools.ts`
- `backend/src/lib/ai/langgraph/tests/{jobIngestionQuality,ragTools}.test.ts`
- `backend/prisma/schema.prisma` (additive field) + `prisma/migrations/20260624010000_add_semantic_pgvector_column/`

## Verify locally
```bash
cd backend
npx prisma generate        # picks up the additive (Unsupported) field
npm run typecheck
LOG_LEVEL=silent MOCK_AI=1 NODE_ENV=test npx vitest run src/lib/ai/langgraph
# Review the migration before applying; never auto-apply to prod:
# prisma/migrations/20260624010000_add_semantic_pgvector_column/migration.sql
```

## pgvector rollout (after merge — do NOT enable blindly)
1. Apply the migration on staging (`prisma migrate deploy`); confirm the HNSW index builds.
2. **Dual-write** `embeddingVector` on upsert + **backfill** existing rows from `embedding` (raw `UPDATE ... SET "embeddingVector" = ...::vector`). The semantic-indexer is the natural place to wire this.
3. Once backfilled, set `RAG_PGVECTOR=1` and compare result parity vs. the in-app path; then promote. Roll back instantly by unsetting the flag.

## Next (Phase 7)
Blog automation graph: preserve admin-approval-before-publish, improve fact-check + source-credibility scoring.
