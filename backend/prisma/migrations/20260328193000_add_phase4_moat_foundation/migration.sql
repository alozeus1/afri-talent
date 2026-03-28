-- Phase 4 moat foundation: social graph, salary negotiation assistant,
-- university partnership API, employer AI task review, bot subscriptions.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SocialConnectionStatus') THEN
    CREATE TYPE "SocialConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalaryNegotiationStatus') THEN
    CREATE TYPE "SalaryNegotiationStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UniversityPartnerStatus') THEN
    CREATE TYPE "UniversityPartnerStatus" AS ENUM ('ACTIVE', 'INACTIVE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UniversityRecordType') THEN
    CREATE TYPE "UniversityRecordType" AS ENUM ('INTERNSHIP', 'GRADUATE_PIPELINE', 'SKILLS_VERIFICATION');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UniversityRecordStatus') THEN
    CREATE TYPE "UniversityRecordStatus" AS ENUM ('RECEIVED', 'VALIDATED', 'REJECTED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployerAiTaskType') THEN
    CREATE TYPE "EmployerAiTaskType" AS ENUM ('CANDIDATE_RANKING', 'JOB_DESCRIPTION_GENERATION');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployerAiTaskStatus') THEN
    CREATE TYPE "EmployerAiTaskStatus" AS ENUM ('GENERATED', 'APPROVED', 'REJECTED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BotChannel') THEN
    CREATE TYPE "BotChannel" AS ENUM ('WHATSAPP', 'TELEGRAM');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BotSubscriptionStatus') THEN
    CREATE TYPE "BotSubscriptionStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'PAUSED', 'REVOKED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SocialProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "headline" VARCHAR(160),
  "bio" VARCHAR(1000),
  "location" VARCHAR(120),
  "discoverable" BOOLEAN NOT NULL DEFAULT false,
  "collaborationOpen" BOOLEAN NOT NULL DEFAULT false,
  "allowConnectionRequests" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SocialProfile_userId_key" ON "SocialProfile"("userId");
CREATE INDEX IF NOT EXISTS "SocialProfile_discoverable_idx" ON "SocialProfile"("discoverable");

CREATE TABLE IF NOT EXISTS "SocialConnection" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "status" "SocialConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "note" VARCHAR(300),
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SocialConnection_requesterId_recipientId_key" ON "SocialConnection"("requesterId", "recipientId");
CREATE INDEX IF NOT EXISTS "SocialConnection_requesterId_status_idx" ON "SocialConnection"("requesterId", "status");
CREATE INDEX IF NOT EXISTS "SocialConnection_recipientId_status_idx" ON "SocialConnection"("recipientId", "status");

CREATE TABLE IF NOT EXISTS "SalaryNegotiationSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobId" TEXT,
  "jobTitle" VARCHAR(200) NOT NULL,
  "country" VARCHAR(100),
  "region" "BillingRegion",
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "currentCompensation" INTEGER,
  "targetCompensation" INTEGER,
  "marketMin" INTEGER,
  "marketMedian" INTEGER,
  "marketMax" INTEGER,
  "strategySummary" TEXT,
  "talkingPoints" JSONB,
  "riskFlags" JSONB,
  "status" "SalaryNegotiationStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalaryNegotiationSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SalaryNegotiationSession_userId_createdAt_idx" ON "SalaryNegotiationSession"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SalaryNegotiationSession_jobId_idx" ON "SalaryNegotiationSession"("jobId");

