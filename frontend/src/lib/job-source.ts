// Display name of the public board or ATS an aggregated job was crawled from,
// for the "via <source>" attribution on job cards. Source names are brands and
// are not translated; the surrounding "via {source}" string is.
import type { Job } from "@/lib/api";

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  REMOTIVE: "Remotive",
  REMOTEOK: "RemoteOK",
  HIMALAYAS: "Himalayas",
  WEWORKREMOTELY: "We Work Remotely",
  ARBEITNOW: "Arbeitnow",
  JOBICY: "Jobicy",
  WORKINGNOMADS: "Working Nomads",
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
  ASHBY: "Ashby",
  WORKABLE: "Workable",
  RECRUITEE: "Recruitee",
  SMARTRECRUITERS: "SmartRecruiters",
  ADZUNA: "Adzuna",
};

function hostLabel(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** "Himalayas", "Greenhouse", ... for AGGREGATED jobs; null for employer posts. */
export function jobSourceDisplayName(job: Pick<Job, "jobSource" | "discovery" | "sourceUrl">): string | null {
  if (job.jobSource !== "AGGREGATED") return null;
  const raw = job.discovery?.sourceNames?.[0]?.trim();
  if (raw) return SOURCE_DISPLAY_NAMES[raw.toUpperCase()] ?? hostLabel(job.sourceUrl) ?? raw;
  return hostLabel(job.sourceUrl);
}
