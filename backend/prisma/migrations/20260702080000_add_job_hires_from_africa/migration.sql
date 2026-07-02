-- Migration: Add job-level "Hires from Africa" signal
-- Additive only: new boolean column (default false) + index. Backfilled
-- organically by the aggregator on each sync and by employer job create/update.

ALTER TABLE "Job" ADD COLUMN "hiresFromAfrica" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Job_hiresFromAfrica_idx" ON "Job"("hiresFromAfrica");
