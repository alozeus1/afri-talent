"use client";

import { Input } from "@/components/ui/input";
import { JOB_FIELDS, VISA_SPONSORSHIP_OPTIONS, WORKPLACE_TYPES } from "@/lib/job-options";

export interface JobMobilityValues {
  workplaceType: string;
  jobField: string;
  visaSponsorship: string;
  relocationAssistance: boolean;
  eligibleCountries: string;
}

export const EMPTY_JOB_MOBILITY: JobMobilityValues = {
  workplaceType: "",
  jobField: "",
  visaSponsorship: "UNKNOWN",
  relocationAssistance: false,
  eligibleCountries: "",
};

interface JobMobilityFieldsProps {
  values: JobMobilityValues;
  onChange: <K extends keyof JobMobilityValues>(field: K, value: JobMobilityValues[K]) => void;
}

const selectClass =
  "w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500";

/**
 * Workplace type, field, visa sponsorship, relocation and eligible countries.
 * These map onto the Remote/Hybrid, Field, Visa Sponsored and Relocation
 * search filters, so filling them in is what makes a posted job discoverable.
 */
export function JobMobilityFields({ values, onChange }: JobMobilityFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="workplaceType" className="mb-1 block text-sm font-medium text-gray-700">
            Workplace type
          </label>
          <select
            id="workplaceType"
            className={selectClass}
            value={values.workplaceType}
            onChange={(e) => onChange("workplaceType", e.target.value)}
          >
            <option value="">Not specified</option>
            {WORKPLACE_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="jobField" className="mb-1 block text-sm font-medium text-gray-700">
            Field
          </label>
          <select
            id="jobField"
            className={selectClass}
            value={values.jobField}
            onChange={(e) => onChange("jobField", e.target.value)}
          >
            <option value="">Not specified</option>
            {JOB_FIELDS.map((field) => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="visaSponsorship" className="mb-1 block text-sm font-medium text-gray-700">
            Visa sponsorship
          </label>
          <select
            id="visaSponsorship"
            className={selectClass}
            value={values.visaSponsorship}
            onChange={(e) => onChange("visaSponsorship", e.target.value)}
          >
            {VISA_SPONSORSHIP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <label
          htmlFor="relocationAssistance"
          className="flex items-center gap-3 self-end rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700"
        >
          <input
            id="relocationAssistance"
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            checked={values.relocationAssistance}
            onChange={(e) => onChange("relocationAssistance", e.target.checked)}
          />
          Relocation assistance offered
        </label>
      </div>

      <Input
        id="eligibleCountries"
        label="Eligible countries (optional, comma-separated)"
        placeholder="Nigeria, Kenya, Ghana"
        value={values.eligibleCountries}
        onChange={(e) => onChange("eligibleCountries", e.target.value)}
      />
    </div>
  );
}
