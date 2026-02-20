/*
  Warnings:

  - A unique constraint covering the columns `[jobId,candidateId]` on the table `Application` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "AdminReview_reviewerId_idx" ON "AdminReview"("reviewerId");

-- CreateIndex
CREATE INDEX "AdminReview_targetType_idx" ON "AdminReview"("targetType");

-- CreateIndex
CREATE INDEX "AdminReview_createdAt_idx" ON "AdminReview"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Application_jobId_idx" ON "Application"("jobId");

-- CreateIndex
CREATE INDEX "Application_candidateId_idx" ON "Application"("candidateId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_createdAt_idx" ON "Application"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_candidateId_key" ON "Application"("jobId", "candidateId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_status_publishedAt_idx" ON "Job"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Job_employerId_idx" ON "Job"("employerId");

-- CreateIndex
CREATE INDEX "Job_location_idx" ON "Job"("location");

-- CreateIndex
CREATE INDEX "Job_type_idx" ON "Job"("type");

-- CreateIndex
CREATE INDEX "Job_seniority_idx" ON "Job"("seniority");

-- CreateIndex
CREATE INDEX "Resource_published_idx" ON "Resource"("published");

-- CreateIndex
CREATE INDEX "Resource_published_publishedAt_idx" ON "Resource"("published", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Resource_category_idx" ON "Resource"("category");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
