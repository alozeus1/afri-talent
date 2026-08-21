CREATE TABLE "ResumeScanDelivery" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "deliveryId" VARCHAR(255) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "result" "ResumeScanResult" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResumeScanDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResumeScanDelivery_deliveryId_key"
  ON "ResumeScanDelivery"("deliveryId");
CREATE INDEX "ResumeScanDelivery_jobId_createdAt_idx"
  ON "ResumeScanDelivery"("jobId", "createdAt");

ALTER TABLE "ResumeScanDelivery"
  ADD CONSTRAINT "ResumeScanDelivery_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "ResumeScanJob"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
