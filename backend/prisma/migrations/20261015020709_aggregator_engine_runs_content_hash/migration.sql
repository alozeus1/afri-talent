-- Aggregator engine: additive only.
-- (Hand-trimmed: `prisma migrate dev --create-only` also emitted unrelated
-- pre-existing drift — embedding column drops, enum/default changes — which is
-- intentionally NOT part of this migration.)

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "contentHash" VARCHAR(64);

-- CreateTable
CREATE TABLE "AggregatorRun" (
    "id" TEXT NOT NULL,
    "trigger" VARCHAR(32) NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(16) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "totals" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AggregatorRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AggregatorRun_startedAt_idx" ON "AggregatorRun"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "AggregatorRun_status_startedAt_idx" ON "AggregatorRun"("status", "startedAt");
