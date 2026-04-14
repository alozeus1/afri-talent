-- CreateEnum for AdminPermission
CREATE TYPE "AdminPermission" AS ENUM (
  'VIEW_USERS',
  'MANAGE_USER_ACCOUNTS',
  'RESET_USER_PASSWORD',
  'RESTRICT_USER_ACCOUNT',
  'REVIEW_JOBS',
  'REVIEW_APPLICATIONS',
  'REVIEW_RESOURCES',
  'REVIEW_COMPANY_DATA',
  'VIEW_TRUST_CASES',
  'MANAGE_TRUST_CASES',
  'VIEW_ABUSE_REPORTS',
  'MANAGE_ABUSE_REPORTS',
  'VIEW_VERIFICATION_ARTIFACTS',
  'APPROVE_VERIFICATION',
  'VIEW_AUDIT_LOGS',
  'VIEW_HEALTH_STATUS',
  'MANAGE_ALERTS',
  'VIEW_SYSTEMS_METRICS',
  'VIEW_BILLING_DATA',
  'MANAGE_BILLING_DISPUTES',
  'VIEW_REVENUE_REPORTS',
  'EXPORT_DATA',
  'RUN_BULK_OPERATIONS',
  'MODIFY_BULK_DATA'
);

-- CreateEnum for AdminAction
CREATE TYPE "AdminAction" AS ENUM (
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DELETED',
  'USER_RESTRICTED',
  'USER_PASSWORD_RESET',
  'JOB_REVIEWED',
  'JOB_APPROVED',
  'JOB_REJECTED',
  'APPLICATION_REVIEWED',
  'VERIFICATION_APPROVED',
  'VERIFICATION_REJECTED',
  'TRUST_CASE_OPENED',
  'TRUST_CASE_ACTIONED',
  'ABUSE_REPORT_ACTIONED',
  'ALERT_CREATED',
  'ALERT_RESOLVED',
  'BULK_OPERATION_STARTED',
  'BULK_OPERATION_COMPLETED',
  'SYSTEM_CONFIGURATION_CHANGED',
  'ALERT_SETTINGS_UPDATED'
);

-- CreateEnum for AlertSeverity
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum for AlertStatus
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum for BulkOperationType
CREATE TYPE "BulkOperationType" AS ENUM (
  'USER_RESTRICTION',
  'PASSWORD_RESET',
  'DATA_EXPORT',
  'JOB_BATCH_REVIEW',
  'VERIFICATION_BATCH_PROCESS',
  'CUSTOM_QUERY'
);

-- CreateEnum for BulkOperationStatus
CREATE TYPE "BulkOperationStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateTable AdminRole
CREATE TABLE "AdminRole" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "title" VARCHAR(100) NOT NULL,
  "description" VARCHAR(500),
  "permissions" "AdminPermission"[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable AuditLog
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "adminId" TEXT,
  "action" "AdminAction" NOT NULL,
  "targetType" VARCHAR(50) NOT NULL,
  "targetId" TEXT,
  "targetName" VARCHAR(200),
  "resourceType" VARCHAR(50),
  "resourceId" TEXT,
  "changes" JSONB,
  "reason" VARCHAR(500),
  "metadata" JSONB,
  "ipAddress" VARCHAR(50),
  "userAgent" VARCHAR(500),
  "status" VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
  "errorDetails" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable PlatformAlert
CREATE TABLE "PlatformAlert" (
  "id" TEXT NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT NOT NULL,
  "severity" "AlertSeverity" NOT NULL,
  "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
  "category" VARCHAR(50) NOT NULL,
  "metrics" JSONB,
  "affectedUsers" INTEGER,
  "affectedJobs" INTEGER,
  "affectedApps" INTEGER,
  "firstOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable BulkOperation
CREATE TABLE "BulkOperation" (
  "id" TEXT NOT NULL,
  "operationType" "BulkOperationType" NOT NULL,
  "status" "BulkOperationStatus" NOT NULL DEFAULT 'QUEUED',
  "initiatedBy" VARCHAR(100),
  "query" JSONB,
  "filters" JSONB,
  "targetCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "results" JSONB,
  "errorLog" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BulkOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminRole_adminId_key" ON "AdminRole"("adminId");

-- CreateIndex
CREATE INDEX "AdminRole_isActive_idx" ON "AdminRole"("isActive");

-- CreateIndex
CREATE INDEX "AuditLog_adminId_createdAt_idx" ON "AuditLog"("adminId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_targetId_idx" ON "AuditLog"("targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "PlatformAlert_severity_status_createdAt_idx" ON "PlatformAlert"("severity", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PlatformAlert_category_status_idx" ON "PlatformAlert"("category", "status");

-- CreateIndex
CREATE INDEX "PlatformAlert_status_updatedAt_idx" ON "PlatformAlert"("status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "BulkOperation_status_createdAt_idx" ON "BulkOperation"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BulkOperation_operationType_createdAt_idx" ON "BulkOperation"("operationType", "createdAt" DESC);

-- AddForeignKey for AdminRole
ALTER TABLE "AdminRole" ADD CONSTRAINT "AdminRole_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for AuditLog
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
