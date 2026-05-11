-- Wave 2 of the public-launch plan: Apple Sign-In is fully removed.
-- See AFRITALENT_LAUNCH_CHECKLIST.md §3.
--
-- Postgres does not allow removing a value from an enum in place, so we
-- rename the existing type aside, create the new one with only the
-- surviving values, swap the column to the new type, and drop the old.
--
-- The DO block at the top is the safety guard required by the launch
-- plan: this migration refuses to run if any OAuthAccount rows still
-- reference APPLE. Verify upstream with:
--   SELECT count(*) FROM "OAuthAccount" WHERE provider = 'APPLE';
-- Both dev and prod should return 0 before applying.

DO $$
DECLARE
  apple_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO apple_count FROM "OAuthAccount" WHERE provider = 'APPLE';
  IF apple_count > 0 THEN
    RAISE EXCEPTION 'Cannot drop APPLE from OAuthProvider: % OAuthAccount row(s) still reference it. Migrate or remove those rows before re-running.', apple_count;
  END IF;
END $$;

ALTER TYPE "OAuthProvider" RENAME TO "OAuthProvider_old";

CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'GITHUB');

ALTER TABLE "OAuthAccount"
  ALTER COLUMN "provider" TYPE "OAuthProvider"
  USING ("provider"::text::"OAuthProvider");

DROP TYPE "OAuthProvider_old";
