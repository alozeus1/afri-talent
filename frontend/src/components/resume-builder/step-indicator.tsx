"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { useCandidateT } from "@/lib/i18n/candidate-messages";

interface StepIndicatorProps {
  step: number;
  total: number;
  /** Already-translated step labels. */
  labels: readonly string[];
}

export function StepIndicator({ step, total, labels }: StepIndicatorProps): ReactNode {
  const t = useCandidateT();
  return (
    <div>
      <p className="mb-3 text-xs font-medium text-fg-muted sm:hidden">
        {t("rb.stepOf", { n: step, total })} · {labels[step - 1]}
      </p>
      <ol aria-label={t("rb.progress")} className="flex flex-wrap items-center gap-2 sm:gap-3">
        {labels.slice(0, total).map((label, idx) => {
          const n = idx + 1;
          const isActive = n === step;
          const isDone = n < step;
          const stateClass = isActive
            ? "border-primary bg-primary text-primary-fg"
            : isDone
              ? "border-success-line bg-success-soft text-success"
              : "border-line bg-surface text-fg-muted";
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                data-testid={`resume-step-${n}`}
                data-active={isActive ? "true" : undefined}
                aria-current={isActive ? "step" : undefined}
                className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium sm:px-3 ${stateClass}`}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/5 text-[10px] font-semibold dark:bg-white/10"
                >
                  {isDone ? <Check className="h-3 w-3" /> : n}
                </span>
                <span className="sr-only sm:not-sr-only">{label}</span>
              </span>
              {n < total && <span aria-hidden="true" className="h-px w-3 bg-line-strong sm:w-4" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
