-- Wave 3 §4.4 — stale-check failure counter on Job.
--
-- The hourly job-stale-check worker increments this on a failed re-fetch
-- (404/410/network) and resets it to 0 on a successful re-fetch. After 3
-- consecutive failures the worker flips isExpired=true and stamps expiresAt.
--
-- Non-disruptive: column is NOT NULL with default 0 so historical rows
-- automatically count as "no failures recorded yet."

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "staleCheckFailures" INTEGER NOT NULL DEFAULT 0;
