CREATE TYPE "ATSHealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'DOWN', 'NEEDS_ATTENTION');
CREATE TYPE "ATSWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');
CREATE TYPE "ATSApplicationLinkStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'MANUAL_REVIEW');

ALTER TABLE "ATSConnection"
ADD COLUMN "displayName" VARCHAR(120),
ADD COLUMN "encryptedWebhookSecret" TEXT,
ADD COLUMN "healthStatus" "ATSHealthStatus" NOT NULL DEFAULT 'NEEDS_ATTENTION',
ADD COLUMN "webhookSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "twoWaySyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastSuccessfulSyncAt" TIMESTAMP(3),
ADD COLUMN "lastConnectionTestAt" TIMESTAMP(3),
ADD COLUMN "lastConnectionTestOk" BOOLEAN,
ADD COLUMN "lastWebhookAt" TIMESTAMP(3),
ADD COLUMN "lastErrorAt" TIMESTAMP(3),
ADD COLUMN "lastErrorMessage" TEXT,
ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;

UPDATE "ATSConnection"
SET "healthStatus" = CASE
  WHEN "status" = 'ACTIVE' THEN 'HEALTHY'::"ATSHealthStatus"
  WHEN "status" = 'ERROR' THEN 'DOWN'::"ATSHealthStatus"
  ELSE 'NEEDS_ATTENTION'::"ATSHealthStatus"
END,
"lastSuccessfulSyncAt" = "lastSyncedAt";

ALTER TABLE "ATSSyncRun"
ADD COLUMN "syncType" VARCHAR(40) NOT NULL DEFAULT 'JOB_IMPORT',
ADD COLUMN "direction" VARCHAR(20) NOT NULL DEFAULT 'IMPORT',
ADD COLUMN "trigger" VARCHAR(24) NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "correlationId" VARCHAR(80),
ADD COLUMN "processedEvents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pushedCandidates" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "updatedStages" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "warnings" JSONB;

CREATE TABLE "ATSWebhookEvent" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "provider" "ATSProvider" NOT NULL,
  "eventType" VARCHAR(120) NOT NULL,
  "eventKey" VARCHAR(255),
  "status" "ATSWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "httpHeaders" JSONB,
  "payload" JSONB NOT NULL,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "ATSWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ATSConnectionAuditLog" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "actorUserId" VARCHAR(36),
  "actionType" VARCHAR(60) NOT NULL,
  "reasonCode" VARCHAR(120),
  "summary" TEXT NOT NULL,
  "syncRunId" VARCHAR(36),
  "webhookEventId" VARCHAR(36),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ATSConnectionAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ATSApplicationLink" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "externalJobId" VARCHAR(255),
  "externalApplicationId" VARCHAR(255),
  "externalCandidateId" VARCHAR(255),
  "externalStageId" VARCHAR(255),
  "externalStageName" VARCHAR(120),
  "status" "ATSApplicationLinkStatus" NOT NULL DEFAULT 'PENDING',
  "lastOutboundSyncAt" TIMESTAMP(3),
  "lastInboundSyncAt" TIMESTAMP(3),
  "lastSyncError" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ATSApplicationLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ATSWebhookEvent_connectionId_eventKey_key" ON "ATSWebhookEvent"("connectionId", "eventKey");
CREATE INDEX "ATSWebhookEvent_connectionId_receivedAt_idx" ON "ATSWebhookEvent"("connectionId", "receivedAt" DESC);
CREATE INDEX "ATSWebhookEvent_status_receivedAt_idx" ON "ATSWebhookEvent"("status", "receivedAt" DESC);
CREATE INDEX "ATSWebhookEvent_provider_receivedAt_idx" ON "ATSWebhookEvent"("provider", "receivedAt" DESC);

CREATE INDEX "ATSConnectionAuditLog_connectionId_createdAt_idx" ON "ATSConnectionAuditLog"("connectionId", "createdAt" DESC);
CREATE INDEX "ATSConnectionAuditLog_actionType_createdAt_idx" ON "ATSConnectionAuditLog"("actionType", "createdAt" DESC);

CREATE UNIQUE INDEX "ATSApplicationLink_applicationId_key" ON "ATSApplicationLink"("applicationId");
CREATE UNIQUE INDEX "ATSApplicationLink_connectionId_externalApplicationId_key" ON "ATSApplicationLink"("connectionId", "externalApplicationId");
CREATE INDEX "ATSApplicationLink_connectionId_status_idx" ON "ATSApplicationLink"("connectionId", "status");
CREATE INDEX "ATSApplicationLink_connectionId_externalCandidateId_idx" ON "ATSApplicationLink"("connectionId", "externalCandidateId");
CREATE INDEX "ATSApplicationLink_lastInboundSyncAt_idx" ON "ATSApplicationLink"("lastInboundSyncAt");
CREATE INDEX "ATSApplicationLink_lastOutboundSyncAt_idx" ON "ATSApplicationLink"("lastOutboundSyncAt");

CREATE INDEX "ATSConnection_employerId_healthStatus_idx" ON "ATSConnection"("employerId", "healthStatus");
CREATE INDEX "ATSConnection_status_healthStatus_idx" ON "ATSConnection"("status", "healthStatus");
CREATE INDEX "ATSSyncRun_syncType_direction_startedAt_idx" ON "ATSSyncRun"("syncType", "direction", "startedAt" DESC);

ALTER TABLE "ATSWebhookEvent"
ADD CONSTRAINT "ATSWebhookEvent_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "ATSConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ATSConnectionAuditLog"
ADD CONSTRAINT "ATSConnectionAuditLog_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "ATSConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ATSApplicationLink"
ADD CONSTRAINT "ATSApplicationLink_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "ATSConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ATSApplicationLink"
ADD CONSTRAINT "ATSApplicationLink_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
