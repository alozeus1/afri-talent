"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { candidateFieldClass, candidateLabelClass } from "@/components/candidate/candidate-ui";
import { useCandidateT } from "@/lib/i18n/candidate-messages";

export interface BasicsValue {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  targetRole: string;
  yearsExperience: string;
}

interface BasicsStepProps {
  value: BasicsValue;
  onChange: (patch: Partial<BasicsValue>) => void;
  isActive: boolean;
}

export function BasicsStep({ value, onChange, isActive }: BasicsStepProps): ReactNode {
  const t = useCandidateT();
  const id = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive) firstFieldRef.current?.focus();
  }, [isActive]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id={`${id}-name`} label={t("rb.basics.fullName")} required>
          <input
            id={`${id}-name`}
            ref={firstFieldRef}
            type="text"
            autoComplete="name"
            required
            value={value.fullName}
            onChange={(e) => onChange({ fullName: e.target.value })}
            className={candidateFieldClass}
            placeholder={t("rb.basics.fullNamePlaceholder")}
          />
        </Field>
        <Field id={`${id}-email`} label={t("rb.basics.email")} required>
          <input
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            required
            value={value.email}
            onChange={(e) => onChange({ email: e.target.value })}
            className={candidateFieldClass}
            placeholder={t("rb.basics.emailPlaceholder")}
          />
        </Field>
        <Field id={`${id}-phone`} label={t("rb.basics.phone")}>
          <input
            id={`${id}-phone`}
            type="tel"
            autoComplete="tel"
            dir="ltr"
            value={value.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            className={candidateFieldClass}
            placeholder="+234 800 000 0000"
          />
        </Field>
        <Field id={`${id}-location`} label={t("rb.basics.location")}>
          <input
            id={`${id}-location`}
            type="text"
            value={value.location}
            onChange={(e) => onChange({ location: e.target.value })}
            className={candidateFieldClass}
            placeholder={t("rb.basics.locationPlaceholder")}
          />
        </Field>
        <Field id={`${id}-role`} label={t("rb.basics.targetRole")} required>
          <input
            id={`${id}-role`}
            type="text"
            required
            value={value.targetRole}
            onChange={(e) => onChange({ targetRole: e.target.value })}
            className={candidateFieldClass}
            placeholder={t("rb.basics.targetRolePlaceholder")}
          />
        </Field>
        <Field id={`${id}-years`} label={t("rb.basics.years")} required>
          <input
            id={`${id}-years`}
            type="number"
            min={0}
            max={50}
            required
            value={value.yearsExperience}
            onChange={(e) => onChange({ yearsExperience: e.target.value })}
            className={candidateFieldClass}
          />
        </Field>
      </div>
      <p className="text-xs text-fg-muted">{t("rb.basics.required")}</p>
    </div>
  );
}

function Field({ id, label, required, children }: { id: string; label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={candidateLabelClass}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

export function basicsStepValid(value: BasicsValue): boolean {
  return (
    value.fullName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) &&
    value.targetRole.trim().length > 0 &&
    Number.isFinite(Number(value.yearsExperience)) &&
    Number(value.yearsExperience) >= 0
  );
}
