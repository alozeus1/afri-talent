export type SalaryPeriod = "yearly" | "monthly" | "weekly" | "daily" | "hourly";

const PERIOD_ALIASES: Record<string, SalaryPeriod> = {
  annual: "yearly",
  annually: "yearly",
  year: "yearly",
  yearly: "yearly",
  month: "monthly",
  monthly: "monthly",
  week: "weekly",
  weekly: "weekly",
  day: "daily",
  daily: "daily",
  hour: "hourly",
  hourly: "hourly",
};

const PERIOD_LABELS: Record<SalaryPeriod, string> = {
  yearly: "year",
  monthly: "month",
  weekly: "week",
  daily: "day",
  hourly: "hour",
};

const PERIOD_SCHEMA_UNITS: Record<SalaryPeriod, "YEAR" | "MONTH" | "WEEK" | "DAY" | "HOUR"> = {
  yearly: "YEAR",
  monthly: "MONTH",
  weekly: "WEEK",
  daily: "DAY",
  hourly: "HOUR",
};

export function normalizeSalaryPeriod(period?: string | null): SalaryPeriod {
  if (!period) return "yearly";
  return PERIOD_ALIASES[period.toLowerCase()] ?? "yearly";
}

export function salaryPeriodLabel(period?: string | null): string {
  return PERIOD_LABELS[normalizeSalaryPeriod(period)];
}

export function salaryPeriodSchemaUnit(period?: string | null): "YEAR" | "MONTH" | "WEEK" | "DAY" | "HOUR" {
  return PERIOD_SCHEMA_UNITS[normalizeSalaryPeriod(period)];
}

/** No real annual salary is below this; such a range is an hourly/daily rate. */
const MIN_PLAUSIBLE_ANNUAL = 1000;

export type SalaryInput = {
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  salaryPeriod?: string | null;
};

/**
 * Splits a salary into the numeric range ("USD 60,000 - USD 90,000") and its
 * pay period. `period` is null when it cannot be stated honestly: an unknown
 * or yearly period on a sub-1,000 amount is never labelled "/year".
 */
export function formatSalaryParts(opts: SalaryInput): { amount: string; period: SalaryPeriod | null } | null {
  const { salaryMin, salaryMax, currency, salaryPeriod } = opts;

  if (!salaryMin && !salaryMax) return null;

  const safeCurrency = currency || "USD";
  const min = salaryMin ? `${safeCurrency} ${salaryMin.toLocaleString()}` : "";
  const max = salaryMax ? `${safeCurrency} ${salaryMax.toLocaleString()}` : "";
  const amount = min && max ? `${min} - ${max}` : min || max;

  const top = Math.max(salaryMin ?? 0, salaryMax ?? 0);
  const period = normalizeSalaryPeriod(salaryPeriod);
  if (period === "yearly" && top < MIN_PLAUSIBLE_ANNUAL) return { amount, period: null };
  return { amount, period };
}

export function formatSalaryRange(opts: SalaryInput): string | null {
  const parts = formatSalaryParts(opts);
  if (!parts) return null;
  return parts.period ? `${parts.amount}/${PERIOD_LABELS[parts.period]}` : parts.amount;
}
