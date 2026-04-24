-- Phase 1: unified notification service foundation
--   - Add lifecycle NotificationType enum values
--   - Soft-delete + privacy fields used by ACCOUNT_CLOSED dispatch

-- New enum values for the unified dispatcher
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCOUNT_REGISTERED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCOUNT_CLOSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SECURITY_ALERT';

-- Soft-delete window for account closure notification
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedAt"           TIMESTAMP(3);

-- Candidate-managed profile visibility (privacy controls)
ALTER TABLE "CandidateProfile"
  ADD COLUMN IF NOT EXISTS "profileVisible" BOOLEAN NOT NULL DEFAULT true;
