import { Job, JobListParams, JobListResponse, PublicStats } from "@/lib/api";

const SERVER_API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:4000";

const DEFAULT_TIMEOUT_MS = 5000;

function buildTimeoutSignal(timeoutMs: number) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function fetchServerPublicApi<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...init } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");

  if (typeof window === "undefined") {
    requestHeaders.set("x-afritalent-internal-fetch", "server-public-api");
  }

  const response = await fetch(`${SERVER_API_URL}${path}`, {
    ...init,
    cache: "no-store",
    signal: buildTimeoutSignal(timeoutMs),
    headers: requestHeaders,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    const message = error?.error || "Request failed";
    throw new Error(message);
  }

  return response.json();
}

function buildJobsQuery(params: JobListParams) {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set("search", params.search);
  if (params.location) searchParams.set("location", params.location);
  if (params.type) searchParams.set("type", params.type);
  if (params.jobField) searchParams.set("jobField", params.jobField);
  if (params.workplaceType) searchParams.set("workplaceType", params.workplaceType);
  if (params.seniority) searchParams.set("seniority", params.seniority);
  if (params.visaSponsorship) searchParams.set("visaSponsorship", params.visaSponsorship);
  if (params.relocationAssistance) searchParams.set("relocationAssistance", params.relocationAssistance);
  if (params.remote) searchParams.set("remote", params.remote);
  if (params.salaryMin) searchParams.set("salaryMin", params.salaryMin.toString());
  if (params.salaryMax) searchParams.set("salaryMax", params.salaryMax.toString());
  if (params.country) searchParams.set("country", params.country);
  if (params.page) searchParams.set("page", params.page.toString());
  if (params.limit) searchParams.set("limit", params.limit.toString());
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function getPublicStatsServer(): Promise<PublicStats | null> {
  try {
    return await fetchServerPublicApi<PublicStats>("/api/public/stats", { timeoutMs: 3500 });
  } catch {
    return null;
  }
}

export async function getJobsListServer(
  params: JobListParams,
): Promise<{ data: JobListResponse | null; error: string | null }> {
  try {
    const data = await fetchServerPublicApi<JobListResponse>(`/api/jobs${buildJobsQuery(params)}`, {
      timeoutMs: 4500,
    });
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "We couldn't refresh jobs right now. Check your connection and try again.",
    };
  }
}

export async function getJobDetailServer(
  slug: string,
): Promise<{ job: Job | null; error: string | null; notFound: boolean }> {
  try {
    const job = await fetchServerPublicApi<Job>(`/api/jobs/${slug}`, { timeoutMs: 4500 });
    return { job, error: null, notFound: false };
  } catch (error) {
    if (error instanceof Error && error.message === "Job not found") {
      return { job: null, error: null, notFound: true };
    }
    return {
      job: null,
      error:
        error instanceof Error
          ? error.message
          : "We couldn't load this job right now. Please try again in a moment.",
      notFound: false,
    };
  }
}
