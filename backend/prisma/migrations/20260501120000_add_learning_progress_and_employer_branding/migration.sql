-- Add persisted learning progress for candidate course tracking.
CREATE TYPE "LearningProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "LearningProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceId" VARCHAR(160) NOT NULL,
    "status" "LearningProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "lastStepIndex" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearningProgress_userId_resourceId_key" ON "LearningProgress"("userId", "resourceId");
CREATE INDEX "LearningProgress_userId_status_idx" ON "LearningProgress"("userId", "status");
CREATE INDEX "LearningProgress_resourceId_idx" ON "LearningProgress"("resourceId");

ALTER TABLE "LearningProgress"
  ADD CONSTRAINT "LearningProgress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Premium employer dashboard/company profile customization.
ALTER TABLE "Employer"
  ADD COLUMN "logoUrl" VARCHAR(500),
  ADD COLUMN "brandColor" VARCHAR(7),
  ADD COLUMN "accentColor" VARCHAR(7);
