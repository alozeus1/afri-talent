-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('RUNNING', 'COMPLETE', 'PARTIAL', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AiRunType" AS ENUM ('RESUME_REVIEW', 'JOB_MATCH', 'APPLY_PACK');

-- AlterTable
ALTER TABLE "CandidateProfile" ADD COLUMN     "openToWork" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profileCompleteness" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runType" "AiRunType" NOT NULL,
    "status" "AiRunStatus" NOT NULL DEFAULT 'RUNNING',
    "resumeHash" TEXT,
    "tokenBudgetTotal" INTEGER NOT NULL,
    "tokenBudgetUsed" INTEGER NOT NULL DEFAULT 0,
    "agentCalls" JSONB,
    "notes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRunJob" (
    "id" TEXT NOT NULL,
    "aiRunId" TEXT NOT NULL,
    "jobIndex" INTEGER NOT NULL,
    "jobDbId" TEXT,
    "jobHash" TEXT,
    "jobTitle" TEXT,
    "jobCompany" TEXT,
    "jobUrl" TEXT,
    "score" INTEGER,
    "mustHavePct" DOUBLE PRECISION,
    "tailoredOutput" JSONB,
    "coverLetterOutput" JSONB,
    "guardReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRunJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiRun_runId_key" ON "AiRun"("runId");

-- CreateIndex
CREATE INDEX "AiRun_userId_createdAt_idx" ON "AiRun"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiRun_runId_idx" ON "AiRun"("runId");

-- CreateIndex
CREATE INDEX "AiRunJob_aiRunId_idx" ON "AiRunJob"("aiRunId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "CandidateProfile_openToWork_idx" ON "CandidateProfile"("openToWork");

-- CreateIndex
CREATE INDEX "CandidateProfile_skills_idx" ON "CandidateProfile"("skills");

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunJob" ADD CONSTRAINT "AiRunJob_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
