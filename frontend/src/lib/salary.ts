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

export function formatSalaryRange(opts: {
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  salaryPeriod?: string | null;
}): string | null {
  const { salaryMin, salaryMax, currency, salaryPeriod } = opts;

  if (!salaryMin && !salaryMax) return null;

  const safeCurrency = currency || "USD";
  const min = salaryMin ? `${safeCurrency} ${salaryMin.toLocaleString()}` : "";
  const max = salaryMax ? `${safeCurrency} ${salaryMax.toLocaleString()}` : "";
  const range = min && max ? `${min} - ${max}` : min || max;

  return `${range}/${salaryPeriodLabel(salaryPeriod)}`;
}
