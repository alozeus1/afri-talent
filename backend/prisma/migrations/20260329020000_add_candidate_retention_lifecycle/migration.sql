DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM (
      'NEW_MESSAGE',
      'APPLICATION_STATUS',
      'JOB_MATCH',
      'VERIFICATION'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'RETENTION_NUDGE'
      AND enumtypid = to_regtype('"NotificationType"')
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'RETENTION_NUDGE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'WEEKLY_DIGEST'
      AND enumtypid = to_regtype('"NotificationType"')
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'WEEKLY_DIGEST';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'SALARY_INSIGHT'
      AND enumtypid = to_regtype('"NotificationType"')
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'SALARY_INSIGHT';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'INTERVIEW_PREP'
      AND enumtypid = to_regtype('"NotificationType"')
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'INTERVIEW_PREP';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CandidateLifecycleTriggerType') THEN
    CREATE TYPE "CandidateLifecycleTriggerType" AS ENUM (
      'WEEKLY_DIGEST',
      'APPLICATION_REMINDER',
      'PROFILE_COMPLETION',
      'VERIFICATION_COMPLETION',
      'VISA_RELOCATION_MATCH',
      'SALARY_INSIGHT',
      'INTERVIEW_PREP'
    );
  END IF;
END $$;

ALTER TABLE "NotificationPreference"
  ADD COLUMN IF NOT EXISTS "weeklyDigests" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "applicationReminders" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "profileCompletionNudges" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "verificationCompletionNudges" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "visaRelocationAlerts" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "salaryInsights" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "interviewPrepRecommendations" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "maxNotificationsPerWeek" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS "minimumHoursBetweenNotifications" INTEGER NOT NULL DEFAULT 18;

CREATE TABLE IF NOT EXISTS "CandidateLifecycleState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekWindowStartedAt" TIMESTAMP(3),
  "notificationsThisWeek" INTEGER NOT NULL DEFAULT 0,
  "lastNotificationAt" TIMESTAMP(3),
  "lastDigestAt" TIMESTAMP(3),
  "lastApplicationReminderAt" TIMESTAMP(3),
  "lastProfileNudgeAt" TIMESTAMP(3),
  "lastVerificationNudgeAt" TIMESTAMP(3),
  "lastVisaAlertAt" TIMESTAMP(3),
  "lastSalaryInsightAt" TIMESTAMP(3),
  "lastInterviewPrepAt" TIMESTAMP(3),
  "lastDigestJobCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateLifecycleState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CandidateLifecycleState_userId_key"
  ON "CandidateLifecycleState"("userId");
CREATE INDEX IF NOT EXISTS "CandidateLifecycleState_weekWindowStartedAt_idx"
  ON "CandidateLifecycleState"("weekWindowStartedAt");
CREATE INDEX IF NOT EXISTS "CandidateLifecycleState_lastNotificationAt_idx"
  ON "CandidateLifecycleState"("lastNotificationAt");

CREATE TABLE IF NOT EXISTS "CandidateLifecycleEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lifecycleStateId" TEXT,
  "triggerType" "CandidateLifecycleTriggerType" NOT NULL,
  "channel" VARCHAR(40) NOT NULL,
  "reasonCode" VARCHAR(120) NOT NULL,
  "dedupeKey" VARCHAR(180) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "metadata" JSONB,
  "notificationId" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CandidateLifecycleEvent_dedupeKey_key"
  ON "CandidateLifecycleEvent"("dedupeKey");
CREATE INDEX IF NOT EXISTS "CandidateLifecycleEvent_userId_triggerType_createdAt_idx"
  ON "CandidateLifecycleEvent"("userId", "triggerType", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CandidateLifecycleEvent_channel_createdAt_idx"
  ON "CandidateLifecycleEvent"("channel", "createdAt" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidateLifecycleState_userId_fkey'
  ) THEN
    ALTER TABLE "CandidateLifecycleState"
      ADD CONSTRAINT "CandidateLifecycleState_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidateLifecycleEvent_userId_fkey'
  ) THEN
    ALTER TABLE "CandidateLifecycleEvent"
      ADD CONSTRAINT "CandidateLifecycleEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidateLifecycleEvent_lifecycleStateId_fkey'
  ) THEN
    ALTER TABLE "CandidateLifecycleEvent"
      ADD CONSTRAINT "CandidateLifecycleEvent_lifecycleStateId_fkey"
      FOREIGN KEY ("lifecycleStateId") REFERENCES "CandidateLifecycleState"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidateLifecycleEvent_notificationId_fkey'
  ) THEN
    ALTER TABLE "CandidateLifecycleEvent"
      ADD CONSTRAINT "CandidateLifecycleEvent_notificationId_fkey"
      FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
