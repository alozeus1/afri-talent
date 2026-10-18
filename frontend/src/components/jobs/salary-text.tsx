"use client";

import { Fragment } from "react";
import { formatSalaryParts, type SalaryInput, type SalaryPeriod } from "@/lib/salary";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";

const PERIOD_KEYS: Record<SalaryPeriod, PublicMessageKey> = {
  yearly: "discover.salary.perYear",
  monthly: "discover.salary.perMonth",
  weekly: "discover.salary.perWeek",
  daily: "discover.salary.perDay",
  hourly: "discover.salary.perHour",
};

// Placeholder swapped for the isolated amount after translation, so the
// localized period text keeps its own direction (Arabic reads RTL while the
// "USD 60,000 - USD 90,000" range stays LTR and in order).
const AMOUNT_TOKEN = "\u0000amount\u0000";

/** Localized salary line with the numeric range bidi-isolated. Renders nothing without a salary. */
export function SalaryText({ salary }: { salary: SalaryInput }) {
  const tp = usePublicT();
  const parts = formatSalaryParts(salary);
  if (!parts) return null;

  const amount = (
    <bdi dir="ltr" data-testid="salary-amount">
      {parts.amount}
    </bdi>
  );
  if (!parts.period) return amount;

  const template = tp(PERIOD_KEYS[parts.period], { amount: AMOUNT_TOKEN });
  const segments = template.split(AMOUNT_TOKEN);
  return (
    <>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {index > 0 && amount}
          {segment}
        </Fragment>
      ))}
    </>
  );
}
