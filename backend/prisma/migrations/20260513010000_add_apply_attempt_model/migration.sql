-- Wave 4 §5.6 — Track D (assisted redirect) telemetry.
--
-- Each click-out produces one ApplyAttempt row. The 24h-nudge worker reads
-- PENDING rows older than 24h to send a "did you complete the application?"
-- nudge; rows still PENDING after 7d transition to NO_RESPONSE_TIMEOUT and
-- bring the parent Application down to FAILED.

CREATE TYPE "CandidateApplyResponse" AS ENUM (
  'PENDING',
  'CONFIRMED_COMPLETED',
  'DENIED_COMPLETED',
  'NO_RESPONSE_TIMEOUT'
);

CREATE TABLE "ApplyAttempt" (
  "id"                 TEXT                       NOT NULL,
  "applicationId"      TEXT                       NOT NULL,
  "clickedAt"          TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceUrl"          TEXT,
  "applicationUrl"     TEXT,
  "nudgeSentAt"        TIMESTAMP(3),
  "candidateResponse"  "CandidateApplyResponse"   NOT NULL DEFAULT 'PENDING',
  "respondedAt"        TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplyAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApplyAttempt_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE
);

CREATE INDEX "ApplyAttempt_applicationId_createdAt_idx"
  ON "ApplyAttempt"("applicationId", "createdAt" DESC);
CREATE INDEX "ApplyAttempt_candidateResponse_clickedAt_idx"
  ON "ApplyAttempt"("candidateResponse", "clickedAt");
