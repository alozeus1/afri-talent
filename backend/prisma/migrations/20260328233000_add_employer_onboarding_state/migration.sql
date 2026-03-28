CREATE TABLE "EmployerOnboardingState" (
  "id" TEXT NOT NULL,
  "employerId" TEXT NOT NULL,
  "currentStep" VARCHAR(80) NOT NULL DEFAULT 'company_setup',
  "teamMemberEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "candidateFilters" JSONB,
  "selectedPlan" "SubscriptionPlan",
  "helperState" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmployerOnboardingState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployerOnboardingState_employerId_key" ON "EmployerOnboardingState"("employerId");
CREATE INDEX "EmployerOnboardingState_currentStep_updatedAt_idx" ON "EmployerOnboardingState"("currentStep", "updatedAt" DESC);

ALTER TABLE "EmployerOnboardingState"
  ADD CONSTRAINT "EmployerOnboardingState_employerId_fkey"
  FOREIGN KEY ("employerId") REFERENCES "Employer"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
