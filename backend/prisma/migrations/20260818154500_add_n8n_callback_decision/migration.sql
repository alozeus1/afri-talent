CREATE TABLE "N8nCallbackDecision" (
  "id" TEXT NOT NULL,
  "tokenDigest" VARCHAR(64) NOT NULL,
  "tokenJti" VARCHAR(64),
  "graphRunId" VARCHAR(191) NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "N8nCallbackDecision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "N8nCallbackDecision_tokenDigest_key" ON "N8nCallbackDecision"("tokenDigest");
CREATE INDEX "N8nCallbackDecision_graphRunId_action_idx" ON "N8nCallbackDecision"("graphRunId", "action");
CREATE INDEX "N8nCallbackDecision_tokenJti_idx" ON "N8nCallbackDecision"("tokenJti");
ALTER TABLE "N8nCallbackDecision" ADD CONSTRAINT "N8nCallbackDecision_graphRunId_fkey" FOREIGN KEY ("graphRunId") REFERENCES "GraphRun"("graphRunId") ON DELETE RESTRICT ON UPDATE CASCADE;
