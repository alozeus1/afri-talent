-- AlterTable: User — add phone number + verification timestamp
-- (missed from 20260424180000_add_sms_phone_verification)
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);
