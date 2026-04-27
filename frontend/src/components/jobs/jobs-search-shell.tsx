"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { JobFilters } from "@/components/jobs/job-filters";
import { JobSearchState, buildJobsHref } from "@/lib/jobs-search";
import { useNetworkProfile } from "@/lib/network-profile";
import { jobDiscoveryEvents } from "@/lib/analytics";

interface JobsSearchShellProps {
  filters: JobSearchState;
  isPending?: boolean;
  onNavigate?: (state: JobSearchState) => void;
  resultMetrics?: {
    totalResults: number;
    visibleResults: number;
    trustedResults: number;
    freshResults: number;
  };
}
export function JobsSearchShell({ filters, isPending = false, onNavigate, resultMetrics }: JobsSearchShellProps) {
  const { isLowBandwidth } = useNetworkProfile();
  const [draft, setDraft] = useState<JobSearchState>(filters);

  const deferredSearch = useDeferredValue(draft.search);
  const deferredLocation = useDeferredValue(draft.location);

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  const nextState = useMemo<JobSearchState>(
    () => ({
      ...draft,
      search: deferredSearch,
      location: deferredLocation,
    }),
    [draft, deferredSearch, deferredLocation],
  );

  useEffect(() => {
    if (!onNavigate) {
      return;
    }

    const nextHref = buildJobsHref(nextState);
    const currentHref = buildJobsHref(filters);

    if (nextHref === currentHref) {
      return;
    }

    const timeout = window.setTimeout(() => {
      onNavigate(nextState);
    }, isLowBandwidth ? 650 : 300);

    return () => window.clearTimeout(timeout);
  }, [filters, isLowBandwidth, nextState, onNavigate]);

  useEffect(() => {
    if (!resultMetrics) {
      return;
    }

    jobDiscoveryEvents.resultsLoaded({
      results: resultMetrics.totalResults,
      visible_results: resultMetrics.visibleResults,
      trusted_results: resultMetrics.trustedResults,
      fresh_results: resultMetrics.freshResults,
      has_search: Boolean(filters.search),
      has_location: Boolean(filters.location),
      remote_only: filters.remote === "true",
      visa_required: filters.visaSponsorship === "YES",
      page: filters.page,
    });
  }, [filters.location, filters.page, filters.remote, filters.search, filters.visaSponsorship, resultMetrics]);

  const updateDraft = (updates: Partial<JobSearchState>) => {
    setDraft((current) => ({
      ...current,
      ...updates,
      page: updates.page ?? 1,
    }));
  };

  return (
    <div className="mb-8">
      <JobFilters
        search={draft.search}
        location={draft.location}
        type={draft.type}
        jobField={draft.jobField}
        workplaceType={draft.workplaceType}
        seniority={draft.seniority}
        visaSponsorship={draft.visaSponsorship}
        relocationAssistance={draft.relocationAssistance}
        remote={draft.remote}
        onSearchChange={(value) => updateDraft({ search: value })}
        onLocationChange={(value) => updateDraft({ location: value })}
        onTypeChange={(value) => updateDraft({ type: value })}
        onJobFieldChange={(value) => updateDraft({ jobField: value })}
        onWorkplaceTypeChange={(value) => updateDraft({ workplaceType: value })}
        onSeniorityChange={(value) => updateDraft({ seniority: value })}
        onVisaSponsorshipChange={(value) => updateDraft({ visaSponsorship: value })}
        onRelocationChange={(value) => updateDraft({ relocationAssistance: value })}
        onRemoteChange={(value) => updateDraft({ remote: value })}
        onClear={() =>
          setDraft({
            search: "",
            location: "",
            type: "",
            jobField: "",
            workplaceType: "",
            seniority: "",
            visaSponsorship: "",
            relocationAssistance: "",
            remote: "",
            page: 1,
            limit: filters.limit,
          })
        }
      />
      <div className="mt-3 flex flex-col gap-2 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {isLowBandwidth
            ? "Search is pacing requests more gently to save data on slower connections."
            : "Results update in the background as you refine your search."}
        </p>
        {isPending && <p className="font-semibold text-emerald-700 dark:text-emerald-300">Refreshing results...</p>}
      </div>
    </div>
  );
}
