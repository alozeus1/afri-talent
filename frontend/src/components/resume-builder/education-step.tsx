"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { candidateFieldClass, candidateLabelClass } from "@/components/candidate/candidate-ui";
import { useCandidateT } from "@/lib/i18n/candidate-messages";

export interface EduEntry {
  institution: string;
  degree: string;
  period: string;
}

export interface EducationStepValue {
  educationHistory: EduEntry[];
  skills: string;
  certifications: string;
}

interface EducationStepProps {
  value: EducationStepValue;
  onChange: (patch: Partial<EducationStepValue>) => void;
  isActive: boolean;
}

const emptyEdu: EduEntry = { institution: "", degree: "", period: "" };

export function EducationStep({ value, onChange, isActive }: EducationStepProps): ReactNode {
  const t = useCandidateT();
  const id = useId();
  const skillsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive) skillsRef.current?.focus();
  }, [isActive]);

  function updateEdu(index: number, field: keyof EduEntry, fieldValue: string) {
    const next = [...value.educationHistory];
    next[index] = { ...next[index], [field]: fieldValue };
    onChange({ educationHistory: next });
  }

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor={`${id}-skills`} className={candidateLabelClass}>
          {t("rb.edu.skills")}{" "}
          <span aria-hidden="true" className="text-danger">
            *
          </span>{" "}
          <span className="font-normal text-fg-muted">{t("rb.edu.commaSeparated")}</span>
        </label>
        <input
          id={`${id}-skills`}
          ref={skillsRef}
          type="text"
          required
          value={value.skills}
          onChange={(e) => onChange({ skills: e.target.value })}
          className={candidateFieldClass}
          placeholder={t("rb.edu.skillsPlaceholder")}
          data-testid="resume-skills-input"
          aria-describedby={`${id}-skills-hint`}
        />
        <p id={`${id}-skills-hint`} className="mt-1 text-xs text-fg-muted">
          {t("rb.edu.skillsHint")}
        </p>
      </div>

      <div>
        <label htmlFor={`${id}-certs`} className={candidateLabelClass}>
          {t("rb.edu.certs")} <span className="font-normal text-fg-muted">{t("rb.edu.commaSeparated")}</span>
        </label>
        <input
          id={`${id}-certs`}
          type="text"
          value={value.certifications}
          onChange={(e) => onChange({ certifications: e.target.value })}
          className={candidateFieldClass}
          placeholder={t("rb.edu.certsPlaceholder")}
        />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg">{t("rb.edu.title")}</h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ educationHistory: [...value.educationHistory, { ...emptyEdu }] })}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("rb.edu.add")}
          </Button>
        </div>
        {value.educationHistory.map((entry, i) => (
          <fieldset key={i} className="mb-3 grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface-sunken p-4 sm:grid-cols-3">
            <legend className="sr-only">{t("rb.edu.entry", { n: i + 1 })}</legend>
            <div>
              <label htmlFor={`${id}-${i}-inst`} className={candidateLabelClass}>
                {t("rb.edu.institution")}
              </label>
              <input
                id={`${id}-${i}-inst`}
                type="text"
                value={entry.institution}
                onChange={(e) => updateEdu(i, "institution", e.target.value)}
                className={candidateFieldClass}
              />
            </div>
            <div>
              <label htmlFor={`${id}-${i}-degree`} className={candidateLabelClass}>
                {t("rb.edu.degree")}
              </label>
              <input
                id={`${id}-${i}-degree`}
                type="text"
                value={entry.degree}
                onChange={(e) => updateEdu(i, "degree", e.target.value)}
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
                placeholder={t("rb.edu.periodPlaceholder")}
                value={entry.period}
                onChange={(e) => updateEdu(i, "period", e.target.value)}
                className={candidateFieldClass}
              />
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

export function educationStepValid(value: EducationStepValue): boolean {
  return value.skills
    .split(",")
    .map((s) => s.trim())
    .some((s) => s.length > 0);
}
