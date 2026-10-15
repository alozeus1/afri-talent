"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { candidateFieldClass, candidateLabelClass } from "@/components/candidate/candidate-ui";
import { useCandidateT } from "@/lib/i18n/candidate-messages";

interface SummaryStepProps {
  value: string;
  onChange: (next: string) => void;
  isActive: boolean;
}

export function SummaryStep({ value, onChange, isActive }: SummaryStepProps): ReactNode {
  const t = useCandidateT();
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isActive) textareaRef.current?.focus();
  }, [isActive]);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-xl border border-info-line bg-info-soft p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
        <div>
          <p className="font-semibold text-fg">{t("rb.sum.safetyTitle")}</p>
          <p className="mt-1 text-fg-secondary">{t("rb.sum.safetyBody")}</p>
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-summary`} className={candidateLabelClass}>
          {t("rb.sum.label")}
        </label>
        <textarea
          id={`${id}-summary`}
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          className={`${candidateFieldClass} resize-y`}
          placeholder={t("rb.sum.placeholder")}
        />
      </div>
    </div>
  );
}
