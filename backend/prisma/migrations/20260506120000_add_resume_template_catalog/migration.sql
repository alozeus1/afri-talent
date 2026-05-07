ALTER TABLE "PlanEntitlement"
  ADD COLUMN IF NOT EXISTS "templateDownloadsPerMonth" INTEGER;

CREATE TABLE IF NOT EXISTS "ResumeTemplate" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT NOT NULL,
  "thumbnailUrl" VARCHAR(500) NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "bestFor" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "minPlan" "SubscriptionPlan" NOT NULL DEFAULT 'PROFESSIONAL',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResumeTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TemplateFile" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "format" VARCHAR(20) NOT NULL,
  "s3Key" VARCHAR(500),
  "externalUrl" VARCHAR(500),
  "fileSizeBytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TemplateFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TemplateDownload" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "format" VARCHAR(20) NOT NULL,
  "source" VARCHAR(40) NOT NULL,
  "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TemplateDownload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TemplateDownload_userId_idx" ON "TemplateDownload"("userId");
CREATE INDEX IF NOT EXISTS "TemplateDownload_templateId_idx" ON "TemplateDownload"("templateId");
CREATE INDEX IF NOT EXISTS "TemplateDownload_userId_downloadedAt_idx" ON "TemplateDownload"("userId", "downloadedAt" DESC);

ALTER TABLE "TemplateFile"
  ADD CONSTRAINT "TemplateFile_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ResumeTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TemplateDownload"
  ADD CONSTRAINT "TemplateDownload_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ResumeTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
