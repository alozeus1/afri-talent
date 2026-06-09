-- Wave 4 §5.9 — employer opt-out from EMAIL_DRAFT track.
--
-- An employer that emails optout@afri-talent.com from any address @theirdomain
-- (or that an admin adds manually) lands in this table. The apply-strategy
-- classifier downgrades EMAIL_DRAFT → ASSISTED_REDIRECT when the parsed email
-- domain matches an unexpired row.

CREATE TYPE "EmployerOptOutSource" AS ENUM (
  'EMAIL',     -- arrived via the inbound SES rule (PR Q wires it up)
  'ADMIN',     -- created manually in the admin UI
  'API'        -- programmatic add for partner integrations
);

CREATE TABLE "EmployerApplyOptOut" (
  "id"          TEXT                    NOT NULL,
  "domain"      VARCHAR(255)            NOT NULL,
  "optedOutAt"  TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"   TIMESTAMP(3)            NOT NULL,
  "source"      "EmployerOptOutSource"  NOT NULL,
  "reason"      TEXT,
  "createdAt"   TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployerApplyOptOut_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployerApplyOptOut_domain_key" ON "EmployerApplyOptOut"("domain");
CREATE INDEX "EmployerApplyOptOut_expiresAt_idx" ON "EmployerApplyOptOut"("expiresAt");
