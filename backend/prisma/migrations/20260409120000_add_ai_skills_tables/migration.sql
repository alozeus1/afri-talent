-- Migration: add_ai_skills_tables
-- Adds UserResume, CareerAdvice tables and pgvector embedding columns.
-- Additive only — no existing tables or columns are dropped or modified.
-- pgvector columns are added conditionally — migration succeeds even without extension.

-- ── UserResume: AI-generated resume storage (Resume Builder skill) ──────────
CREATE TABLE IF NOT EXISTS "UserResume" (
    "id"        TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "content"   JSONB        NOT NULL,
    "rawText"   TEXT         NOT NULL DEFAULT '',
    "pdfUrl"    TEXT,
    "version"   INTEGER      NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserResume_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserResume_userId_key" ON "UserResume"("userId");

-- ── CareerAdvice: Career advisor session history ─────────────────────────────
CREATE TABLE IF NOT EXISTS "CareerAdvice" (
    "id"            TEXT         NOT NULL,
    "userId"        TEXT         NOT NULL,
    "adviceContent" JSONB        NOT NULL,
    "targetRole"    TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CareerAdvice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CareerAdvice_userId_idx" ON "CareerAdvice"("userId");

-- ── pgvector setup (conditional — only runs if extension is available) ────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'UserResume' AND column_name = 'embedding'
    ) THEN
      EXECUTE 'ALTER TABLE "UserResume" ADD COLUMN embedding vector(1536)';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Job' AND column_name = 'embedding'
    ) THEN
      EXECUTE 'ALTER TABLE "Job" ADD COLUMN embedding vector(1536)';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'Job_embedding_idx'
    ) THEN
      EXECUTE 'CREATE INDEX "Job_embedding_idx" ON "Job" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'UserResume_embedding_idx'
    ) THEN
      EXECUTE 'CREATE INDEX "UserResume_embedding_idx" ON "UserResume" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)';
    END IF;
  END IF;
END
$$;
