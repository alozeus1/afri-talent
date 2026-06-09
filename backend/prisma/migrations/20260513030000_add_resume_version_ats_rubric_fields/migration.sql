-- Wave 5 PR #1 — ATS rubric tailoring fields on CandidateResumeVersion.
--
-- Adds four additive, nullable columns to support the Wave 5 resume builder +
-- ATS rubric scoring service (PR #2 wires the service to these fields):
--
--   originalContent   JSONB  — unedited resume snapshot at tailoring time.
--   optimizedContent  JSONB  — rubric-tailored resume returned by the AI.
--   atsScore          INT    — 0–100 ATS rubric score from the scoring service.
--   matchScore        INT    — 0–100 semantic match score vs. the target job.
--
-- All four columns are nullable so existing rows remain valid without backfill.
-- A partial index on (jobId, atsScore DESC) supports the "best-scoring tailored
-- resume for this job" query used by the resume-builder UX (PR #3).
--
-- Founder-action checklist (per spec §6.2): this migration runs against the
-- staging Aurora cluster on PR merge via the existing
-- `npx prisma migrate deploy` container-startup hook. No SSM / KMS / IAM /
-- terraform changes required.

ALTER TABLE "CandidateResumeVersion"
  ADD COLUMN "originalContent"  JSONB,
  ADD COLUMN "optimizedContent" JSONB,
  ADD COLUMN "atsScore"         INTEGER,
  ADD COLUMN "matchScore"       INTEGER;

CREATE INDEX "CandidateResumeVersion_jobId_atsScore_idx"
  ON "CandidateResumeVersion"("jobId", "atsScore" DESC);
