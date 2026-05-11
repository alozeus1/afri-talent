-- Wave 1 §2.10 — admin TOTP MFA columns + 7-day grace backfill.
--
-- Existing admins get a 7-day grace window from the deploy time. New admins
-- (created after this migration) get their grace window set on first login
-- when none is present (see backend/src/routes/auth.ts).

ALTER TABLE "User"
  ADD COLUMN "totpSecretEncrypted" TEXT,
  ADD COLUMN "totpEnrolledAt" TIMESTAMP(3),
  ADD COLUMN "totpGraceUntil" TIMESTAMP(3);

-- Backfill: every current ADMIN role or non-null adminRole gets a 7-day
-- grace window starting now. Their next admin-route attempt during the
-- grace period prompts enrolment; after expiry the gate hard-blocks.
UPDATE "User" u
SET "totpGraceUntil" = NOW() + INTERVAL '7 days'
WHERE "totpGraceUntil" IS NULL
  AND (
    u."role" = 'ADMIN'
    OR EXISTS (SELECT 1 FROM "AdminRole" ar WHERE ar."adminId" = u."id")
  );

CREATE INDEX "User_totpGraceUntil_idx" ON "User"("totpGraceUntil");