CREATE TABLE IF NOT EXISTS "UniversityPartner" (
  "id" TEXT NOT NULL,
  "externalId" VARCHAR(120) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "country" VARCHAR(2) NOT NULL,
  "website" VARCHAR(500),
  "status" "UniversityPartnerStatus" NOT NULL DEFAULT 'ACTIVE',
  "apiKeyHash" VARCHAR(128) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UniversityPartner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UniversityPartner_externalId_key" ON "UniversityPartner"("externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "UniversityPartner_apiKeyHash_key" ON "UniversityPartner"("apiKeyHash");
CREATE INDEX IF NOT EXISTS "UniversityPartner_status_idx" ON "UniversityPartner"("status");

CREATE TABLE IF NOT EXISTS "UniversityPartnerRecord" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "type" "UniversityRecordType" NOT NULL,
  "externalRecordId" VARCHAR(120) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "UniversityRecordStatus" NOT NULL DEFAULT 'RECEIVED',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "UniversityPartnerRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UniversityPartnerRecord_partnerId_type_externalRecordId_key"
  ON "UniversityPartnerRecord"("partnerId", "type", "externalRecordId");
CREATE INDEX IF NOT EXISTS "UniversityPartnerRecord_type_status_idx" ON "UniversityPartnerRecord"("type", "status");

CREATE TABLE IF NOT EXISTS "EmployerAiTask" (
  "id" TEXT NOT NULL,
  "employerId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "reviewedByUserId" TEXT,
  "type" "EmployerAiTaskType" NOT NULL,
  "status" "EmployerAiTaskStatus" NOT NULL DEFAULT 'GENERATED',
  "title" VARCHAR(200),
  "input" JSONB NOT NULL,
  "output" JSONB,
  "reviewNotes" TEXT,
  "humanApproved" BOOLEAN NOT NULL DEFAULT false,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployerAiTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmployerAiTask_employerId_type_status_idx" ON "EmployerAiTask"("employerId", "type", "status");
CREATE INDEX IF NOT EXISTS "EmployerAiTask_createdByUserId_createdAt_idx" ON "EmployerAiTask"("createdByUserId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "BotSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channel" "BotChannel" NOT NULL,
  "chatHandle" VARCHAR(120) NOT NULL,
  "status" "BotSubscriptionStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "verificationCodeHash" VARCHAR(128),
  "isAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isJobMatchesEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isApplicationStatusEnabled" BOOLEAN NOT NULL DEFAULT true,
  "locale" "SupportedLocale" NOT NULL DEFAULT 'EN',
  "metadata" JSONB,
  "verifiedAt" TIMESTAMP(3),
  "lastNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BotSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BotSubscription_channel_chatHandle_key" ON "BotSubscription"("channel", "chatHandle");
CREATE INDEX IF NOT EXISTS "BotSubscription_userId_status_idx" ON "BotSubscription"("userId", "status");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SocialProfile_userId_fkey'
  ) THEN
    ALTER TABLE "SocialProfile"
      ADD CONSTRAINT "SocialProfile_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SocialConnection_requesterId_fkey'
  ) THEN
    ALTER TABLE "SocialConnection"
      ADD CONSTRAINT "SocialConnection_requesterId_fkey"
      FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SocialConnection_recipientId_fkey'
  ) THEN
    ALTER TABLE "SocialConnection"
      ADD CONSTRAINT "SocialConnection_recipientId_fkey"
      FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SalaryNegotiationSession_userId_fkey'
  ) THEN
    ALTER TABLE "SalaryNegotiationSession"
      ADD CONSTRAINT "SalaryNegotiationSession_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SalaryNegotiationSession_jobId_fkey'
  ) THEN
    ALTER TABLE "SalaryNegotiationSession"
      ADD CONSTRAINT "SalaryNegotiationSession_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'UniversityPartnerRecord_partnerId_fkey'
  ) THEN
    ALTER TABLE "UniversityPartnerRecord"
      ADD CONSTRAINT "UniversityPartnerRecord_partnerId_fkey"
      FOREIGN KEY ("partnerId") REFERENCES "UniversityPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'EmployerAiTask_employerId_fkey'
  ) THEN
    ALTER TABLE "EmployerAiTask"
      ADD CONSTRAINT "EmployerAiTask_employerId_fkey"
      FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'EmployerAiTask_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "EmployerAiTask"
      ADD CONSTRAINT "EmployerAiTask_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'EmployerAiTask_reviewedByUserId_fkey'
  ) THEN
    ALTER TABLE "EmployerAiTask"
      ADD CONSTRAINT "EmployerAiTask_reviewedByUserId_fkey"
      FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BotSubscription_userId_fkey'
  ) THEN
    ALTER TABLE "BotSubscription"
      ADD CONSTRAINT "BotSubscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
