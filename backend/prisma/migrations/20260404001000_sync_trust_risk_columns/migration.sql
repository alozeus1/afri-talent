ALTER TABLE "Application"
  ADD COLUMN IF NOT EXISTS "riskLevel" "TrustRiskLevel" NOT NULL DEFAULT 'LOW',
  ADD COLUMN IF NOT EXISTS "riskScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "trustFlags" JSONB;

ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS "qualityCheckedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "riskLevel" "TrustRiskLevel" NOT NULL DEFAULT 'LOW',
  ADD COLUMN IF NOT EXISTS "riskScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "trustFlags" JSONB;

CREATE INDEX IF NOT EXISTS "Application_riskLevel_riskScore_idx"
  ON "Application"("riskLevel", "riskScore");

CREATE INDEX IF NOT EXISTS "Job_riskLevel_riskScore_idx"
  ON "Job"("riskLevel", "riskScore");

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'PhoneVerificationChallenge_candidateTrustProfileId_createdAt_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'PhoneVerificationChallenge_candidateTrustProfileId_createdA_idx'
  ) THEN
    ALTER INDEX "PhoneVerificationChallenge_candidateTrustProfileId_createdAt_id"
      RENAME TO "PhoneVerificationChallenge_candidateTrustProfileId_createdA_idx";
  END IF;
END $$;

ALTER TABLE "ATSApplicationLink"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "EmployerOnboardingState"
  ALTER COLUMN "teamMemberEmails" DROP DEFAULT;

ALTER TABLE "SemanticDocument"
  ALTER COLUMN "updatedAt" DROP DEFAULT;
