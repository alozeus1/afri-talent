import { JobListParams } from "@/lib/api";

export interface JobSearchState extends Required<Pick<JobListParams, "page" | "limit">> {
  search: string;
  location: string;
  type: string;
  jobField: string;
  workplaceType: string;
  seniority: string;
  visaSponsorship: string;
  relocationAssistance: string;
  remote: string;
}

export const DEFAULT_JOB_RESULTS_LIMIT = 12;

function readStringParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function readPositiveInt(value: string | string[] | undefined, fallback: number): number {
  const parsed = Number.parseInt(readStringParam(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export function parseJobSearchState(
  searchParams: Record<string, string | string[] | undefined>,
): JobSearchState {
  return {
    search: readStringParam(searchParams.search),
    location: readStringParam(searchParams.location),
    type: readStringParam(searchParams.type),
    jobField: readStringParam(searchParams.jobField),
    workplaceType: readStringParam(searchParams.workplaceType),
    seniority: readStringParam(searchParams.seniority),
    visaSponsorship: readStringParam(searchParams.visaSponsorship),
    relocationAssistance: readStringParam(searchParams.relocationAssistance),
    remote: readStringParam(searchParams.remote),
    page: readPositiveInt(searchParams.page, 1),
    limit: readPositiveInt(searchParams.limit, DEFAULT_JOB_RESULTS_LIMIT),
  };
}

export function hasActiveJobFilters(filters: Partial<JobSearchState>): boolean {
  return Boolean(
    filters.search ||
      filters.location ||
      filters.type ||
      filters.jobField ||
      filters.workplaceType ||
      filters.seniority ||
      filters.visaSponsorship ||
      filters.relocationAssistance ||
      filters.remote,
  );
}

export function toJobListParams(state: JobSearchState): JobListParams {
  return {
    search: state.search || undefined,
    location: state.location || undefined,
    type: state.type || undefined,
    jobField: state.jobField || undefined,
    workplaceType: state.workplaceType || undefined,
    seniority: state.seniority || undefined,
    visaSponsorship: state.visaSponsorship || undefined,
    relocationAssistance: state.relocationAssistance || undefined,
    remote: state.remote || undefined,
    page: state.page,
    limit: state.limit,
  };
}

export function buildJobsHref(nextState: Partial<JobSearchState>): string {
  const searchParams = new URLSearchParams();

  const entries: Array<[keyof JobSearchState, string | number | undefined]> = [
    ["search", nextState.search],
    ["location", nextState.location],
    ["type", nextState.type],
    ["jobField", nextState.jobField],
    ["workplaceType", nextState.workplaceType],
    ["seniority", nextState.seniority],
    ["visaSponsorship", nextState.visaSponsorship],
    ["relocationAssistance", nextState.relocationAssistance],
    ["remote", nextState.remote],
    ["page", nextState.page],
    ["limit", nextState.limit],
  ];

  entries.forEach(([key, value]) => {
    if (value === undefined || value === "" || value === 1 || value === DEFAULT_JOB_RESULTS_LIMIT) {
      return;
    }
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `/jobs?${query}` : "/jobs";
}
