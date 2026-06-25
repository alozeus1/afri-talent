-- Phase 6: native pgvector ANN search for SemanticDocument.
-- Additive + nullable. The pgvector extension is already enabled
-- (migration 20260512000000_enable_pgvector_extension). Existing Float[]
-- `embedding` column and all current search behavior are untouched.
--
-- Rollout: dual-write `embeddingVector` on upsert (behind a flag), backfill
-- existing rows, then flip RAG_PGVECTOR=1 to use ANN search.

-- Add the native vector column (nullable; populated during rollout).
ALTER TABLE "SemanticDocument" ADD COLUMN IF NOT EXISTS "embeddingVector" vector(1536);

-- Approximate-nearest-neighbour index (cosine). HNSW gives good recall/latency.
-- Safe to create now: the column is empty, so the build is instant. Re-tune
-- (m / ef_construction) after backfill if needed.
CREATE INDEX IF NOT EXISTS "SemanticDocument_embeddingVector_hnsw"
  ON "SemanticDocument"
  USING hnsw ("embeddingVector" vector_cosine_ops);
