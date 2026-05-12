-- Wave 3 §4.2 — tri-key deduplication: persist K1 (normalised
-- company:title:city) on Job.
--
-- Nullable so the migration is non-disruptive; the aggregator + employer
-- routes populate it on insert, and scripts/jobs/backfill-dedup-keys.ts (PR K)
-- backfills historical rows.

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "dedupKeyV2" VARCHAR(255);

CREATE INDEX IF NOT EXISTS "Job_dedupKeyV2_idx" ON "Job"("dedupKeyV2");
