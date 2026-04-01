-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "isExpired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Job_isExpired_status_idx" ON "Job"("isExpired", "status");

-- CreateIndex
CREATE INDEX "Job_expiresAt_idx" ON "Job"("expiresAt");
