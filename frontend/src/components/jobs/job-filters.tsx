"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface JobFiltersProps {
  search: string;
  location: string;
  type: string;
  seniority: string;
  visaSponsorship: string;
  relocationAssistance: string;
  remote: string;
  onSearchChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onSeniorityChange: (value: string) => void;
  onVisaSponsorshipChange: (value: string) => void;
  onRelocationChange: (value: string) => void;
  onRemoteChange: (value: string) => void;
  onClear: () => void;
}

const jobTypes = ["Full-time", "Part-time", "Contract", "Freelance", "Internship"];
const seniorityLevels = ["Junior", "Mid-level", "Senior", "Lead", "Executive"];

export function JobFilters({
  search,
  location,
  type,
  seniority,
  visaSponsorship,
  relocationAssistance,
  remote,
  onSearchChange,
  onLocationChange,
  onTypeChange,
  onSeniorityChange,
  onVisaSponsorshipChange,
  onRelocationChange,
  onRemoteChange,
  onClear,
}: JobFiltersProps) {
  const hasFilters = search || location || type || seniority || visaSponsorship || relocationAssistance || remote;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Input
          type="search"
          inputMode="search"
          autoComplete="off"
          aria-label="Search jobs"
          placeholder="Search jobs..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <Input
          inputMode="text"
          autoComplete="country-name"
          aria-label="Filter by location"
          placeholder="Location"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
        />
        <select
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          aria-label="Filter by job type"
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
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          aria-label="Filter by seniority"
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
      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          onClick={() => onRemoteChange(remote ? "" : "true")}
          aria-pressed={Boolean(remote)}
          aria-label="Toggle remote only jobs"
          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            remote ? "bg-emerald-600 text-white border-emerald-600" : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:border-emerald-500"
          }`}
        >
          Remote
        </button>
        <button
          type="button"
          onClick={() => onVisaSponsorshipChange(visaSponsorship ? "" : "YES")}
          aria-pressed={Boolean(visaSponsorship)}
          aria-label="Toggle visa sponsored jobs"
          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            visaSponsorship ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:border-blue-500"
          }`}
        >
          Visa Sponsored
        </button>
        <button
          type="button"
          onClick={() => onRelocationChange(relocationAssistance ? "" : "true")}
          aria-pressed={Boolean(relocationAssistance)}
          aria-label="Toggle relocation support jobs"
          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            relocationAssistance ? "bg-purple-600 text-white border-purple-600" : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:border-purple-500"
          }`}
        >
          Relocation Support
        </button>
      </div>
      {hasFilters && (
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
