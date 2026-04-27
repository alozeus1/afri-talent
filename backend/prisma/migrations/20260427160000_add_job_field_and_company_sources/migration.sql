ALTER TABLE "Job" ADD COLUMN "jobField" VARCHAR(80);
ALTER TABLE "Job" ADD COLUMN "workplaceType" VARCHAR(32);
ALTER TABLE "Job" ADD COLUMN "companyCareerSourceId" TEXT;

CREATE TABLE "CompanyCareerSource" (
  "id" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "careersUrl" TEXT NOT NULL,
  "provider" VARCHAR(80) NOT NULL,
  "providerKey" VARCHAR(160),
  "allowedToCrawl" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 50,
  "crawlFrequencyHours" INTEGER NOT NULL DEFAULT 12,
  "targetFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "lastCrawledAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyCareerSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Job_jobField_idx" ON "Job"("jobField");
CREATE INDEX "Job_workplaceType_idx" ON "Job"("workplaceType");
CREATE INDEX "Job_companyCareerSourceId_idx" ON "Job"("companyCareerSourceId");
CREATE INDEX "CompanyCareerSource_provider_idx" ON "CompanyCareerSource"("provider");
CREATE INDEX "CompanyCareerSource_active_priority_idx" ON "CompanyCareerSource"("active", "priority");
CREATE UNIQUE INDEX "CompanyCareerSource_provider_providerKey_key" ON "CompanyCareerSource"("provider", "providerKey");

ALTER TABLE "Job" ADD CONSTRAINT "Job_companyCareerSourceId_fkey" FOREIGN KEY ("companyCareerSourceId") REFERENCES "CompanyCareerSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
