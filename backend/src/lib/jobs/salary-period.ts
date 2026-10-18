import type { SalaryPeriod } from "@prisma/client";

/**
 * Pay-period resolution for Job.salaryPeriod.
 *
 * Most aggregator feeds default an undeclared period to "yearly", so a
 * declared YEARLY is not trustworthy on its own: Himalayas contract roles
 * arrive as `60–120 USD` with no period and used to render as "/year".
 * No real annual salary is below 1,000 in any currency we ingest, so:
 *   - top of range <= HOURLY_CEILING and period unknown/yearly -> HOURLY
 *   - top of range < 1,000 otherwise unknown/yearly -> null (ambiguous;
 *     the UI then shows the range without a period suffix)
 */
const HOURLY_CEILING = 300;
const MIN_PLAUSIBLE_ANNUAL = 1000;

const ALIASES: Record<string, SalaryPeriod> = {
  hour: "HOURLY",
  hourly: "HOURLY",
  day: "DAILY",
  daily: "DAILY",
  month: "MONTHLY",
  monthly: "MONTHLY",
  year: "YEARLY",
  yearly: "YEARLY",
  annual: "YEARLY",
  annually: "YEARLY",
};

export function parseSalaryPeriod(raw: string | null | undefined): SalaryPeriod | null {
  if (!raw) return null;
  return ALIASES[raw.trim().toLowerCase()] ?? null;
}

export function resolveSalaryPeriod(input: {
  min?: number | null;
  max?: number | null;
  period?: string | null;
}): SalaryPeriod | null {
  const top = input.max ?? input.min ?? null;
  const declared = parseSalaryPeriod(input.period);
  if (top == null || top <= 0) return null;
  if ((declared === null || declared === "YEARLY") && top < MIN_PLAUSIBLE_ANNUAL) {
    return top <= HOURLY_CEILING ? "HOURLY" : null;
  }
  return declared;
}
