DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'SupportedLocale'
      AND e.enumlabel = 'ES'
  ) THEN
    ALTER TYPE "SupportedLocale" ADD VALUE 'ES';
  END IF;
END $$;
