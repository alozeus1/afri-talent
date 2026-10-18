-- Resume uploads must be scanned by an approved scanner before use. Existing
-- rows deliberately start PENDING_SCAN: no historical scan result is implied.
CREATE TYPE "ResumeSecurityStatus" AS ENUM ('PENDING_SCAN', 'CLEAN', 'QUARANTINED', 'REJECTED');

ALTER TABLE "Resume"
  ADD COLUMN "securityStatus" "ResumeSecurityStatus" NOT NULL DEFAULT 'PENDING_SCAN',
  ADD COLUMN "scanCompletedAt" TIMESTAMP(3),
  ADD COLUMN "quarantineReason" VARCHAR(100);

CREATE INDEX "Resume_profileId_securityStatus_isActive_idx"
  ON "Resume"("profileId", "securityStatus", "isActive");
