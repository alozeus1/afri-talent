-- Wave 3 §12.1 — add an embedding column to CandidateResumeVersion.
--
-- The existing 20260409120000_add_ai_skills_tables migration added an
-- embedding column to Job and UserResume but not to CandidateResumeVersion,
-- which is the model the apply-pathway (Wave 4) and ATS-rubric (Wave 5)
-- agents read from. §12.1 wants both candidate-side and job-side embeddings,
-- so this fills the gap.
--
-- Conditional on the pgvector extension being present (it is, after the
-- 20260512000000_enable_pgvector_extension migration). Guarded so re-runs
-- and environments that still lack pgvector do not break.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'CandidateResumeVersion' AND column_name = 'embedding'
    ) THEN
      EXECUTE 'ALTER TABLE "CandidateResumeVersion" ADD COLUMN embedding vector(1536)';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'CandidateResumeVersion_embedding_idx'
    ) THEN
      EXECUTE 'CREATE INDEX "CandidateResumeVersion_embedding_idx" ON "CandidateResumeVersion" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)';
    END IF;

  END IF;
END
$$;
