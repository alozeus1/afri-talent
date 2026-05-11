-- Wave 3 §4.1 — controlled job-field taxonomy.
--
-- New nullable columns sit alongside the legacy `jobField` so the rollout
-- can backfill incrementally and reads can switch over per-feature.

ALTER TABLE "Job"
  ADD COLUMN "taxonomyField"      VARCHAR(40),
  ADD COLUMN "taxonomyVersion"    INTEGER,
  ADD COLUMN "taxonomyConfidence" DOUBLE PRECISION;

CREATE INDEX "Job_taxonomyField_idx" ON "Job"("taxonomyField");
