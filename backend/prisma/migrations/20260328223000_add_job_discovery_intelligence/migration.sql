-- Job discovery intelligence: quality, freshness, dedup lineage, and ranking support

ALTER TABLE "Job"
  ADD COLUMN "applicationUrl" TEXT,
  ADD COLUMN "sourceFingerprint" VARCHAR(80),
  ADD COLUMN "sourceLineage" JSONB,
  ADD COLUMN "sourceFirstSeenAt" TIMESTAMP(3),
  ADD COLUMN "sourceLastSeenAt" TIMESTAMP(3),
  ADD COLUMN "freshnessScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "qualityScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "applicationLikelihoodScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "freshnessSignals" JSONB,
  ADD COLUMN "qualitySignals" JSONB,
  ADD COLUMN "staleAt" TIMESTAMP(3);

CREATE INDEX "Job_sourceFingerprint_idx" ON "Job"("sourceFingerprint");
CREATE INDEX "Job_staleAt_idx" ON "Job"("staleAt");
CREATE INDEX "Job_sourceLastSeenAt_idx" ON "Job"("sourceLastSeenAt");
CREATE INDEX "Job_freshnessScore_qualityScore_idx" ON "Job"("freshnessScore", "qualityScore");
