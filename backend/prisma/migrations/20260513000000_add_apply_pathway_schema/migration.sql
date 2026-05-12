-- Wave 4 §5.1 — apply pathway schema.
--
-- Adds three enums + the columns the four submission tracks (ATS API, email
-- draft, operator handoff, assisted redirect) need to coordinate. All
-- additive; existing rows keep working.

-- ── Enums ────────────────────────────────────────────────────────────────
CREATE TYPE "ApplyStrategy" AS ENUM (
  'ATS_API_GREENHOUSE',
  'ATS_API_LEVER',
  'ATS_API_ASHBY',
  'ATS_API_WORKABLE',
  'EMAIL_DRAFT',
  'OPERATOR_HANDOFF',
  'ASSISTED_REDIRECT'
);

CREATE TYPE "SubmissionStatus" AS ENUM (
  'NOT_SUBMITTED',
  'DRAFTING',
  'AWAITING_USER_CONFIRMATION',
  'SUBMITTING',
  'SUBMITTED',
  'FAILED'
);

CREATE TYPE "SubmissionProofKind" AS ENUM (
  'ATS_ID',
  'EMAIL_MESSAGE_ID',
  'SCREENCAST_URL',
  'CLICKOUT_TIMESTAMP'
);

-- ── Job: apply pathway routing ───────────────────────────────────────────
ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS "applyStrategy"      "ApplyStrategy",
  ADD COLUMN IF NOT EXISTS "applyEmailDetected" TEXT,
  ADD COLUMN IF NOT EXISTS "applyFormDomain"    TEXT;

CREATE INDEX IF NOT EXISTS "Job_applyStrategy_idx" ON "Job"("applyStrategy");

-- ── Application: submission lifecycle + proof ─────────────────────────────
ALTER TABLE "Application"
  ADD COLUMN IF NOT EXISTS "submissionStatus"                "SubmissionStatus"    NOT NULL DEFAULT 'NOT_SUBMITTED',
  ADD COLUMN IF NOT EXISTS "submissionProvider"              TEXT,
  ADD COLUMN IF NOT EXISTS "submissionProviderApplicationId" TEXT,
  ADD COLUMN IF NOT EXISTS "submissionProofKind"             "SubmissionProofKind",
  ADD COLUMN IF NOT EXISTS "submissionProofRef"              TEXT,
  ADD COLUMN IF NOT EXISTS "submittedAt"                     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submissionAttempts"              INTEGER             NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastSubmissionError"             TEXT;

CREATE INDEX IF NOT EXISTS "Application_submissionStatus_idx" ON "Application"("submissionStatus");
CREATE INDEX IF NOT EXISTS "Application_submittedAt_idx"      ON "Application"("submittedAt" DESC);
