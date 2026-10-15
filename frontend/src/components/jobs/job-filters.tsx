"use client";

import { Input } from "@/components/ui/input";
import { useState } from "react";
import { CheckCircle2, Check, SlidersHorizontal } from "lucide-react";
import { JOB_FIELDS, WORKPLACE_TYPES } from "@/lib/job-options";
import { usePublicT } from "@/lib/i18n/public-messages";
import { usePublicLabel } from "@/lib/i18n/public-labels";

const SELECT_CLASS =
  "w-full rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-fg shadow-xs focus:outline-none focus:ring-2 focus:ring-focus";
const chipClass = (active: boolean, activeClass: string) =>
  `flex shrink-0 items-center whitespace-nowrap justify-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
    active ? activeClass : "border-line-strong bg-surface-raised text-fg-secondary hover:border-primary hover:text-fg"
  }`;

interface JobFiltersProps {
  search: string;
  location: string;
  type: string;
  jobField: string;
  workplaceType: string;
  seniority: string;
  visaSponsorship: string;
  relocationAssistance: string;
  hiresFromAfrica: string;
  remote: string;
  onSearchChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onJobFieldChange: (value: string) => void;
  onWorkplaceTypeChange: (value: string) => void;
  onSeniorityChange: (value: string) => void;
  onVisaSponsorshipChange: (value: string) => void;
  onRelocationChange: (value: string) => void;
  onHiresFromAfricaChange: (value: string) => void;
  onRemoteChange: (value: string) => void;
  onClear: () => void;
}

const jobTypes = ["Full-time", "Part-time", "Contract", "Freelance", "Internship"];
const seniorityLevels = ["Junior", "Mid-level", "Senior", "Lead", "Executive"];
const jobFields = JOB_FIELDS;
const workplaceTypes = WORKPLACE_TYPES;

