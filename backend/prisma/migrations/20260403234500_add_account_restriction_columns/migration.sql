DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountRestrictionStatus') THEN
    CREATE TYPE "AccountRestrictionStatus" AS ENUM (
      'ACTIVE',
      'LIMITED',
      'SUSPENDED'
    );
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "accountRestrictionStatus" "AccountRestrictionStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "accountRestrictionReason" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "accountRestrictedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_accountRestrictionStatus_idx"
  ON "User"("accountRestrictionStatus");
