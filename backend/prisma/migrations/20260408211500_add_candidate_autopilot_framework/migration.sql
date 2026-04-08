DO $$ BEGIN
  CREATE TYPE "CandidateAutomationLevel" AS ENUM ('ASSISTED', 'AUTONOMOUS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CandidateAgentTaskType" AS ENUM ('RESUME_REFRESH', 'APPLY_PACK', 'FOLLOW_UP', 'INTERVIEW_PREP', 'SCHEDULING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CandidateAgentTaskStatus" AS ENUM ('QUEUED', 'READY', 'NEEDS_REVIEW', 'SENT', 'COMPLETED', 'FAILED', 'SKIPPED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ResumeVersionSource" AS ENUM ('PROFILE_SYNTHESIS', 'AI_TAILOR', 'USER_UPLOAD');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ResumeVersionStatus" AS ENUM ('DRAFT', 'READY', 'NEEDS_REVIEW', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CandidateAutopilotProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "automationLevel" "CandidateAutomationLevel" NOT NULL DEFAULT 'ASSISTED',
  "minimumMatchScore" INTEGER NOT NULL DEFAULT 78,
  "resumeBuilderEnabled" BOOLEAN NOT NULL DEFAULT true,
  "autoApplyEnabled" BOOLEAN NOT NULL DEFAULT false,
  "followUpEnabled" BOOLEAN NOT NULL DEFAULT true,
  "interviewPrepEnabled" BOOLEAN NOT NULL DEFAULT true,
  "schedulingEnabled" BOOLEAN NOT NULL DEFAULT true,
  "preferredTone" VARCHAR(40),
  "followUpCadenceDays" INTEGER[],
  "availabilityWindows" JSONB,
  "targetCompensation" JSONB,
  "searchStrategy" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CandidateAutopilotProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CandidateResumeVersion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "autopilotProfileId" TEXT,
  "profileId" TEXT,
  "jobId" TEXT,
  "aiRunId" TEXT,
  "source" "ResumeVersionSource" NOT NULL,
  "status" "ResumeVersionStatus" NOT NULL DEFAULT 'READY',
  "title" VARCHAR(160) NOT NULL,
  "targetRole" VARCHAR(120),
  "summary" TEXT,
  "content" JSONB NOT NULL,
  "plainText" TEXT NOT NULL,
  "keywords" TEXT[],
  "score" INTEGER,
  "notes" TEXT[],
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CandidateResumeVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CandidateAgentTask" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "autopilotProfileId" TEXT,
  "applicationId" TEXT,
  "jobId" TEXT,
  "aiRunId" TEXT,
  "resumeVersionId" TEXT,
  "type" "CandidateAgentTaskType" NOT NULL,
  "status" "CandidateAgentTaskStatus" NOT NULL DEFAULT 'QUEUED',
  "priority" INTEGER NOT NULL DEFAULT 50,
  "title" VARCHAR(180) NOT NULL,
  "summary" TEXT,
  "inputSnapshot" JSONB,
  "outputSummary" JSONB,
  "outputPayload" JSONB,
  "reviewNotes" TEXT,
  "scheduledFor" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CandidateAgentTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CandidateAutopilotProfile_userId_key"
  ON "CandidateAutopilotProfile"("userId");

CREATE INDEX IF NOT EXISTS "CandidateAutopilotProfile_enabled_updatedAt_idx"
  ON "CandidateAutopilotProfile"("enabled", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "CandidateResumeVersion_userId_createdAt_idx"
  ON "CandidateResumeVersion"("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "CandidateResumeVersion_userId_isPrimary_updatedAt_idx"
  ON "CandidateResumeVersion"("userId", "isPrimary", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "CandidateResumeVersion_jobId_createdAt_idx"
  ON "CandidateResumeVersion"("jobId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "CandidateResumeVersion_status_updatedAt_idx"
  ON "CandidateResumeVersion"("status", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "CandidateAgentTask_userId_status_scheduledFor_idx"
  ON "CandidateAgentTask"("userId", "status", "scheduledFor");

CREATE INDEX IF NOT EXISTS "CandidateAgentTask_applicationId_type_createdAt_idx"
  ON "CandidateAgentTask"("applicationId", "type", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "CandidateAgentTask_jobId_type_createdAt_idx"
  ON "CandidateAgentTask"("jobId", "type", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "CandidateAgentTask_resumeVersionId_createdAt_idx"
  ON "CandidateAgentTask"("resumeVersionId", "createdAt" DESC);

DO $$ BEGIN
  ALTER TABLE "CandidateAutopilotProfile"
    ADD CONSTRAINT "CandidateAutopilotProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateResumeVersion"
    ADD CONSTRAINT "CandidateResumeVersion_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateResumeVersion"
    ADD CONSTRAINT "CandidateResumeVersion_autopilotProfileId_fkey"
    FOREIGN KEY ("autopilotProfileId") REFERENCES "CandidateAutopilotProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateResumeVersion"
    ADD CONSTRAINT "CandidateResumeVersion_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateResumeVersion"
    ADD CONSTRAINT "CandidateResumeVersion_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateResumeVersion"
    ADD CONSTRAINT "CandidateResumeVersion_aiRunId_fkey"
    FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateAgentTask"
    ADD CONSTRAINT "CandidateAgentTask_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateAgentTask"
    ADD CONSTRAINT "CandidateAgentTask_autopilotProfileId_fkey"
    FOREIGN KEY ("autopilotProfileId") REFERENCES "CandidateAutopilotProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateAgentTask"
    ADD CONSTRAINT "CandidateAgentTask_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateAgentTask"
    ADD CONSTRAINT "CandidateAgentTask_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateAgentTask"
    ADD CONSTRAINT "CandidateAgentTask_aiRunId_fkey"
    FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateAgentTask"
    ADD CONSTRAINT "CandidateAgentTask_resumeVersionId_fkey"
    FOREIGN KEY ("resumeVersionId") REFERENCES "CandidateResumeVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
