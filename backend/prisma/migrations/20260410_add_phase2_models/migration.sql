-- Migration: add_phase2_models
-- Adds 5 new models for Phase 2 database work: AtsReport, CoverLetterVersion, AutoApplyBatch, SalaryBenchmark, CareerGapSession
-- All models use cuid() for ID generation (except SalaryBenchmark which uses cuid as well)
-- Additive only — no existing tables or columns are modified

-- ── AtsReport: ATS keyword scan results for resume against job description ────────────
CREATE TABLE IF NOT EXISTS "AtsReport" (
    "id"                TEXT         NOT NULL PRIMARY KEY,
    "resumeId"          TEXT         NOT NULL,
    "jobDescriptionId"  TEXT,
    "score"             DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "missingKeywords"   TEXT[]       NOT NULL DEFAULT '{}',
    "presentKeywords"   TEXT[]       NOT NULL DEFAULT '{}',
    "formatting"        JSONB,
    "suggestions"       TEXT[]       NOT NULL DEFAULT '{}',
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AtsReport_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "UserResume"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AtsReport_resumeId_idx" ON "AtsReport"("resumeId");
CREATE INDEX IF NOT EXISTS "AtsReport_createdAt_idx" ON "AtsReport"("createdAt");

-- ── CoverLetterVersion: Cover letter version history for applications ─────────────────
CREATE TABLE IF NOT EXISTS "CoverLetterVersion" (
    "id"            TEXT         NOT NULL PRIMARY KEY,
    "candidateId"   TEXT         NOT NULL,
    "jobId"         TEXT         NOT NULL,
    "content"       TEXT         NOT NULL,
    "tone"          TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoverLetterVersion_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE CASCADE,
    CONSTRAINT "CoverLetterVersion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CoverLetterVersion_candidateId_idx" ON "CoverLetterVersion"("candidateId");
CREATE INDEX IF NOT EXISTS "CoverLetterVersion_jobId_idx" ON "CoverLetterVersion"("jobId");
CREATE INDEX IF NOT EXISTS "CoverLetterVersion_createdAt_idx" ON "CoverLetterVersion"("createdAt");

-- ── AutoApplyBatch: Bulk application batch tracking ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "AutoApplyBatch" (
    "id"            TEXT         NOT NULL PRIMARY KEY,
    "candidateId"   TEXT         NOT NULL,
    "jobFilters"    JSONB,
    "jobsTargeted"  INTEGER      NOT NULL DEFAULT 0,
    "jobsApplied"   INTEGER      NOT NULL DEFAULT 0,
    "jobsFailed"    INTEGER      NOT NULL DEFAULT 0,
    "creditsUsed"   INTEGER      NOT NULL DEFAULT 0,
    "status"        TEXT         NOT NULL DEFAULT 'queued',
    "startedAt"     TIMESTAMP(3),
    "completedAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutoApplyBatch_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AutoApplyBatch_candidateId_idx" ON "AutoApplyBatch"("candidateId");
CREATE INDEX IF NOT EXISTS "AutoApplyBatch_status_idx" ON "AutoApplyBatch"("status");
CREATE INDEX IF NOT EXISTS "AutoApplyBatch_createdAt_idx" ON "AutoApplyBatch"("createdAt");

-- ── SalaryBenchmark: African market salary data by role, location, currency ──────────
CREATE TABLE IF NOT EXISTS "SalaryBenchmark" (
    "id"            TEXT         NOT NULL PRIMARY KEY,
    "role"          TEXT         NOT NULL,
    "level"         TEXT         NOT NULL,
    "country"       TEXT         NOT NULL,
    "currency"      TEXT         NOT NULL DEFAULT 'USD',
    "salaryMin"     DOUBLE PRECISION NOT NULL,
    "salaryMedian"  DOUBLE PRECISION NOT NULL,
    "salaryMax"     DOUBLE PRECISION NOT NULL,
    "sampleSize"    INTEGER      NOT NULL DEFAULT 0,
    "lastUpdated"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source"        TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalaryBenchmark_role_level_country_currency_key" UNIQUE ("role", "level", "country", "currency")
);

CREATE INDEX IF NOT EXISTS "SalaryBenchmark_country_idx" ON "SalaryBenchmark"("country");
CREATE INDEX IF NOT EXISTS "SalaryBenchmark_role_idx" ON "SalaryBenchmark"("role");

-- ── CareerGapSession: Career gap analysis and reframing ──────────────────────────────
CREATE TABLE IF NOT EXISTS "CareerGapSession" (
    "id"            TEXT         NOT NULL PRIMARY KEY,
    "candidateId"   TEXT         NOT NULL,
    "startDate"     TIMESTAMP(3) NOT NULL,
    "endDate"       TIMESTAMP(3) NOT NULL,
    "reason"        TEXT,
    "analysis"      TEXT         NOT NULL,
    "reframing"     TEXT         NOT NULL,
    "talkingPoints" TEXT[]       NOT NULL DEFAULT '{}',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CareerGapSession_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CareerGapSession_candidateId_idx" ON "CareerGapSession"("candidateId");
CREATE INDEX IF NOT EXISTS "CareerGapSession_createdAt_idx" ON "CareerGapSession"("createdAt");
