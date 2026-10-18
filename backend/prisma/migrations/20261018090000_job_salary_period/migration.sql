-- Additive: pay period for Job salary ranges (hourly contract rates were
-- previously rendered as yearly salaries).
CREATE TYPE "SalaryPeriod" AS ENUM ('HOURLY', 'DAILY', 'MONTHLY', 'YEARLY');

ALTER TABLE "Job" ADD COLUMN "salaryPeriod" "SalaryPeriod";
