"use client";

import { Input } from "@/components/ui/input";
import { JOB_FIELDS, VISA_SPONSORSHIP_OPTIONS, WORKPLACE_TYPES } from "@/lib/job-options";
import { useEmployerI18n } from "@/lib/i18n/employer-messages";
import { checkboxClass, controlClass, labelClass } from "./employer-ui";

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

/**
 * Workplace type, field, visa sponsorship, relocation and eligible countries.
 * These map onto the Remote/Hybrid, Field, Visa Sponsored and Relocation
 * search filters, so filling them in is what makes a posted job discoverable.
 * Option values stay in English (they are the stored filter values); only
 * their labels are translated.
 */
export function JobMobilityFields({ values, onChange }: JobMobilityFieldsProps) {
  const { t, tv } = useEmployerI18n();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="workplaceType" className={labelClass}>
            {t("mobility.workplaceType")}
          </label>
          <select
            id="workplaceType"
            className={controlClass}
            value={values.workplaceType}
            onChange={(e) => onChange("workplaceType", e.target.value)}
          >
            <option value="">{t("common.notSpecified")}</option>
            {WORKPLACE_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{tv("opt.workplace", option.value)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="jobField" className={labelClass}>
            {t("mobility.field")}
          </label>
          <select
            id="jobField"
            className={controlClass}
            value={values.jobField}
            onChange={(e) => onChange("jobField", e.target.value)}
          >
            <option value="">{t("common.notSpecified")}</option>
            {JOB_FIELDS.map((field) => (
              <option key={field} value={field}>{tv("opt.field", field)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="visaSponsorship" className={labelClass}>
            {t("mobility.visa")}
          </label>
          <select
            id="visaSponsorship"
            className={controlClass}
            value={values.visaSponsorship}
            onChange={(e) => onChange("visaSponsorship", e.target.value)}
          >
            {VISA_SPONSORSHIP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{tv("opt.visa", option.value)}</option>
            ))}
          </select>
        </div>
        <label
          htmlFor="relocationAssistance"
          className="flex cursor-pointer items-center gap-3 self-end rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-fg-secondary transition-colors hover:border-line-strong"
        >
          <input
            id="relocationAssistance"
            type="checkbox"
            className={checkboxClass}
            checked={values.relocationAssistance}
            onChange={(e) => onChange("relocationAssistance", e.target.checked)}
          />
          {t("mobility.relocation")}
        </label>
      </div>

      <Input
        id="eligibleCountries"
        label={t("mobility.countries")}
        placeholder={t("mobility.countriesPlaceholder")}
        value={values.eligibleCountries}
        onChange={(e) => onChange("eligibleCountries", e.target.value)}
      />
    </div>
  );
}
