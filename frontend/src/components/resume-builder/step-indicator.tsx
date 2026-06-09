"use client";

import type { ReactNode } from "react";

interface StepIndicatorProps {
  step: number;
  total: number;
  labels: readonly string[];
}

export function StepIndicator({ step, total, labels }: StepIndicatorProps): ReactNode {
  return (
    <ol
      role="list"
      aria-label="Resume builder progress"
      className="flex flex-wrap items-center gap-2 sm:gap-3"
    >
      {labels.slice(0, total).map((label, idx) => {
        const n = idx + 1;
        const isActive = n === step;
        const isDone = n < step;
        const stateClass = isActive
          ? "bg-blue-600 text-white border-blue-600"
          : isDone
            ? "bg-emerald-50 text-emerald-900 border-emerald-300"
            : "bg-white text-gray-500 border-gray-200";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              data-testid={`resume-step-${n}`}
              data-active={isActive ? "true" : undefined}
              aria-current={isActive ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${stateClass}`}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-semibold">
                {isDone ? "✓" : n}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </span>
            {n < total && <span aria-hidden className="h-px w-4 bg-gray-200" />}
          </li>
        );
      })}
    </ol>
  );
}
