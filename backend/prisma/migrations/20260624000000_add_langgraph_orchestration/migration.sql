-- LangGraph orchestration: business-facing audit + observability + idempotency.
-- Additive only. No changes to existing tables. Checkpointer tables are managed
-- separately by @langchain/langgraph-checkpoint-postgres (PostgresSaver.setup()).

-- CreateEnum
CREATE TYPE "GraphRunStatus" AS ENUM ('RUNNING', 'INTERRUPTED', 'AWAITING_APPROVAL', 'COMPLETE', 'PARTIAL', 'BLOCKED', 'FAILED');

-- CreateEnum
CREATE TYPE "GraphApprovalState" AS ENUM ('NONE', 'REQUESTED', 'GRANTED', 'DENIED');

-- CreateTable
CREATE TABLE "GraphRun" (
    "id" TEXT NOT NULL,
    "graphRunId" TEXT NOT NULL,
    "workflowType" VARCHAR(60) NOT NULL,
    "threadId" VARCHAR(191) NOT NULL,
    "status" "GraphRunStatus" NOT NULL DEFAULT 'RUNNING',
    "approvalState" "GraphApprovalState" NOT NULL DEFAULT 'NONE',
    "userId" VARCHAR(191),
    "candidateId" VARCHAR(191),
    "employerId" VARCHAR(191),
    "jobId" VARCHAR(191),
    "applicationId" VARCHAR(191),
    "aiRunId" VARCHAR(191),
    "currentStep" VARCHAR(120) NOT NULL DEFAULT 'start',
    "tokenUsage" INTEGER NOT NULL DEFAULT 0,
    "costEstimateMilliUsd" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "riskFlags" JSONB,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphRunEvent" (
    "id" TEXT NOT NULL,
    "graphRunId" VARCHAR(191) NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "node" VARCHAR(120),
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GraphRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "scope" VARCHAR(80) NOT NULL,
    "key" VARCHAR(191) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'RESERVED',
    "resultRef" VARCHAR(191),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GraphRun_graphRunId_key" ON "GraphRun"("graphRunId");
CREATE INDEX "GraphRun_workflowType_createdAt_idx" ON "GraphRun"("workflowType", "createdAt" DESC);
CREATE INDEX "GraphRun_status_idx" ON "GraphRun"("status");
CREATE INDEX "GraphRun_userId_idx" ON "GraphRun"("userId");
CREATE INDEX "GraphRun_applicationId_idx" ON "GraphRun"("applicationId");
CREATE INDEX "GraphRun_threadId_idx" ON "GraphRun"("threadId");

-- CreateIndex
CREATE INDEX "GraphRunEvent_graphRunId_createdAt_idx" ON "GraphRunEvent"("graphRunId", "createdAt");
CREATE INDEX "GraphRunEvent_type_idx" ON "GraphRunEvent"("type");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");
CREATE INDEX "IdempotencyKey_scope_createdAt_idx" ON "IdempotencyKey"("scope", "createdAt" DESC);
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- AddForeignKey
ALTER TABLE "GraphRunEvent" ADD CONSTRAINT "GraphRunEvent_graphRunId_fkey" FOREIGN KEY ("graphRunId") REFERENCES "GraphRun"("graphRunId") ON DELETE CASCADE ON UPDATE CASCADE;
