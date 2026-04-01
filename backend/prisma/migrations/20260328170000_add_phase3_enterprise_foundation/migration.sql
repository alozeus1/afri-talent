-- Phase 3 enterprise foundation: ATS, mock interviews, analytics events, tier extensions

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ATSProvider') THEN
    CREATE TYPE "ATSProvider" AS ENUM ('GREENHOUSE', 'LEVER', 'WORKABLE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ATSConnectionStatus') THEN
    CREATE TYPE "ATSConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'DISCONNECTED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ATSSyncStatus') THEN
    CREATE TYPE "ATSSyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MockInterviewStatus') THEN
    CREATE TYPE "MockInterviewStatus" AS ENUM ('DRAFT', 'PROCESSING', 'READY', 'ARCHIVED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MockInterviewVisibility') THEN
    CREATE TYPE "MockInterviewVisibility" AS ENUM ('PRIVATE', 'TEAM_SHARED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MockInterviewArtifactType') THEN
    CREATE TYPE "MockInterviewArtifactType" AS ENUM ('VIDEO', 'AUDIO', 'TRANSCRIPT', 'FEEDBACK_JSON');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AnalyticsEventCategory') THEN
    CREATE TYPE "AnalyticsEventCategory" AS ENUM (
      'ACQUISITION',
      'ACTIVATION',
      'ENGAGEMENT',
      'CONVERSION',
      'RETENTION',
      'MONETIZATION',
      'EMPLOYER_PIPELINE',
      'SYSTEM'
    );
  END IF;
END $$;

ALTER TABLE "PlanEntitlement"
  ADD COLUMN IF NOT EXISTS "atsIntegrations" INTEGER,
  ADD COLUMN IF NOT EXISTS "videoMockInterviews" INTEGER,
  ADD COLUMN IF NOT EXISTS "pipelineExports" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "brandedCareerPage" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "advancedFunnelMetrics" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ATSConnection" (
  "id" TEXT NOT NULL,
  "employerId" TEXT NOT NULL,
  "provider" "ATSProvider" NOT NULL,
  "externalOrgId" VARCHAR(255) NOT NULL,
  "encryptedAccessToken" TEXT,
  "encryptedRefreshToken" TEXT,
  "metadata" JSONB,
  "status" "ATSConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ATSConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ATSConnection_employerId_provider_externalOrgId_key"
  ON "ATSConnection"("employerId", "provider", "externalOrgId");
CREATE INDEX IF NOT EXISTS "ATSConnection_employerId_idx" ON "ATSConnection"("employerId");
CREATE INDEX IF NOT EXISTS "ATSConnection_provider_idx" ON "ATSConnection"("provider");

CREATE TABLE IF NOT EXISTS "ATSSyncRun" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "status" "ATSSyncStatus" NOT NULL DEFAULT 'QUEUED',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "pulledJobs" INTEGER NOT NULL DEFAULT 0,
  "createdJobs" INTEGER NOT NULL DEFAULT 0,
  "updatedJobs" INTEGER NOT NULL DEFAULT 0,
  "dedupedJobs" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "cursor" VARCHAR(255),
  "errors" JSONB,
  "metadata" JSONB,
  CONSTRAINT "ATSSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ATSSyncRun_connectionId_startedAt_idx"
  ON "ATSSyncRun"("connectionId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "ATSSyncRun_status_startedAt_idx"
  ON "ATSSyncRun"("status", "startedAt" DESC);

CREATE TABLE IF NOT EXISTS "MockInterviewSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "targetRole" VARCHAR(120) NOT NULL,
  "promptLanguage" "SupportedLocale" NOT NULL DEFAULT 'EN',
  "questionSet" JSONB,
  "transcript" JSONB,
  "feedbackSummary" TEXT,
  "scoreOverall" INTEGER,
  "scoreCommunication" INTEGER,
  "scoreTechnical" INTEGER,
  "scoreProblemSolving" INTEGER,
  "status" "MockInterviewStatus" NOT NULL DEFAULT 'DRAFT',
  "visibility" "MockInterviewVisibility" NOT NULL DEFAULT 'PRIVATE',
  "retentionDays" INTEGER NOT NULL DEFAULT 30,
  "piiRedacted" BOOLEAN NOT NULL DEFAULT true,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MockInterviewSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MockInterviewSession_userId_createdAt_idx"
  ON "MockInterviewSession"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MockInterviewSession_status_createdAt_idx"
  ON "MockInterviewSession"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MockInterviewSession_expiresAt_idx"
  ON "MockInterviewSession"("expiresAt");

CREATE TABLE IF NOT EXISTS "MockInterviewArtifact" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "type" "MockInterviewArtifactType" NOT NULL,
  "storageKey" VARCHAR(500) NOT NULL,
  "contentType" VARCHAR(120),
  "sizeBytes" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MockInterviewArtifact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MockInterviewArtifact_sessionId_createdAt_idx"
  ON "MockInterviewArtifact"("sessionId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MockInterviewArtifact_type_idx"
  ON "MockInterviewArtifact"("type");

CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "category" "AnalyticsEventCategory" NOT NULL,
  "eventName" VARCHAR(120) NOT NULL,
  "sessionId" VARCHAR(120),
  "path" VARCHAR(500),
  "referrer" VARCHAR(500),
  "properties" JSONB,
  "ipHash" VARCHAR(128),
  "userAgent" VARCHAR(500),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AnalyticsEvent_category_occurredAt_idx"
  ON "AnalyticsEvent"("category", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_eventName_occurredAt_idx"
  ON "AnalyticsEvent"("eventName", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_userId_occurredAt_idx"
  ON "AnalyticsEvent"("userId", "occurredAt" DESC);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ATSConnection_employerId_fkey'
  ) THEN
    ALTER TABLE "ATSConnection"
      ADD CONSTRAINT "ATSConnection_employerId_fkey"
      FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ATSSyncRun_connectionId_fkey'
  ) THEN
    ALTER TABLE "ATSSyncRun"
      ADD CONSTRAINT "ATSSyncRun_connectionId_fkey"
      FOREIGN KEY ("connectionId") REFERENCES "ATSConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'MockInterviewSession_userId_fkey'
  ) THEN
    ALTER TABLE "MockInterviewSession"
      ADD CONSTRAINT "MockInterviewSession_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'MockInterviewArtifact_sessionId_fkey'
  ) THEN
    ALTER TABLE "MockInterviewArtifact"
      ADD CONSTRAINT "MockInterviewArtifact_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "MockInterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AnalyticsEvent_userId_fkey'
  ) THEN
    ALTER TABLE "AnalyticsEvent"
      ADD CONSTRAINT "AnalyticsEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
