-- CreateEnum
CREATE TYPE "LearningFeedbackStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: add relation-only fields (Prisma virtual, no DB columns needed for User)

-- CreateTable
CREATE TABLE "LearningFeedback" (
    "id"                TEXT                       NOT NULL,
    "areaSlug"          VARCHAR(120)               NOT NULL,
    "lessonTitle"       VARCHAR(200),
    "firstName"         VARCHAR(80)                NOT NULL,
    "lastName"          VARCHAR(80)                NOT NULL,
    "userId"            TEXT,
    "rating"            INTEGER                    NOT NULL,
    "comment"           TEXT                       NOT NULL,
    "attachPhoto"       BOOLEAN                    NOT NULL DEFAULT false,
    "avatarUrlSnapshot" VARCHAR(500),
    "displayName"       VARCHAR(180)               NOT NULL,
    "status"            "LearningFeedbackStatus"   NOT NULL DEFAULT 'PENDING',
    "approvedAt"        TIMESTAMP(3),
    "approvedById"      TEXT,
    "moderationNotes"   TEXT,
    "createdAt"         TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)               NOT NULL,

    CONSTRAINT "LearningFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningFeedback_areaSlug_status_idx" ON "LearningFeedback"("areaSlug", "status");

-- CreateIndex
CREATE INDEX "LearningFeedback_userId_idx" ON "LearningFeedback"("userId");

-- CreateIndex
CREATE INDEX "LearningFeedback_createdAt_idx" ON "LearningFeedback"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "LearningFeedback" ADD CONSTRAINT "LearningFeedback_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningFeedback" ADD CONSTRAINT "LearningFeedback_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
