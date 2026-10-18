CREATE TYPE "ResumeScanJobStatus" AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED','EXHAUSTED');
CREATE TYPE "ResumeScanResult" AS ENUM ('CLEAN','REJECTED','QUARANTINED','ERROR');
CREATE TABLE "ResumeScanJob" (
 "id" TEXT NOT NULL, "resumeId" TEXT NOT NULL, "status" "ResumeScanJobStatus" NOT NULL DEFAULT 'PENDING', "bucket" VARCHAR(255) NOT NULL, "objectKey" VARCHAR(500) NOT NULL, "objectVersion" VARCHAR(255), "attemptCount" INTEGER NOT NULL DEFAULT 0, "maxAttempts" INTEGER NOT NULL DEFAULT 3, "result" "ResumeScanResult", "resultDeliveryId" VARCHAR(255), "errorCode" VARCHAR(100), "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ResumeScanJob_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ResumeScanJob_resultDeliveryId_key" ON "ResumeScanJob"("resultDeliveryId");
CREATE INDEX "ResumeScanJob_resumeId_status_idx" ON "ResumeScanJob"("resumeId","status");
CREATE INDEX "ResumeScanJob_status_attemptCount_idx" ON "ResumeScanJob"("status","attemptCount");
ALTER TABLE "ResumeScanJob" ADD CONSTRAINT "ResumeScanJob_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
