"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive) firstFieldRef.current?.focus();
  }, [isActive]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Full Name *">
        <input
          ref={firstFieldRef}
          type="text"
          value={value.fullName}
          onChange={(e) => onChange({ fullName: e.target.value })}
          className={inputClass}
          placeholder="Jane Doe"
        />
      </Field>
      <Field label="Email *">
        <input
          type="email"
          value={value.email}
          onChange={(e) => onChange({ email: e.target.value })}
          className={inputClass}
          placeholder="jane@example.com"
        />
      </Field>
      <Field label="Phone">
        <input
          type="text"
          value={value.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          className={inputClass}
          placeholder="+234 800 000 0000"
        />
      </Field>
      <Field label="Location">
        <input
          type="text"
          value={value.location}
          onChange={(e) => onChange({ location: e.target.value })}
          className={inputClass}
          placeholder="Lagos, Nigeria"
        />
      </Field>
      <Field label="Target Role *">
        <input
          type="text"
          value={value.targetRole}
          onChange={(e) => onChange({ targetRole: e.target.value })}
          className={inputClass}
          placeholder="Senior Software Engineer"
        />
      </Field>
      <Field label="Years of Experience *">
        <input
          type="number"
          min={0}
          max={50}
          value={value.yearsExperience}
          onChange={(e) => onChange({ yearsExperience: e.target.value })}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
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
