-- Migration: Add Competitive Features
-- Adds: Saved Searches, Job Alerts, Company Reviews, Skills Assessments

-- Create new enums
CREATE TYPE "AlertFrequency" AS ENUM ('INSTANT', 'DAILY', 'WEEKLY');
CREATE TYPE "AssessmentProvider" AS ENUM ('INTERNAL', 'TESTGORILLA', 'HACKERRANK', 'CODILITY', 'CUSTOM');
CREATE TYPE "AssessmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'FAILED');

-- Saved Searches table
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "keywords" TEXT[],
    "locations" TEXT[],
    "jobTypes" TEXT[],
    "seniorities" TEXT[],
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "remoteOnly" BOOLEAN NOT NULL DEFAULT false,
    "visaSponsorship" BOOLEAN NOT NULL DEFAULT false,
    "alertEnabled" BOOLEAN NOT NULL DEFAULT true,
    "alertFrequency" "AlertFrequency" NOT NULL DEFAULT 'DAILY',
    "lastAlertAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- Job Alerts table
CREATE TABLE "JobAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "searchId" TEXT,
    "matchScore" INTEGER,
    "sentAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAlert_pkey" PRIMARY KEY ("id")
);

-- Company Reviews table
CREATE TABLE "CompanyReview" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "cultureRating" INTEGER,
    "salaryRating" INTEGER,
    "workLifeRating" INTEGER,
    "managementRating" INTEGER,
    "growthRating" INTEGER,
    "title" VARCHAR(200) NOT NULL,
    "pros" TEXT NOT NULL,
    "cons" TEXT NOT NULL,
    "advice" TEXT,
    "isCurrentEmployee" BOOLEAN NOT NULL DEFAULT false,
    "employmentStatus" VARCHAR(50),
    "jobTitle" VARCHAR(100),
    "yearsAtCompany" INTEGER,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyReview_pkey" PRIMARY KEY ("id")
);

-- Company Rating Aggregates table
CREATE TABLE "CompanyRatingAggregate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "averageOverall" DOUBLE PRECISION,
    "averageCulture" DOUBLE PRECISION,
    "averageSalary" DOUBLE PRECISION,
    "averageWorkLife" DOUBLE PRECISION,
    "averageManagement" DOUBLE PRECISION,
    "averageGrowth" DOUBLE PRECISION,
    "recommendationPct" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyRatingAggregate_pkey" PRIMARY KEY ("id")
);

-- Skills Assessment table
CREATE TABLE "SkillAssessment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillName" VARCHAR(100) NOT NULL,
    "provider" "AssessmentProvider" NOT NULL,
    "externalId" VARCHAR(255),
    "status" "AssessmentStatus" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER,
    "percentile" INTEGER,
    "level" VARCHAR(50),
    "resultUrl" VARCHAR(500),
    "metadata" JSONB,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillAssessment_pkey" PRIMARY KEY ("id")
);

-- Assessment Invites table
CREATE TABLE "AssessmentInvite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "applicationId" TEXT,
    "provider" "AssessmentProvider" NOT NULL,
    "assessmentUrl" VARCHAR(500) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentInvite_pkey" PRIMARY KEY ("id")
);

-- Add new columns to Company table
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "logo" VARCHAR(500);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "industry" VARCHAR(100);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "size" VARCHAR(50);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "headquarters" VARCHAR(200);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "founded" INTEGER;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "website" VARCHAR(500);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "linkedinUrl" VARCHAR(500);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "hiresFromAfrica" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "remotePolicy" VARCHAR(50);

-- Create unique constraints
ALTER TABLE "JobAlert" ADD CONSTRAINT "JobAlert_userId_jobId_key" UNIQUE ("userId", "jobId");
ALTER TABLE "CompanyRatingAggregate" ADD CONSTRAINT "CompanyRatingAggregate_companyId_key" UNIQUE ("companyId");

-- Create foreign key constraints
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobAlert" ADD CONSTRAINT "JobAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobAlert" ADD CONSTRAINT "JobAlert_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyReview" ADD CONSTRAINT "CompanyReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyReview" ADD CONSTRAINT "CompanyReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyRatingAggregate" ADD CONSTRAINT "CompanyRatingAggregate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SkillAssessment" ADD CONSTRAINT "SkillAssessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentInvite" ADD CONSTRAINT "AssessmentInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentInvite" ADD CONSTRAINT "AssessmentInvite_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create indexes
CREATE INDEX "SavedSearch_userId_idx" ON "SavedSearch"("userId");
CREATE INDEX "SavedSearch_alertEnabled_alertFrequency_idx" ON "SavedSearch"("alertEnabled", "alertFrequency");
CREATE INDEX "JobAlert_userId_sentAt_idx" ON "JobAlert"("userId", "sentAt");
CREATE INDEX "JobAlert_jobId_idx" ON "JobAlert"("jobId");
CREATE INDEX "CompanyReview_companyId_isApproved_idx" ON "CompanyReview"("companyId", "isApproved");
CREATE INDEX "CompanyReview_userId_idx" ON "CompanyReview"("userId");
CREATE INDEX "CompanyReview_createdAt_idx" ON "CompanyReview"("createdAt" DESC);
CREATE INDEX "SkillAssessment_userId_skillName_idx" ON "SkillAssessment"("userId", "skillName");
CREATE INDEX "SkillAssessment_status_idx" ON "SkillAssessment"("status");
CREATE INDEX "AssessmentInvite_userId_idx" ON "AssessmentInvite"("userId");
CREATE INDEX "AssessmentInvite_jobId_idx" ON "AssessmentInvite"("jobId");
CREATE INDEX "Company_hiresFromAfrica_idx" ON "Company"("hiresFromAfrica");
