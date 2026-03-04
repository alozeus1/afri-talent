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
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Input
          placeholder="Search jobs..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <Input
          placeholder="Location"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
        />
        <select
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
          onClick={() => onRemoteChange(remote ? "" : "true")}
          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            remote ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-700 border-gray-300 hover:border-emerald-500"
          }`}
        >
          Remote
        </button>
        <button
          onClick={() => onVisaSponsorshipChange(visaSponsorship ? "" : "YES")}
          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            visaSponsorship ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:border-blue-500"
          }`}
        >
          Visa Sponsored
        </button>
        <button
          onClick={() => onRelocationChange(relocationAssistance ? "" : "true")}
          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            relocationAssistance ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-700 border-gray-300 hover:border-purple-500"
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
