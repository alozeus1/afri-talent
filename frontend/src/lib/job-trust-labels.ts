// User-facing trust labels + Africa-eligibility verdict, derived from job
// metadata the backend already computes. Truth-first: when a field is
// unknown we say "Not confirmed" — never a guess.

import type { Job } from "@/lib/api";
import { AFRICAN_COUNTRIES } from "@/lib/countries";

export const AFRICAN_COUNTRY_CODES = new Set(AFRICAN_COUNTRIES.map((country) => country.code));

export interface JobTrustLabel {
  label: string;
  variant: "success" | "info" | "warning" | "default";
}

const RECENT_REFRESH_HOURS = 72;

export function deriveJobTrustLabels(job: Job): JobTrustLabel[] {
  const labels: JobTrustLabel[] = [];

  if (job.salaryMin != null || job.salaryMax != null) {
    labels.push({ label: "Salary available", variant: "success" });
  }

  if (job.visaSponsorship === "YES") {
    labels.push({ label: "Visa status confirmed", variant: "success" });
  }

  const freshnessDate = job.lastCheckedAt ?? job.publishedAt;
  if (freshnessDate) {
    const ageHours = (Date.now() - new Date(freshnessDate).getTime()) / 3_600_000;
    if (ageHours >= 0 && ageHours <= RECENT_REFRESH_HOURS) {
      labels.push({
        label: job.lastCheckedAt ? "Recently refreshed" : "Recently published",
        variant: "info",
      });
    }
  }

  if (job.jobSource === "AGGREGATED") {
    labels.push({ label: "External source", variant: "default" });
  } else if (job.jobSource === "EMPLOYER_POSTED") {
    labels.push({ label: "Apply on AfriTalent", variant: "info" });
  } else {
    labels.push({ label: "Source not confirmed", variant: "default" });
  }

  return labels;
}

// Compact Africa-eligibility pill for dense list cards. Returns null when the
// card already carries the "Hires from Africa" badge (avoids duplication) and
// for not_confirmed (no pill makes no claim; the detail page shows the full
// verdict).
export function africaPill(job: Job): JobTrustLabel | null {
  if (job.hiresFromAfrica) return null;
  switch (africaEligibility(job).status) {
    case "confirmed":
      return { label: "Open to Africa", variant: "success" };
    case "possible":
      return { label: "Possibly open to Africa", variant: "info" };
    case "restricted":
      return { label: "Region-restricted", variant: "warning" };
    default:
      return null;
  }
}

export type AfricaEligibilityStatus =
  | "confirmed"
  | "possible"
  | "restricted"
  | "not_confirmed";

export interface AfricaEligibility {
  status: AfricaEligibilityStatus;
  headline: string;
  reasons: string[];
}

export function africaEligibility(job: Job): AfricaEligibility {
  const reasons: string[] = [];
  const eligible = (job.eligibleCountries ?? []).map((c) => c.toUpperCase());
  const hasAfricanCountry = eligible.some((c) => AFRICAN_COUNTRY_CODES.has(c));
  const isWorldwide = eligible.includes("GLOBAL");
  const isRemote =
    (job.workplaceType ?? "").toLowerCase() === "remote" ||
    job.location.toLowerCase().includes("remote");

  if (job.hiresFromAfrica || hasAfricanCountry || isWorldwide) {
    if (hasAfricanCountry) reasons.push("The listing names African countries as eligible.");
    if (isWorldwide) reasons.push("The listing is open to applicants worldwide.");
    if (job.visaSponsorship === "YES") reasons.push("The employer sponsors visas.");
    if (reasons.length === 0) reasons.push("The listing signals openness to applicants based in Africa.");
    return {
      status: "confirmed",
      headline: "Confirmed open to African applicants",
      reasons,
    };
  }

  if (eligible.length > 0 && !hasAfricanCountry && !isWorldwide) {
    reasons.push(`Eligibility is listed as: ${eligible.join(", ")}.`);
    return {
      status: "restricted",
      headline: "Restricted to specific countries or regions",
      reasons,
    };
  }

  if (isRemote) {
    reasons.push("The role is remote, but the listing does not state where applicants must be based.");
    reasons.push("Check the description or ask the employer before investing time in a long application.");
    return {
      status: "possible",
      headline: "Possibly open to African applicants",
      reasons,
    };
  }

  reasons.push("The listing does not state its hiring regions.");
  reasons.push("Treat location eligibility as unverified until the employer confirms it.");
  return {
    status: "not_confirmed",
    headline: "Not confirmed",
    reasons,
  };
}
