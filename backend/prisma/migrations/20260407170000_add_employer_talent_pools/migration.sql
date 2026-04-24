CREATE TABLE IF NOT EXISTS "EmployerTalentPool" (
  "id" TEXT NOT NULL,
  "employerId" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployerTalentPool_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmployerTalentPoolCandidate" (
  "id" TEXT NOT NULL,
  "poolId" TEXT NOT NULL,
  "candidateUserId" TEXT NOT NULL,
  "addedByUserId" TEXT NOT NULL,
  "stage" VARCHAR(40) NOT NULL DEFAULT 'SOURCED',
  "notes" TEXT,
  "semanticScore" INTEGER,
  "trustScoreSnapshot" INTEGER,
  "mobilityScoreSnapshot" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployerTalentPoolCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployerTalentPool_employerId_name_key"
  ON "EmployerTalentPool"("employerId", "name");

CREATE INDEX IF NOT EXISTS "EmployerTalentPool_employerId_updatedAt_idx"
  ON "EmployerTalentPool"("employerId", "updatedAt" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployerTalentPoolCandidate_poolId_candidateUserId_key"
  ON "EmployerTalentPoolCandidate"("poolId", "candidateUserId");

CREATE INDEX IF NOT EXISTS "EmployerTalentPoolCandidate_candidateUserId_updatedAt_idx"
  ON "EmployerTalentPoolCandidate"("candidateUserId", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "EmployerTalentPoolCandidate_poolId_stage_updatedAt_idx"
  ON "EmployerTalentPoolCandidate"("poolId", "stage", "updatedAt" DESC);

DO $$ BEGIN
  ALTER TABLE "EmployerTalentPool"
    ADD CONSTRAINT "EmployerTalentPool_employerId_fkey"
    FOREIGN KEY ("employerId") REFERENCES "Employer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EmployerTalentPoolCandidate"
    ADD CONSTRAINT "EmployerTalentPoolCandidate_poolId_fkey"
    FOREIGN KEY ("poolId") REFERENCES "EmployerTalentPool"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EmployerTalentPoolCandidate"
    ADD CONSTRAINT "EmployerTalentPoolCandidate_candidateUserId_fkey"
    FOREIGN KEY ("candidateUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EmployerTalentPoolCandidate"
    ADD CONSTRAINT "EmployerTalentPoolCandidate_addedByUserId_fkey"
    FOREIGN KEY ("addedByUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
