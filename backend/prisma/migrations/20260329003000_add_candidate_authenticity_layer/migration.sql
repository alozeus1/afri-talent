CREATE TYPE "PartnerOrganizationType" AS ENUM (
  'UNIVERSITY',
  'BOOTCAMP',
  'TRAINING_INSTITUTE',
  'SCHOLARSHIP_PARTNER'
);

CREATE TYPE "CandidateSkillVerificationMethod" AS ENUM (
  'CERTIFICATE',
  'PORTFOLIO',
  'ASSESSMENT',
  'MANUAL_REVIEW',
  'PARTNER_ISSUED'
);

CREATE TYPE "CandidateSkillVerificationStatus" AS ENUM (
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'EXPIRED'
);

CREATE TYPE "CandidatePartnerMarkerType" AS ENUM (
  'UNIVERSITY_VERIFIED',
  'BOOTCAMP_VERIFIED',
  'TRAINING_VERIFIED',
  'SCHOLARSHIP_ALUMNI',
  'SCHOLARSHIP_FELLOW',
  'PARTNER_RECOMMENDED'
);

CREATE TYPE "CandidatePartnerMarkerStatus" AS ENUM (
  'PENDING',
  'ACTIVE',
  'REVOKED',
  'EXPIRED'
);

ALTER TABLE "CandidateProfile"
  ADD COLUMN "workHistory" JSONB,
  ADD COLUMN "educationHistory" JSONB,
  ADD COLUMN "certifications" JSONB;

ALTER TABLE "CandidateTrustProfile"
  ADD COLUMN "verifiedSkillCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "partnerSignalCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "assessmentBacked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fullyCompletedProfile" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "explainabilitySignals" JSONB;

ALTER TABLE "UniversityPartner"
  ADD COLUMN "organizationType" "PartnerOrganizationType" NOT NULL DEFAULT 'UNIVERSITY';

CREATE TABLE "CandidateVerifiedSkill" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "skillName" VARCHAR(120) NOT NULL,
  "method" "CandidateSkillVerificationMethod" NOT NULL,
  "status" "CandidateSkillVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "evidenceLabel" VARCHAR(200),
  "evidenceUrl" VARCHAR(500),
  "artifactId" TEXT,
  "assessmentId" TEXT,
  "partnerId" TEXT,
  "partnerRecordId" TEXT,
  "reviewerId" TEXT,
  "score" INTEGER,
  "confidenceNote" VARCHAR(255),
  "metadata" JSONB,
  "verifiedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CandidateVerifiedSkill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidatePartnerMarker" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "partnerRecordId" TEXT,
  "markerType" "CandidatePartnerMarkerType" NOT NULL,
  "status" "CandidatePartnerMarkerStatus" NOT NULL DEFAULT 'PENDING',
  "label" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "reviewerId" TEXT,
  "issuedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CandidatePartnerMarker_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CandidateVerifiedSkill_userId_status_verifiedAt_idx"
  ON "CandidateVerifiedSkill"("userId", "status", "verifiedAt" DESC);
CREATE INDEX "CandidateVerifiedSkill_skillName_status_idx"
  ON "CandidateVerifiedSkill"("skillName", "status");
CREATE INDEX "CandidateVerifiedSkill_method_status_idx"
  ON "CandidateVerifiedSkill"("method", "status");

CREATE INDEX "CandidatePartnerMarker_userId_status_issuedAt_idx"
  ON "CandidatePartnerMarker"("userId", "status", "issuedAt" DESC);
CREATE INDEX "CandidatePartnerMarker_partnerId_status_idx"
  ON "CandidatePartnerMarker"("partnerId", "status");
CREATE INDEX "CandidatePartnerMarker_markerType_status_idx"
  ON "CandidatePartnerMarker"("markerType", "status");

ALTER TABLE "CandidateVerifiedSkill"
  ADD CONSTRAINT "CandidateVerifiedSkill_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "CandidateVerifiedSkill"
  ADD CONSTRAINT "CandidateVerifiedSkill_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "VerificationArtifact"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "CandidateVerifiedSkill"
  ADD CONSTRAINT "CandidateVerifiedSkill_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "SkillAssessment"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "CandidateVerifiedSkill"
  ADD CONSTRAINT "CandidateVerifiedSkill_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "UniversityPartner"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "CandidateVerifiedSkill"
  ADD CONSTRAINT "CandidateVerifiedSkill_partnerRecordId_fkey"
  FOREIGN KEY ("partnerRecordId") REFERENCES "UniversityPartnerRecord"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "CandidateVerifiedSkill"
  ADD CONSTRAINT "CandidateVerifiedSkill_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "CandidatePartnerMarker"
  ADD CONSTRAINT "CandidatePartnerMarker_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "CandidatePartnerMarker"
  ADD CONSTRAINT "CandidatePartnerMarker_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "UniversityPartner"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "CandidatePartnerMarker"
  ADD CONSTRAINT "CandidatePartnerMarker_partnerRecordId_fkey"
  FOREIGN KEY ("partnerRecordId") REFERENCES "UniversityPartnerRecord"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "CandidatePartnerMarker"
  ADD CONSTRAINT "CandidatePartnerMarker_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
