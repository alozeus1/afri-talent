"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
  const skillsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive) skillsRef.current?.focus();
  }, [isActive]);

  function updateEdu(index: number, field: keyof EduEntry, fieldValue: string) {
    const next = [...value.educationHistory];
    next[index] = { ...next[index], [field]: fieldValue };
    onChange({ educationHistory: next });
  }

  function addEducation() {
    onChange({ educationHistory: [...value.educationHistory, { ...emptyEdu }] });
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Skills * <span className="text-gray-400">(comma-separated)</span>
        </label>
        <input
          ref={skillsRef}
          type="text"
          value={value.skills}
          onChange={(e) => onChange({ skills: e.target.value })}
          className={inputClass}
          placeholder="React, TypeScript, Node.js, PostgreSQL"
          data-testid="resume-skills-input"
        />
        <p className="mt-1 text-xs text-gray-500">
          List skills you can demonstrate. The AI will not invent ones you didn&apos;t mention.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Certifications <span className="text-gray-400">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={value.certifications}
          onChange={(e) => onChange({ certifications: e.target.value })}
          className={inputClass}
          placeholder="AWS Certified Developer, Google Cloud Professional"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Education</label>
          <button
            type="button"
            onClick={addEducation}
            className="text-sm text-blue-600 hover:underline"
          >
            + Add Education
          </button>
        </div>
        {value.educationHistory.map((entry, i) => (
          <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-3">
            <input
              type="text"
              placeholder="Institution"
              value={entry.institution}
              onChange={(e) => updateEdu(i, "institution", e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="Degree / Course"
              value={entry.degree}
              onChange={(e) => updateEdu(i, "degree", e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="2018 - 2022"
              value={entry.period}
              onChange={(e) => updateEdu(i, "period", e.target.value)}
              className={inputClass}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export function educationStepValid(value: EducationStepValue): boolean {
  return value.skills
    .split(",")
    .map((s) => s.trim())
    .some((s) => s.length > 0);
}
