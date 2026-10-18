// Stored values for the employer job forms. They are persisted as-is (and
// matched by search filters), so they stay in English; the UI translates
// their labels through the `opt.jobType.*` / `opt.seniority.*` keys.
export const JOB_TYPES = ["Full-time", "Part-time", "Contract", "Freelance", "Internship"] as const;
export const SENIORITY_LEVELS = ["Junior", "Mid-level", "Senior", "Lead", "Executive"] as const;
export const CURRENCIES = ["USD", "EUR", "GBP", "NGN", "KES", "ZAR", "GHS", "EGP", "MAD"] as const;
// Job.salaryPeriod enum. Without it an hourly contract rate renders as "/year".
export const SALARY_PERIODS = ["YEARLY", "MONTHLY", "DAILY", "HOURLY"] as const;
export type SalaryPeriodOption = (typeof SALARY_PERIODS)[number];
export const SALARY_PERIOD_KEYS = {
  YEARLY: "jobs.periodYearly",
  MONTHLY: "jobs.periodMonthly",
  DAILY: "jobs.periodDaily",
  HOURLY: "jobs.periodHourly",
} as const satisfies Record<SalaryPeriodOption, string>;
