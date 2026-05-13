"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive) firstFieldRef.current?.focus();
  }, [isActive]);

  function update(index: number, field: keyof WorkEntry, fieldValue: string) {
    const next = [...value];
    next[index] = { ...next[index], [field]: fieldValue };
    onChange(next);
  }

  function addRole() {
    onChange([...value, { ...emptyWork }]);
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
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">Work History</label>
        <button
          type="button"
          onClick={addRole}
          className="text-sm text-blue-600 hover:underline"
        >
          + Add Role
        </button>
      </div>
      {value.map((entry, i) => (
        <div key={i} className="border border-gray-200 rounded-md p-4 space-y-3 mb-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              ref={i === 0 ? firstFieldRef : undefined}
              type="text"
              placeholder="Company"
              value={entry.company}
              onChange={(e) => update(i, "company", e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="Job Title"
              value={entry.title}
              onChange={(e) => update(i, "title", e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="2022 - Present"
              value={entry.period}
              onChange={(e) => update(i, "period", e.target.value)}
              className={inputClass}
            />
          </div>
          <textarea
            placeholder="Responsibilities and truthful achievements. Add metrics where available."
            value={entry.description}
            onChange={(e) => update(i, "description", e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {value.length > 1 && (
            <button
              type="button"
              onClick={() => removeRole(i)}
              className="text-xs text-gray-500 hover:text-red-600"
            >
              Remove this role
            </button>
          )}
        </div>
      ))}
      <p className="text-xs text-gray-500">
        Work history is optional. You can add roles later by editing your saved resume.
      </p>
    </div>
  );
}

const inputClass =
  "rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
