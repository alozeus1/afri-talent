"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { candidateFieldClass, candidateLabelClass } from "@/components/candidate/candidate-ui";
import { useCandidateT } from "@/lib/i18n/candidate-messages";

export interface WorkEntry {
  company: string;
  title: string;
  period: string;
  description: string;
}

interface ExperienceStepProps {
  value: WorkEntry[];
  onChange: (next: WorkEntry[]) => void;
  isActive: boolean;
}

const emptyWork: WorkEntry = { company: "", title: "", period: "", description: "" };

export function ExperienceStep({ value, onChange, isActive }: ExperienceStepProps): ReactNode {
  const t = useCandidateT();
  const id = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive) firstFieldRef.current?.focus();
  }, [isActive]);

  function update(index: number, field: keyof WorkEntry, fieldValue: string) {
    const next = [...value];
    next[index] = { ...next[index], [field]: fieldValue };
    onChange(next);
  }

  function removeRole(index: number) {
    if (value.length <= 1) {
      onChange([{ ...emptyWork }]);
      return;
    }
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">{t("rb.exp.title")}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...value, { ...emptyWork }])}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("rb.exp.add")}
        </Button>
      </div>
      {value.map((entry, i) => (
        <fieldset key={i} className="mb-3 space-y-3 rounded-xl border border-line bg-surface-sunken p-4">
          <legend className="sr-only">{t("rb.exp.role", { n: i + 1 })}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={`${id}-${i}-company`} className={candidateLabelClass}>
                {t("rb.exp.company")}
              </label>
              <input
                id={`${id}-${i}-company`}
                ref={i === 0 ? firstFieldRef : undefined}
                type="text"
                value={entry.company}
                onChange={(e) => update(i, "company", e.target.value)}
                className={candidateFieldClass}
              />
            </div>
            <div>
              <label htmlFor={`${id}-${i}-title`} className={candidateLabelClass}>
                {t("rb.exp.jobTitle")}
              </label>
              <input
                id={`${id}-${i}-title`}
                type="text"
                value={entry.title}
                onChange={(e) => update(i, "title", e.target.value)}
                className={candidateFieldClass}
              />
            </div>
            <div>
              <label htmlFor={`${id}-${i}-period`} className={candidateLabelClass}>
                {t("rb.exp.period")}
              </label>
              <input
                id={`${id}-${i}-period`}
                type="text"
                placeholder={t("rb.exp.periodPlaceholder")}
                value={entry.period}
                onChange={(e) => update(i, "period", e.target.value)}
                className={candidateFieldClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor={`${id}-${i}-desc`} className={candidateLabelClass}>
              {t("rb.exp.description")}
            </label>
            <textarea
              id={`${id}-${i}-desc`}
              placeholder={t("rb.exp.descriptionPlaceholder")}
              value={entry.description}
              onChange={(e) => update(i, "description", e.target.value)}
              rows={3}
              className={`${candidateFieldClass} resize-y`}
            />
          </div>
          {value.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger"
              onClick={() => removeRole(i)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t("rb.exp.remove")}
            </Button>
          )}
        </fieldset>
      ))}
      <p className="text-xs text-fg-muted">{t("rb.exp.optional")}</p>
    </div>
  );
}
