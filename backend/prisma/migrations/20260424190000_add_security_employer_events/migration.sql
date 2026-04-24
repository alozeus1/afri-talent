-- Phase 3 + 4: add security and employer notification enum values.
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
      WHERE enumtypid = '"NotificationType"'::regtype
        AND enumlabel = 'PASSWORD_CHANGED'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'PASSWORD_CHANGED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
      WHERE enumtypid = '"NotificationType"'::regtype
        AND enumlabel = 'EMAIL_VERIFIED'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'EMAIL_VERIFIED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
      WHERE enumtypid = '"NotificationType"'::regtype
        AND enumlabel = 'NEW_APPLICATION'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'NEW_APPLICATION';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
      WHERE enumtypid = '"NotificationType"'::regtype
        AND enumlabel = 'JOB_PUBLISHED'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'JOB_PUBLISHED';
  END IF;
END $$;
