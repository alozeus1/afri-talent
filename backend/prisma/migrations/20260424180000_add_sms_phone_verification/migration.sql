-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserPhoneOtpStatus') THEN
    CREATE TYPE "UserPhoneOtpStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'CONSUMED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SmsDeliveryStatus') THEN
    CREATE TYPE "SmsDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');
  END IF;
END $$;

-- AlterTable: NotificationPreference (add SMS / security alert flags)
ALTER TABLE "NotificationPreference"
  ADD COLUMN IF NOT EXISTS "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "securityAlerts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: UserPhoneOtp
CREATE TABLE IF NOT EXISTS "UserPhoneOtp" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phoneNumber" VARCHAR(30) NOT NULL,
  "otpHash" VARCHAR(128) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "status" "UserPhoneOtpStatus" NOT NULL DEFAULT 'PENDING',
  "consumedAt" TIMESTAMP(3),
  "ipAddress" VARCHAR(45),
  "userAgent" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserPhoneOtp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserPhoneOtp_userId_createdAt_idx" ON "UserPhoneOtp" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "UserPhoneOtp_status_expiresAt_idx" ON "UserPhoneOtp" ("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "UserPhoneOtp_phoneNumber_status_idx" ON "UserPhoneOtp" ("phoneNumber", "status");

ALTER TABLE "UserPhoneOtp"
  ADD CONSTRAINT "UserPhoneOtp_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: SmsDeliveryLog
CREATE TABLE IF NOT EXISTS "SmsDeliveryLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "phoneNumber" VARCHAR(30) NOT NULL,
  "provider" VARCHAR(40) NOT NULL DEFAULT 'africastalking',
  "providerMsgId" VARCHAR(120),
  "template" VARCHAR(80) NOT NULL,
  "status" "SmsDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "errorCode" VARCHAR(80),
  "errorMessage" VARCHAR(500),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SmsDeliveryLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SmsDeliveryLog_userId_createdAt_idx" ON "SmsDeliveryLog" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SmsDeliveryLog_phoneNumber_createdAt_idx" ON "SmsDeliveryLog" ("phoneNumber", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SmsDeliveryLog_status_createdAt_idx" ON "SmsDeliveryLog" ("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SmsDeliveryLog_template_createdAt_idx" ON "SmsDeliveryLog" ("template", "createdAt" DESC);

ALTER TABLE "SmsDeliveryLog"
  ADD CONSTRAINT "SmsDeliveryLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
