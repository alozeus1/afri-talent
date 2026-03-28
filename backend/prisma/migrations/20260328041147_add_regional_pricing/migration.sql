-- CreateEnum
CREATE TYPE "BillingRegion" AS ENUM ('AFRICA', 'EUROPE', 'ROW');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "RegionChangeSource" AS ENUM ('USER_SELECTED', 'STRIPE_PAYMENT', 'IP_GEOLOCATION', 'ADMIN_OVERRIDE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubscriptionPlan" ADD VALUE 'EMPLOYER_FREE';
ALTER TYPE "SubscriptionPlan" ADD VALUE 'EMPLOYER_BASIC';
ALTER TYPE "SubscriptionPlan" ADD VALUE 'EMPLOYER_PREMIUM';

-- CreateTable
CREATE TABLE "RegionalPrice" (
    "id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "region" "BillingRegion" NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "stripePriceId" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegionalPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanEntitlement" (
    "id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "applicationsPerMonth" INTEGER,
    "aiResumeReviews" INTEGER,
    "aiJobMatches" INTEGER,
    "aiApplyPacks" INTEGER,
    "savedSearches" INTEGER,
    "jobAlerts" BOOLEAN NOT NULL DEFAULT true,
    "prioritySupport" BOOLEAN NOT NULL DEFAULT false,
    "skillsAssessments" BOOLEAN NOT NULL DEFAULT false,
    "chatAccess" BOOLEAN NOT NULL DEFAULT false,
    "autopilot" BOOLEAN NOT NULL DEFAULT false,
    "jobPostsPerMonth" INTEGER,
    "talentSearch" BOOLEAN NOT NULL DEFAULT false,
    "analytics" BOOLEAN NOT NULL DEFAULT false,
    "apiAccess" BOOLEAN NOT NULL DEFAULT false,
    "customFeatures" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBillingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "country" VARCHAR(2),
    "region" "BillingRegion" NOT NULL DEFAULT 'ROW',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "pricingVersion" INTEGER NOT NULL DEFAULT 1,
    "isGrandfathered" BOOLEAN NOT NULL DEFAULT false,
    "grandfatheredAt" TIMESTAMP(3),
    "regionSource" "RegionChangeSource" NOT NULL DEFAULT 'USER_SELECTED',
    "taxIdType" VARCHAR(50),
    "taxIdValue" VARCHAR(100),
    "stripeCountry" VARCHAR(2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingRegionAudit" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "previousRegion" "BillingRegion",
    "newRegion" "BillingRegion" NOT NULL,
    "previousCountry" VARCHAR(2),
    "newCountry" VARCHAR(2),
    "source" "RegionChangeSource" NOT NULL,
    "ipAddress" VARCHAR(45),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingRegionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegionConfig" (
    "id" TEXT NOT NULL,
    "region" "BillingRegion" NOT NULL,
    "defaultCurrency" VARCHAR(3) NOT NULL,
    "currencies" TEXT[],
    "countries" TEXT[],
    "taxBehavior" VARCHAR(20) NOT NULL DEFAULT 'unspecified',
    "taxLabel" VARCHAR(50),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegionalPrice_plan_region_isActive_idx" ON "RegionalPrice"("plan", "region", "isActive");

-- CreateIndex
CREATE INDEX "RegionalPrice_stripePriceId_idx" ON "RegionalPrice"("stripePriceId");

-- CreateIndex
CREATE UNIQUE INDEX "RegionalPrice_plan_region_interval_currency_key" ON "RegionalPrice"("plan", "region", "interval", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "PlanEntitlement_plan_key" ON "PlanEntitlement"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "UserBillingProfile_userId_key" ON "UserBillingProfile"("userId");

-- CreateIndex
CREATE INDEX "UserBillingProfile_userId_idx" ON "UserBillingProfile"("userId");

-- CreateIndex
CREATE INDEX "UserBillingProfile_region_idx" ON "UserBillingProfile"("region");

-- CreateIndex
CREATE INDEX "BillingRegionAudit_profileId_createdAt_idx" ON "BillingRegionAudit"("profileId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RegionConfig_region_key" ON "RegionConfig"("region");

-- AddForeignKey
ALTER TABLE "UserBillingProfile" ADD CONSTRAINT "UserBillingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRegionAudit" ADD CONSTRAINT "BillingRegionAudit_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserBillingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
