-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobStatus" ADD VALUE 'CLOSED';
ALTER TYPE "JobStatus" ADD VALUE 'REMOVED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_MESSAGE';

-- AlterEnum
ALTER TYPE "AccountRestrictionStatus" ADD VALUE 'BANNED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminAction" ADD VALUE 'USER_SUSPENDED';
ALTER TYPE "AdminAction" ADD VALUE 'USER_BANNED';
ALTER TYPE "AdminAction" ADD VALUE 'USER_REACTIVATED';
ALTER TYPE "AdminAction" ADD VALUE 'USER_SESSIONS_REVOKED';
ALTER TYPE "AdminAction" ADD VALUE 'USER_EMAIL_REVERIFICATION_FORCED';
ALTER TYPE "AdminAction" ADD VALUE 'USER_MESSAGED';
ALTER TYPE "AdminAction" ADD VALUE 'USERS_BROADCAST_SENT';
ALTER TYPE "AdminAction" ADD VALUE 'JOB_CLOSED';
ALTER TYPE "AdminAction" ADD VALUE 'JOB_REOPENED';
ALTER TYPE "AdminAction" ADD VALUE 'JOB_FEATURED';
ALTER TYPE "AdminAction" ADD VALUE 'JOB_UNFEATURED';
ALTER TYPE "AdminAction" ADD VALUE 'JOB_REMOVED';
ALTER TYPE "AdminAction" ADD VALUE 'EMPLOYER_VERIFICATION_UPDATED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountRestrictedUntil" TIMESTAMP(3),
ADD COLUMN     "sessionsRevokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "featuredAt" TIMESTAMP(3),
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "moderationReason" VARCHAR(500);

-- CreateIndex
CREATE INDEX "Job_isFeatured_status_idx" ON "Job"("isFeatured", "status");

