-- Semantic retrieval foundation for staging and future production RAG work.
-- Uses Postgres array storage so the platform can ship cleanly without assuming
-- pgvector availability on every target environment yet.

CREATE TABLE "SemanticDocument" (
  "id" TEXT NOT NULL,
  "namespace" VARCHAR(100) NOT NULL,
  "sourceType" VARCHAR(100) NOT NULL,
  "sourceId" VARCHAR(191) NOT NULL,
  "title" VARCHAR(300),
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "embedding" DOUBLE PRECISION[] NOT NULL,
  "embeddingDimensions" INTEGER NOT NULL,
  "embeddingProvider" VARCHAR(50) NOT NULL,
  "embeddingModel" VARCHAR(100) NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "lastIndexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SemanticDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SemanticDocument_namespace_sourceType_sourceId_key"
  ON "SemanticDocument"("namespace", "sourceType", "sourceId");

CREATE INDEX "SemanticDocument_namespace_sourceType_idx"
  ON "SemanticDocument"("namespace", "sourceType");

CREATE INDEX "SemanticDocument_namespace_updatedAt_idx"
  ON "SemanticDocument"("namespace", "updatedAt" DESC);
