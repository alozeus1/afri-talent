"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface SummaryStepProps {
  value: string;
  onChange: (next: string) => void;
  isActive: boolean;
}

export function SummaryStep({ value, onChange, isActive }: SummaryStepProps): ReactNode {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isActive) textareaRef.current?.focus();
  }, [isActive]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-semibold">Resume safety checklist</p>
        <p className="mt-1">
          Keep every claim verifiable. AfriTalent can improve wording and structure, but it should
          not invent tools, employers, certifications, or results.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Professional Summary
        </label>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Optional — AfriTalent can draft this from your real experience if left blank."
        />
      </div>
    </div>
  );
}