export function JobFilters({
  search,
  location,
  type,
  jobField,
  workplaceType,
  seniority,
  visaSponsorship,
  relocationAssistance,
  hiresFromAfrica,
  remote,
  onSearchChange,
  onLocationChange,
  onTypeChange,
  onJobFieldChange,
  onWorkplaceTypeChange,
  onSeniorityChange,
  onVisaSponsorshipChange,
  onRelocationChange,
  onHiresFromAfricaChange,
  onRemoteChange,
  onClear,
}: JobFiltersProps) {
  const tp = usePublicT();
  const label = usePublicLabel();
  const hasFilters = search || location || type || jobField || workplaceType || seniority || visaSponsorship || relocationAssistance || hiresFromAfrica || remote;
  // On phones the four dropdowns fold behind "More filters" so results stay
  // above the fold; from md up they are always visible.
  const [showMore, setShowMore] = useState(false);
  const activeSelects = [type, jobField, workplaceType, seniority].filter(Boolean).length;
  const selectVisibility = showMore ? "" : "hidden md:block";

  return (
    <div className="surface-panel-strong gloss-card mb-4 rounded-2xl p-4 md:mb-6 md:rounded-[2rem] md:p-6">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-4 lg:grid-cols-4">
        <div className="relative">
          <Input
            type="search"
            inputMode="search"
            autoComplete="off"
            aria-label={tp("discover.filters.searchLabel")}
            placeholder={tp("discover.filters.searchPlaceholder")}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className={search.length > 0 ? "border-emerald-500 focus:ring-focus pe-10" : ""}
          />
          {search.length > 0 && (
            <CheckCircle2 aria-hidden="true" className="absolute end-3 top-[14px] w-5 h-5 text-emerald-500 pointer-events-none" />
          )}
        </div>
        <div className="relative">
          <Input
            inputMode="text"
            autoComplete="country-name"
            aria-label={tp("discover.filters.locationLabel")}
            placeholder={tp("discover.filters.locationPlaceholder")}
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            className={location.length > 0 ? "border-emerald-500 focus:ring-focus pe-10" : ""}
          />
          {location.length > 0 && (
            <CheckCircle2 aria-hidden="true" className="absolute end-3 top-[14px] w-5 h-5 text-emerald-500 pointer-events-none" />
          )}
        </div>
        <select
          className={`${SELECT_CLASS} ${selectVisibility}`}
          aria-label={tp("discover.filters.typeLabel")}
          value={type}
          onChange={(e) => onTypeChange(e.target.value)}
        >
          <option value="">{tp("discover.filters.allTypes")}</option>
          {jobTypes.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </select>
        <select
          className={`${SELECT_CLASS} ${selectVisibility}`}
          aria-label={tp("discover.filters.fieldLabel")}
          value={jobField}
          onChange={(e) => onJobFieldChange(e.target.value)}
        >
          <option value="">{tp("discover.filters.allFields")}</option>
          {jobFields.map((field) => (
            <option key={field} value={field}>
              {label(field)}
            </option>
          ))}
        </select>
        <select
          className={`${SELECT_CLASS} ${selectVisibility}`}
          aria-label={tp("discover.filters.workplaceLabel")}
          value={workplaceType}
          onChange={(e) => onWorkplaceTypeChange(e.target.value)}
        >
          <option value="">{tp("discover.filters.allWorkplaces")}</option>
          {workplaceTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {label(option.label)}
            </option>
          ))}
        </select>
        <select
          className={`${SELECT_CLASS} ${selectVisibility}`}
          aria-label={tp("discover.filters.seniorityLabel")}
          value={seniority}
          onChange={(e) => onSeniorityChange(e.target.value)}
        >
          <option value="">{tp("discover.filters.allLevels")}</option>
          {seniorityLevels.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>
      <div className="hide-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:mt-5 md:flex-wrap md:overflow-visible md:px-0">
        <button
          type="button"
          onClick={() => setShowMore((value) => !value)}
          aria-expanded={showMore}
          className={`md:hidden ${chipClass(showMore, "border-primary bg-primary-soft text-primary-text")}`}
        >
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          {tp("discover.filters.more")}
          {activeSelects > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs font-bold tabular-nums text-primary-fg">{activeSelects}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onRemoteChange(remote ? "" : "true")}
          aria-pressed={Boolean(remote)}
          aria-label={tp("discover.filters.remoteToggle")}
          className={chipClass(Boolean(remote), "border-emerald-600 bg-emerald-600 text-white shadow-[0_12px_30px_rgba(15,143,120,0.24)]")}
        >
          {remote && <Check aria-hidden="true" className="w-4 h-4" />}
          {tp("discover.enum.remote")}
        </button>
        <button
          type="button"
          onClick={() => onVisaSponsorshipChange(visaSponsorship ? "" : "YES")}
          aria-pressed={Boolean(visaSponsorship)}
          aria-label={tp("discover.filters.visaToggle")}
          className={chipClass(Boolean(visaSponsorship), "border-blue-600 bg-blue-600 text-white shadow-[0_12px_30px_rgba(37,99,235,0.22)]")}
        >
          {visaSponsorship && <Check aria-hidden="true" className="w-4 h-4" />}
          {tp("discover.card.visa")}
        </button>
        <button
          type="button"
          onClick={() => onRelocationChange(relocationAssistance ? "" : "true")}
          aria-pressed={Boolean(relocationAssistance)}
          aria-label={tp("discover.filters.relocationToggle")}
          className={chipClass(Boolean(relocationAssistance), "border-purple-600 bg-purple-600 text-white shadow-[0_12px_30px_rgba(147,51,234,0.22)]")}
        >
          {relocationAssistance && <Check aria-hidden="true" className="w-4 h-4" />}
          {tp("discover.card.relocation")}
        </button>
        <button
          type="button"
          onClick={() => onHiresFromAfricaChange(hiresFromAfrica ? "" : "true")}
          aria-pressed={Boolean(hiresFromAfrica)}
          aria-label={tp("discover.filters.africaToggle")}
          className={chipClass(Boolean(hiresFromAfrica), "border-amber-700 bg-amber-700 text-white shadow-[0_12px_30px_rgba(217,119,6,0.22)]")}
        >
          {hiresFromAfrica && <Check aria-hidden="true" className="w-4 h-4" />}
          {tp("discover.badge.hiresFromAfrica")}
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {tp("discover.filters.clear")}
          </button>
        )}
      </div>
    </div>
  );
}
