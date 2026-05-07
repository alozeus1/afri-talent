"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Check } from "lucide-react";

interface JobFiltersProps {
  search: string;
  location: string;
  type: string;
  jobField: string;
  workplaceType: string;
  seniority: string;
  visaSponsorship: string;
  relocationAssistance: string;
  remote: string;
  onSearchChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onJobFieldChange: (value: string) => void;
  onWorkplaceTypeChange: (value: string) => void;
  onSeniorityChange: (value: string) => void;
  onVisaSponsorshipChange: (value: string) => void;
  onRelocationChange: (value: string) => void;
  onRemoteChange: (value: string) => void;
  onClear: () => void;
}

const jobTypes = ["Full-time", "Part-time", "Contract", "Freelance", "Internship"];
const seniorityLevels = ["Junior", "Mid-level", "Senior", "Lead", "Executive"];
const jobFields = [
  "Technology",
  "Healthcare",
  "Finance",
  "Accounting",
  "Sales",
  "Marketing",
  "Customer Support",
  "Operations",
  "Human Resources",
  "Legal",
  "Education",
  "Design",
  "Product",
  "Data",
  "Cybersecurity",
  "Engineering Non-Software",
  "Skilled Trades",
  "Logistics",
  "Hospitality",
  "Nonprofit",
  "Executive",
];
const workplaceTypes = [
  { label: "Remote", value: "REMOTE" },
  { label: "Hybrid", value: "HYBRID" },
  { label: "Onsite", value: "ONSITE" },
];

export function JobFilters({
  search,
  location,
  type,
  jobField,
  workplaceType,
  seniority,
  visaSponsorship,
  relocationAssistance,
  remote,
  onSearchChange,
  onLocationChange,
  onTypeChange,
  onJobFieldChange,
  onWorkplaceTypeChange,
  onSeniorityChange,
  onVisaSponsorshipChange,
  onRelocationChange,
  onRemoteChange,
  onClear,
}: JobFiltersProps) {
  const hasFilters = search || location || type || jobField || workplaceType || seniority || visaSponsorship || relocationAssistance || remote;

  return (
    <div className="surface-panel-strong gloss-card mb-8 rounded-[2rem] p-6">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">Search the market</p>
          <h2 className="font-display mt-2 text-2xl font-bold text-gray-950 dark:text-white">Find roles that match your trust, mobility, and work style.</h2>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative">
          <Input
            type="search"
            inputMode="search"
            autoComplete="off"
            aria-label="Search jobs"
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className={search.length > 0 ? "border-emerald-500 focus:ring-emerald-500 pr-10" : ""}
          />
          {search.length > 0 && (
            <CheckCircle2 className="absolute right-3 top-[14px] w-5 h-5 text-emerald-500 pointer-events-none" />
          )}
        </div>
        <div className="relative">
          <Input
            inputMode="text"
            autoComplete="country-name"
            aria-label="Filter by location"
            placeholder="Location"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            className={location.length > 0 ? "border-emerald-500 focus:ring-emerald-500 pr-10" : ""}
          />
          {location.length > 0 && (
            <CheckCircle2 className="absolute right-3 top-[14px] w-5 h-5 text-emerald-500 pointer-events-none" />
          )}
        </div>
        <select
          className="w-full rounded-2xl border border-[rgba(15,23,32,0.12)] bg-[rgba(255,255,255,0.68)] px-4 py-3 text-gray-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-[rgba(210,226,244,0.12)] dark:bg-[rgba(7,17,29,0.72)] dark:text-gray-100"
          aria-label="Filter by job type"
          aria-expanded={false}
          value={type}
          onChange={(e) => onTypeChange(e.target.value)}
        >
          <option value="">All Job Types</option>
          {jobTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="w-full rounded-2xl border border-[rgba(15,23,32,0.12)] bg-[rgba(255,255,255,0.68)] px-4 py-3 text-gray-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-[rgba(210,226,244,0.12)] dark:bg-[rgba(7,17,29,0.72)] dark:text-gray-100"
          aria-label="Filter by job field"
          aria-expanded={false}
          value={jobField}
          onChange={(e) => onJobFieldChange(e.target.value)}
        >
          <option value="">All Fields</option>
          {jobFields.map((field) => (
            <option key={field} value={field}>
              {field}
            </option>
          ))}
        </select>
        <select
          className="w-full rounded-2xl border border-[rgba(15,23,32,0.12)] bg-[rgba(255,255,255,0.68)] px-4 py-3 text-gray-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-[rgba(210,226,244,0.12)] dark:bg-[rgba(7,17,29,0.72)] dark:text-gray-100"
          aria-label="Filter by workplace type"
          aria-expanded={false}
          value={workplaceType}
          onChange={(e) => onWorkplaceTypeChange(e.target.value)}
        >
          <option value="">All Workplaces</option>
          {workplaceTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="w-full rounded-2xl border border-[rgba(15,23,32,0.12)] bg-[rgba(255,255,255,0.68)] px-4 py-3 text-gray-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-[rgba(210,226,244,0.12)] dark:bg-[rgba(7,17,29,0.72)] dark:text-gray-100"
          aria-label="Filter by seniority"
          aria-expanded={false}
          value={seniority}
          onChange={(e) => onSeniorityChange(e.target.value)}
        >
          <option value="">All Levels</option>
          {seniorityLevels.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onRemoteChange(remote ? "" : "true")}
          aria-pressed={Boolean(remote)}
          aria-label="Toggle remote only jobs"
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
            remote ? "border-emerald-600 bg-emerald-600 text-white shadow-[0_12px_30px_rgba(15,143,120,0.24)]" : "bg-white/70 text-gray-700 border-[rgba(15,23,32,0.12)] hover:border-emerald-500 dark:bg-white/5 dark:text-gray-200 dark:border-[rgba(210,226,244,0.12)]"
          }`}
        >
          {remote && <Check className="w-4 h-4" />}
          Remote
        </button>
        <button
          type="button"
          onClick={() => onVisaSponsorshipChange(visaSponsorship ? "" : "YES")}
          aria-pressed={Boolean(visaSponsorship)}
          aria-label="Toggle visa sponsored jobs"
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
            visaSponsorship ? "border-blue-600 bg-blue-600 text-white shadow-[0_12px_30px_rgba(37,99,235,0.22)]" : "bg-white/70 text-gray-700 border-[rgba(15,23,32,0.12)] hover:border-blue-500 dark:bg-white/5 dark:text-gray-200 dark:border-[rgba(210,226,244,0.12)]"
          }`}
        >
          {visaSponsorship && <Check className="w-4 h-4" />}
          Visa Sponsored
        </button>
        <button
          type="button"
          onClick={() => onRelocationChange(relocationAssistance ? "" : "true")}
          aria-pressed={Boolean(relocationAssistance)}
          aria-label="Toggle relocation support jobs"
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
            relocationAssistance ? "border-purple-600 bg-purple-600 text-white shadow-[0_12px_30px_rgba(147,51,234,0.22)]" : "bg-white/70 text-gray-700 border-[rgba(15,23,32,0.12)] hover:border-purple-500 dark:bg-white/5 dark:text-gray-200 dark:border-[rgba(210,226,244,0.12)]"
          }`}
        >
          {relocationAssistance && <Check className="w-4 h-4" />}
          Relocation Support
        </button>
      </div>
    </div>
  );
}
