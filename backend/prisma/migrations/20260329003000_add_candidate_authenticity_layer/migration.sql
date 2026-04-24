-- Bootstrap the trust/authenticity schema. Earlier iterations added the runtime
-- code before the full trust tables landed in migrations, so this migration must
-- be able to create the missing baseline objects on existing staging databases.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployerVerificationLevel') THEN
    CREATE TYPE "EmployerVerificationLevel" AS ENUM (
      'UNVERIFIED',
      'EMAIL_DOMAIN_VERIFIED',
      'BUSINESS_DOC_VERIFIED',
      'MANUAL_REVIEW_APPROVED',
      'PREMIUM_TRUSTED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CandidateVerificationLevel') THEN
    CREATE TYPE "CandidateVerificationLevel" AS ENUM (
      'UNVERIFIED',
      'EMAIL_VERIFIED',
      'PHONE_VERIFIED',
      'IDENTITY_DOCUMENT_VERIFIED',
      'SKILLS_VERIFIED',
      'EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VerificationArtifactType') THEN
    CREATE TYPE "VerificationArtifactType" AS ENUM (
      'BUSINESS_REGISTRATION',
      'DOMAIN_OWNERSHIP',
      'LINKEDIN_COMPANY',
      'IDENTITY_DOCUMENT',
      'CERTIFICATION',
      'EMPLOYMENT_PROOF'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VerificationArtifactStatus') THEN
    CREATE TYPE "VerificationArtifactStatus" AS ENUM (
      'PENDING',
      'APPROVED',
      'REJECTED',
      'NEEDS_MORE_INFO'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TrustEntityType') THEN
    CREATE TYPE "TrustEntityType" AS ENUM (
      'USER',
      'EMPLOYER',
      'CANDIDATE',
      'JOB',
      'APPLICATION',
      'MESSAGE',
      'REPORT'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TrustRiskLevel') THEN
    CREATE TYPE "TrustRiskLevel" AS ENUM (
      'LOW',
      'MEDIUM',
      'HIGH',
      'CRITICAL'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TrustCaseStatus') THEN
    CREATE TYPE "TrustCaseStatus" AS ENUM (
      'OPEN',
      'IN_REVIEW',
      'ACTIONED',
      'DISMISSED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModerationActionType') THEN
    CREATE TYPE "ModerationActionType" AS ENUM (
      'NOTE',
      'APPROVE',
      'REJECT',
      'HOLD',
      'LIMIT',
      'SUSPEND',
      'REINSTATE',
      'ESCALATE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AbuseReportReason') THEN
    CREATE TYPE "AbuseReportReason" AS ENUM (
      'SCAM',
      'FAKE_JOB',
      'IMPERSONATION',
      'SPAM',
      'OFF_PLATFORM_CONTACT',
      'ADVANCE_FEE_REQUEST',
      'HARASSMENT',
      'FAKE_PROFILE',
      'MISLEADING_SALARY',
      'OTHER'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AbuseReportStatus') THEN
    CREATE TYPE "AbuseReportStatus" AS ENUM (
      'OPEN',
      'TRIAGED',
      'RESOLVED',
      'DISMISSED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PhoneVerificationStatus') THEN
    CREATE TYPE "PhoneVerificationStatus" AS ENUM (
      'PENDING',
      'VERIFIED',
      'EXPIRED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PartnerOrganizationType') THEN
    CREATE TYPE "PartnerOrganizationType" AS ENUM (
      'UNIVERSITY',
      'BOOTCAMP',
      'TRAINING_INSTITUTE',
      'SCHOLARSHIP_PARTNER'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CandidateSkillVerificationMethod') THEN
    CREATE TYPE "CandidateSkillVerificationMethod" AS ENUM (
      'CERTIFICATE',
      'PORTFOLIO',
      'ASSESSMENT',
      'MANUAL_REVIEW',
      'PARTNER_ISSUED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CandidateSkillVerificationStatus') THEN
    CREATE TYPE "CandidateSkillVerificationStatus" AS ENUM (
      'PENDING',
      'VERIFIED',
      'REJECTED',
      'EXPIRED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CandidatePartnerMarkerType') THEN
    CREATE TYPE "CandidatePartnerMarkerType" AS ENUM (
      'UNIVERSITY_VERIFIED',
      'BOOTCAMP_VERIFIED',
      'TRAINING_VERIFIED',
      'SCHOLARSHIP_ALUMNI',
      'SCHOLARSHIP_FELLOW',
      'PARTNER_RECOMMENDED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CandidatePartnerMarkerStatus') THEN
    CREATE TYPE "CandidatePartnerMarkerStatus" AS ENUM (
      'PENDING',
      'ACTIVE',
      'REVOKED',
      'EXPIRED'
    );
  END IF;
END $$;

ALTER TABLE "CandidateProfile"
  ADD COLUMN IF NOT EXISTS "workHistory" JSONB,
  ADD COLUMN IF NOT EXISTS "educationHistory" JSONB,
  ADD COLUMN IF NOT EXISTS "certifications" JSONB;

ALTER TABLE "UniversityPartner"
  ADD COLUMN IF NOT EXISTS "organizationType" "PartnerOrganizationType" NOT NULL DEFAULT 'UNIVERSITY';

CREATE TABLE IF NOT EXISTS "EmployerTrustProfile" (
  "id" TEXT NOT NULL,
  "employerId" TEXT NOT NULL,
  "verificationLevel" "EmployerVerificationLevel" NOT NULL DEFAULT 'UNVERIFIED',
  "authenticityScore" INTEGER NOT NULL DEFAULT 0,
  "riskScore" INTEGER NOT NULL DEFAULT 0,
  "riskLevel" "TrustRiskLevel" NOT NULL DEFAULT 'LOW',
  "postingEligibility" BOOLEAN NOT NULL DEFAULT false,
  "requiresEnhancedVerification" BOOLEAN NOT NULL DEFAULT false,
  "verifiedDomain" VARCHAR(255),
  "websiteMatchesEmail" BOOLEAN NOT NULL DEFAULT false,
  "throwawayDomainDetected" BOOLEAN NOT NULL DEFAULT false,
  "linkedInCompanyUrl" VARCHAR(500),
  "domainVerifiedAt" TIMESTAMP(3),
  "businessDocVerifiedAt" TIMESTAMP(3),
  "manualApprovedAt" TIMESTAMP(3),
  "premiumTrustedAt" TIMESTAMP(3),
  "suspiciousSignals" JSONB,
  "internalNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployerTrustProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CandidateTrustProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "verificationLevel" "CandidateVerificationLevel" NOT NULL DEFAULT 'UNVERIFIED',
  "authenticityScore" INTEGER NOT NULL DEFAULT 0,
  "riskScore" INTEGER NOT NULL DEFAULT 0,
  "riskLevel" "TrustRiskLevel" NOT NULL DEFAULT 'LOW',
  "phoneNumber" VARCHAR(30),
  "phoneVerifiedAt" TIMESTAMP(3),
  "identityVerifiedAt" TIMESTAMP(3),
  "skillsVerifiedAt" TIMESTAMP(3),
  "employmentVerifiedAt" TIMESTAMP(3),
  "linkedinVerified" BOOLEAN NOT NULL DEFAULT false,
  "githubVerified" BOOLEAN NOT NULL DEFAULT false,
  "portfolioVerified" BOOLEAN NOT NULL DEFAULT false,
  "premiumFilterEligible" BOOLEAN NOT NULL DEFAULT false,
  "verifiedSkillCount" INTEGER NOT NULL DEFAULT 0,
  "partnerSignalCount" INTEGER NOT NULL DEFAULT 0,
  "assessmentBacked" BOOLEAN NOT NULL DEFAULT false,
  "fullyCompletedProfile" BOOLEAN NOT NULL DEFAULT false,
  "explainabilitySignals" JSONB,
  "suspiciousSignals" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateTrustProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CandidateTrustProfile"
  ADD COLUMN IF NOT EXISTS "verifiedSkillCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "partnerSignalCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "assessmentBacked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fullyCompletedProfile" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "explainabilitySignals" JSONB;

CREATE TABLE IF NOT EXISTS "PhoneVerificationChallenge" (
  "id" TEXT NOT NULL,
  "candidateTrustProfileId" TEXT NOT NULL,
  "phoneNumber" VARCHAR(30) NOT NULL,
  "otpHash" VARCHAR(128) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "verifiedAt" TIMESTAMP(3),
  "status" "PhoneVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneVerificationChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VerificationArtifact" (
  "id" TEXT NOT NULL,
  "type" "VerificationArtifactType" NOT NULL,
  "status" "VerificationArtifactStatus" NOT NULL DEFAULT 'PENDING',
  "userId" TEXT,
  "employerId" TEXT,
  "reviewerId" TEXT,
  "fileKey" VARCHAR(500),
  "fileName" VARCHAR(255),
  "externalUrl" VARCHAR(500),
  "metadata" JSONB,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewerNotes" TEXT,
  CONSTRAINT "VerificationArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TrustRiskEvent" (
  "id" TEXT NOT NULL,
  "entityType" "TrustEntityType" NOT NULL,
  "reasonCode" VARCHAR(100) NOT NULL,
  "summary" VARCHAR(255) NOT NULL,
  "evidence" JSONB,
  "scoreDelta" INTEGER NOT NULL,
  "resultingScore" INTEGER NOT NULL,
  "riskLevel" "TrustRiskLevel" NOT NULL,
  "autoHeld" BOOLEAN NOT NULL DEFAULT false,
  "userId" TEXT,
  "employerId" TEXT,
  "jobId" TEXT,
  "applicationId" TEXT,
  "threadId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrustRiskEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AbuseReport" (
  "id" TEXT NOT NULL,
  "reporterUserId" TEXT NOT NULL,
  "reportedUserId" TEXT,
  "employerId" TEXT,
  "targetJobId" TEXT,
  "targetApplicationId" TEXT,
  "targetThreadId" TEXT,
  "assignedAdminId" TEXT,
  "reason" "AbuseReportReason" NOT NULL,
  "details" TEXT,
  "status" "AbuseReportStatus" NOT NULL DEFAULT 'OPEN',
  "resolutionNotes" TEXT,
  "triagedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AbuseReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TrustCase" (
  "id" TEXT NOT NULL,
  "entityType" "TrustEntityType" NOT NULL,
  "status" "TrustCaseStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "TrustRiskLevel" NOT NULL DEFAULT 'MEDIUM',
  "title" VARCHAR(200) NOT NULL,
  "reasonCode" VARCHAR(100),
  "summary" TEXT,
  "employerTrustProfileId" TEXT,
  "candidateTrustProfileId" TEXT,
  "jobId" TEXT,
  "applicationId" TEXT,
  "threadId" TEXT,
  "reportId" TEXT,
  "artifactId" TEXT,
  "assignedAdminId" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrustCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TrustCaseAction" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "actorId" TEXT,
  "actionType" "ModerationActionType" NOT NULL,
  "reasonCode" VARCHAR(100),
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrustCaseAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CandidateVerifiedSkill" (
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

CREATE TABLE IF NOT EXISTS "CandidatePartnerMarker" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "EmployerTrustProfile_employerId_key"
  ON "EmployerTrustProfile"("employerId");
CREATE INDEX IF NOT EXISTS "EmployerTrustProfile_verificationLevel_idx"
  ON "EmployerTrustProfile"("verificationLevel");
CREATE INDEX IF NOT EXISTS "EmployerTrustProfile_riskLevel_riskScore_idx"
  ON "EmployerTrustProfile"("riskLevel", "riskScore");
CREATE INDEX IF NOT EXISTS "EmployerTrustProfile_postingEligibility_idx"
  ON "EmployerTrustProfile"("postingEligibility");

CREATE UNIQUE INDEX IF NOT EXISTS "CandidateTrustProfile_userId_key"
  ON "CandidateTrustProfile"("userId");
CREATE INDEX IF NOT EXISTS "CandidateTrustProfile_verificationLevel_idx"
  ON "CandidateTrustProfile"("verificationLevel");
CREATE INDEX IF NOT EXISTS "CandidateTrustProfile_riskLevel_riskScore_idx"
  ON "CandidateTrustProfile"("riskLevel", "riskScore");
CREATE INDEX IF NOT EXISTS "CandidateTrustProfile_premiumFilterEligible_idx"
  ON "CandidateTrustProfile"("premiumFilterEligible");

CREATE INDEX IF NOT EXISTS "PhoneVerificationChallenge_candidateTrustProfileId_createdAt_idx"
  ON "PhoneVerificationChallenge"("candidateTrustProfileId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PhoneVerificationChallenge_phoneNumber_status_idx"
  ON "PhoneVerificationChallenge"("phoneNumber", "status");

CREATE INDEX IF NOT EXISTS "VerificationArtifact_type_status_idx"
  ON "VerificationArtifact"("type", "status");
CREATE INDEX IF NOT EXISTS "VerificationArtifact_userId_submittedAt_idx"
  ON "VerificationArtifact"("userId", "submittedAt" DESC);
CREATE INDEX IF NOT EXISTS "VerificationArtifact_employerId_submittedAt_idx"
  ON "VerificationArtifact"("employerId", "submittedAt" DESC);

CREATE INDEX IF NOT EXISTS "TrustRiskEvent_entityType_createdAt_idx"
  ON "TrustRiskEvent"("entityType", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "TrustRiskEvent_riskLevel_createdAt_idx"
  ON "TrustRiskEvent"("riskLevel", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "TrustRiskEvent_userId_createdAt_idx"
  ON "TrustRiskEvent"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "TrustRiskEvent_employerId_createdAt_idx"
  ON "TrustRiskEvent"("employerId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "AbuseReport_status_createdAt_idx"
  ON "AbuseReport"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AbuseReport_reason_createdAt_idx"
  ON "AbuseReport"("reason", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AbuseReport_reporterUserId_createdAt_idx"
  ON "AbuseReport"("reporterUserId", "createdAt" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "TrustCase_reportId_key"
  ON "TrustCase"("reportId");
CREATE UNIQUE INDEX IF NOT EXISTS "TrustCase_artifactId_key"
  ON "TrustCase"("artifactId");
CREATE INDEX IF NOT EXISTS "TrustCase_status_priority_createdAt_idx"
  ON "TrustCase"("status", "priority", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "TrustCase_assignedAdminId_status_idx"
  ON "TrustCase"("assignedAdminId", "status");

CREATE INDEX IF NOT EXISTS "TrustCaseAction_caseId_createdAt_idx"
  ON "TrustCaseAction"("caseId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "TrustCaseAction_actionType_createdAt_idx"
  ON "TrustCaseAction"("actionType", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "CandidateVerifiedSkill_userId_status_verifiedAt_idx"
  ON "CandidateVerifiedSkill"("userId", "status", "verifiedAt" DESC);
CREATE INDEX IF NOT EXISTS "CandidateVerifiedSkill_skillName_status_idx"
  ON "CandidateVerifiedSkill"("skillName", "status");
CREATE INDEX IF NOT EXISTS "CandidateVerifiedSkill_method_status_idx"
  ON "CandidateVerifiedSkill"("method", "status");

CREATE INDEX IF NOT EXISTS "CandidatePartnerMarker_userId_status_issuedAt_idx"
  ON "CandidatePartnerMarker"("userId", "status", "issuedAt" DESC);
CREATE INDEX IF NOT EXISTS "CandidatePartnerMarker_partnerId_status_idx"
  ON "CandidatePartnerMarker"("partnerId", "status");
CREATE INDEX IF NOT EXISTS "CandidatePartnerMarker_markerType_status_idx"
  ON "CandidatePartnerMarker"("markerType", "status");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'EmployerTrustProfile_employerId_fkey'
  ) THEN
    ALTER TABLE "EmployerTrustProfile"
      ADD CONSTRAINT "EmployerTrustProfile_employerId_fkey"
      FOREIGN KEY ("employerId") REFERENCES "Employer"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidateTrustProfile_userId_fkey'
  ) THEN
    ALTER TABLE "CandidateTrustProfile"
      ADD CONSTRAINT "CandidateTrustProfile_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PhoneVerificationChallenge_candidateTrustProfileId_fkey'
  ) THEN
    ALTER TABLE "PhoneVerificationChallenge"
      ADD CONSTRAINT "PhoneVerificationChallenge_candidateTrustProfileId_fkey"
      FOREIGN KEY ("candidateTrustProfileId") REFERENCES "CandidateTrustProfile"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'VerificationArtifact_userId_fkey'
  ) THEN
    ALTER TABLE "VerificationArtifact"
      ADD CONSTRAINT "VerificationArtifact_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'VerificationArtifact_employerId_fkey'
  ) THEN
    ALTER TABLE "VerificationArtifact"
      ADD CONSTRAINT "VerificationArtifact_employerId_fkey"
      FOREIGN KEY ("employerId") REFERENCES "Employer"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'VerificationArtifact_reviewerId_fkey'
  ) THEN
    ALTER TABLE "VerificationArtifact"
      ADD CONSTRAINT "VerificationArtifact_reviewerId_fkey"
      FOREIGN KEY ("reviewerId") REFERENCES "User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustRiskEvent_userId_fkey'
  ) THEN
    ALTER TABLE "TrustRiskEvent"
      ADD CONSTRAINT "TrustRiskEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustRiskEvent_employerId_fkey'
  ) THEN
    ALTER TABLE "TrustRiskEvent"
      ADD CONSTRAINT "TrustRiskEvent_employerId_fkey"
      FOREIGN KEY ("employerId") REFERENCES "Employer"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustRiskEvent_jobId_fkey'
  ) THEN
    ALTER TABLE "TrustRiskEvent"
      ADD CONSTRAINT "TrustRiskEvent_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustRiskEvent_applicationId_fkey'
  ) THEN
    ALTER TABLE "TrustRiskEvent"
      ADD CONSTRAINT "TrustRiskEvent_applicationId_fkey"
      FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustRiskEvent_threadId_fkey'
  ) THEN
    ALTER TABLE "TrustRiskEvent"
      ADD CONSTRAINT "TrustRiskEvent_threadId_fkey"
      FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AbuseReport_reporterUserId_fkey'
  ) THEN
    ALTER TABLE "AbuseReport"
      ADD CONSTRAINT "AbuseReport_reporterUserId_fkey"
      FOREIGN KEY ("reporterUserId") REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AbuseReport_reportedUserId_fkey'
  ) THEN
    ALTER TABLE "AbuseReport"
      ADD CONSTRAINT "AbuseReport_reportedUserId_fkey"
      FOREIGN KEY ("reportedUserId") REFERENCES "User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AbuseReport_employerId_fkey'
  ) THEN
    ALTER TABLE "AbuseReport"
      ADD CONSTRAINT "AbuseReport_employerId_fkey"
      FOREIGN KEY ("employerId") REFERENCES "Employer"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AbuseReport_targetJobId_fkey'
  ) THEN
    ALTER TABLE "AbuseReport"
      ADD CONSTRAINT "AbuseReport_targetJobId_fkey"
      FOREIGN KEY ("targetJobId") REFERENCES "Job"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AbuseReport_targetApplicationId_fkey'
  ) THEN
    ALTER TABLE "AbuseReport"
      ADD CONSTRAINT "AbuseReport_targetApplicationId_fkey"
      FOREIGN KEY ("targetApplicationId") REFERENCES "Application"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AbuseReport_targetThreadId_fkey'
  ) THEN
    ALTER TABLE "AbuseReport"
      ADD CONSTRAINT "AbuseReport_targetThreadId_fkey"
      FOREIGN KEY ("targetThreadId") REFERENCES "MessageThread"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AbuseReport_assignedAdminId_fkey'
  ) THEN
    ALTER TABLE "AbuseReport"
      ADD CONSTRAINT "AbuseReport_assignedAdminId_fkey"
      FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustCase_employerTrustProfileId_fkey'
  ) THEN
    ALTER TABLE "TrustCase"
      ADD CONSTRAINT "TrustCase_employerTrustProfileId_fkey"
      FOREIGN KEY ("employerTrustProfileId") REFERENCES "EmployerTrustProfile"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustCase_candidateTrustProfileId_fkey'
  ) THEN
    ALTER TABLE "TrustCase"
      ADD CONSTRAINT "TrustCase_candidateTrustProfileId_fkey"
      FOREIGN KEY ("candidateTrustProfileId") REFERENCES "CandidateTrustProfile"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustCase_jobId_fkey'
  ) THEN
    ALTER TABLE "TrustCase"
      ADD CONSTRAINT "TrustCase_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustCase_applicationId_fkey'
  ) THEN
    ALTER TABLE "TrustCase"
      ADD CONSTRAINT "TrustCase_applicationId_fkey"
      FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustCase_threadId_fkey'
  ) THEN
    ALTER TABLE "TrustCase"
      ADD CONSTRAINT "TrustCase_threadId_fkey"
      FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustCase_reportId_fkey'
  ) THEN
    ALTER TABLE "TrustCase"
      ADD CONSTRAINT "TrustCase_reportId_fkey"
      FOREIGN KEY ("reportId") REFERENCES "AbuseReport"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustCase_artifactId_fkey'
  ) THEN
    ALTER TABLE "TrustCase"
      ADD CONSTRAINT "TrustCase_artifactId_fkey"
      FOREIGN KEY ("artifactId") REFERENCES "VerificationArtifact"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustCase_assignedAdminId_fkey'
  ) THEN
    ALTER TABLE "TrustCase"
      ADD CONSTRAINT "TrustCase_assignedAdminId_fkey"
      FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustCaseAction_caseId_fkey'
  ) THEN
    ALTER TABLE "TrustCaseAction"
      ADD CONSTRAINT "TrustCaseAction_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "TrustCase"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TrustCaseAction_actorId_fkey'
  ) THEN
    ALTER TABLE "TrustCaseAction"
      ADD CONSTRAINT "TrustCaseAction_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidateVerifiedSkill_userId_fkey'
  ) THEN
    ALTER TABLE "CandidateVerifiedSkill"
      ADD CONSTRAINT "CandidateVerifiedSkill_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidateVerifiedSkill_artifactId_fkey'
  ) THEN
    ALTER TABLE "CandidateVerifiedSkill"
      ADD CONSTRAINT "CandidateVerifiedSkill_artifactId_fkey"
      FOREIGN KEY ("artifactId") REFERENCES "VerificationArtifact"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidateVerifiedSkill_assessmentId_fkey'
  ) THEN
    ALTER TABLE "CandidateVerifiedSkill"
      ADD CONSTRAINT "CandidateVerifiedSkill_assessmentId_fkey"
      FOREIGN KEY ("assessmentId") REFERENCES "SkillAssessment"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidateVerifiedSkill_partnerId_fkey'
  ) THEN
    ALTER TABLE "CandidateVerifiedSkill"
      ADD CONSTRAINT "CandidateVerifiedSkill_partnerId_fkey"
      FOREIGN KEY ("partnerId") REFERENCES "UniversityPartner"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidateVerifiedSkill_partnerRecordId_fkey'
  ) THEN
    ALTER TABLE "CandidateVerifiedSkill"
      ADD CONSTRAINT "CandidateVerifiedSkill_partnerRecordId_fkey"
      FOREIGN KEY ("partnerRecordId") REFERENCES "UniversityPartnerRecord"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidateVerifiedSkill_reviewerId_fkey'
  ) THEN
    ALTER TABLE "CandidateVerifiedSkill"
      ADD CONSTRAINT "CandidateVerifiedSkill_reviewerId_fkey"
      FOREIGN KEY ("reviewerId") REFERENCES "User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidatePartnerMarker_userId_fkey'
  ) THEN
    ALTER TABLE "CandidatePartnerMarker"
      ADD CONSTRAINT "CandidatePartnerMarker_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidatePartnerMarker_partnerId_fkey'
  ) THEN
    ALTER TABLE "CandidatePartnerMarker"
      ADD CONSTRAINT "CandidatePartnerMarker_partnerId_fkey"
      FOREIGN KEY ("partnerId") REFERENCES "UniversityPartner"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidatePartnerMarker_partnerRecordId_fkey'
  ) THEN
    ALTER TABLE "CandidatePartnerMarker"
      ADD CONSTRAINT "CandidatePartnerMarker_partnerRecordId_fkey"
      FOREIGN KEY ("partnerRecordId") REFERENCES "UniversityPartnerRecord"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CandidatePartnerMarker_reviewerId_fkey'
  ) THEN
    ALTER TABLE "CandidatePartnerMarker"
      ADD CONSTRAINT "CandidatePartnerMarker_reviewerId_fkey"
      FOREIGN KEY ("reviewerId") REFERENCES "User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
