-- CreateEnum
CREATE TYPE "ImmigrationStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'DENIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'ACCEPTED', 'HIRED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('INTERVIEW', 'FOLLOW_UP', 'DEADLINE', 'CUSTOM');

-- CreateTable
CREATE TABLE "InterviewExperience" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobTitle" VARCHAR(200) NOT NULL,
    "difficulty" VARCHAR(20) NOT NULL,
    "outcome" VARCHAR(20) NOT NULL,
    "interviewType" VARCHAR(50) NOT NULL,
    "process" TEXT NOT NULL,
    "questions" TEXT[],
    "tips" TEXT,
    "duration" VARCHAR(50),
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT NOT NULL,
    "jobTitle" VARCHAR(200) NOT NULL,
    "location" VARCHAR(200) NOT NULL,
    "country" VARCHAR(100) NOT NULL,
    "salaryCurrency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "salaryAmount" INTEGER NOT NULL,
    "salaryPeriod" VARCHAR(20) NOT NULL DEFAULT 'yearly',
    "yearsExperience" INTEGER,
    "employmentType" VARCHAR(50),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImmigrationProcess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visaType" VARCHAR(100) NOT NULL,
    "targetCountry" VARCHAR(100) NOT NULL,
    "status" "ImmigrationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startDate" TIMESTAMP(3),
    "expectedEndDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImmigrationProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImmigrationStep" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "ImmigrationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "documents" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImmigrationStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeEmail" VARCHAR(255) NOT NULL,
    "refereeId" TEXT,
    "jobId" TEXT,
    "companyName" VARCHAR(200),
    "message" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningResource" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "url" VARCHAR(500) NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "skills" TEXT[],
    "difficulty" VARCHAR(20) NOT NULL,
    "durationHours" DOUBLE PRECISION,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" VARCHAR(500),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "eventType" "CalendarEventType" NOT NULL DEFAULT 'CUSTOM',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "location" VARCHAR(300),
    "meetingUrl" VARCHAR(500),
    "jobId" TEXT,
    "applicationId" TEXT,
    "reminderMinutes" INTEGER DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileView" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "viewerId" TEXT,
    "viewerRole" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewExperience_companyId_isApproved_idx" ON "InterviewExperience"("companyId", "isApproved");

-- CreateIndex
CREATE INDEX "InterviewExperience_userId_idx" ON "InterviewExperience"("userId");

-- CreateIndex
CREATE INDEX "InterviewExperience_jobTitle_idx" ON "InterviewExperience"("jobTitle");

-- CreateIndex
CREATE INDEX "SalaryReport_jobTitle_country_idx" ON "SalaryReport"("jobTitle", "country");

-- CreateIndex
CREATE INDEX "SalaryReport_companyId_idx" ON "SalaryReport"("companyId");

-- CreateIndex
CREATE INDEX "SalaryReport_userId_idx" ON "SalaryReport"("userId");

-- CreateIndex
CREATE INDEX "SalaryReport_country_idx" ON "SalaryReport"("country");

-- CreateIndex
CREATE INDEX "ImmigrationProcess_userId_idx" ON "ImmigrationProcess"("userId");

-- CreateIndex
CREATE INDEX "ImmigrationProcess_status_idx" ON "ImmigrationProcess"("status");

-- CreateIndex
CREATE INDEX "ImmigrationStep_processId_idx" ON "ImmigrationStep"("processId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE INDEX "Referral_refereeEmail_idx" ON "Referral"("refereeEmail");

-- CreateIndex
CREATE INDEX "Referral_refereeId_idx" ON "Referral"("refereeId");

-- CreateIndex
CREATE INDEX "LearningResource_category_idx" ON "LearningResource"("category");

-- CreateIndex
CREATE INDEX "LearningResource_skills_idx" ON "LearningResource"("skills");

-- CreateIndex
CREATE INDEX "LearningResource_featured_idx" ON "LearningResource"("featured");

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_startTime_idx" ON "CalendarEvent"("userId", "startTime");

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_eventType_idx" ON "CalendarEvent"("userId", "eventType");

-- CreateIndex
CREATE INDEX "ProfileView_profileId_createdAt_idx" ON "ProfileView"("profileId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ProfileView_viewerId_idx" ON "ProfileView"("viewerId");

-- AddForeignKey
ALTER TABLE "InterviewExperience" ADD CONSTRAINT "InterviewExperience_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewExperience" ADD CONSTRAINT "InterviewExperience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryReport" ADD CONSTRAINT "SalaryReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryReport" ADD CONSTRAINT "SalaryReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImmigrationProcess" ADD CONSTRAINT "ImmigrationProcess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImmigrationStep" ADD CONSTRAINT "ImmigrationStep_processId_fkey" FOREIGN KEY ("processId") REFERENCES "ImmigrationProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
