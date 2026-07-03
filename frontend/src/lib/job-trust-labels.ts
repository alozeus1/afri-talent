// User-facing trust labels + Africa-eligibility verdict, derived from job
// metadata the backend already computes. Truth-first: when a field is
// unknown we say "Not confirmed" — never a guess.

import type { Job } from "@/lib/api";

// ISO codes mirroring backend AFRICAN_COUNTRIES (aggregator/types.ts)
export const AFRICAN_COUNTRY_CODES = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD",
  "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE",
  "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG",
  "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG",
  "ZM", "ZW",
]);

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

  const lastSeen = job.lastCheckedAt ?? job.publishedAt;
  if (lastSeen) {
    const ageHours = (Date.now() - new Date(lastSeen).getTime()) / 3_600_000;
    if (ageHours >= 0 && ageHours <= RECENT_REFRESH_HOURS) {
      labels.push({ label: "Recently refreshed", variant: "info" });
    }
  }

  labels.push(
    job.jobSource === "AGGREGATED"
      ? { label: "External source", variant: "default" }
      : { label: "Apply on AfriTalent", variant: "info" },
  );

  return labels;
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

  if (job.hiresFromAfrica) {
    if (hasAfricanCountry) reasons.push("The listing names African countries as eligible.");
    if (job.visaSponsorship === "YES") reasons.push("The employer sponsors visas.");
    if (isRemote && isWorldwide) reasons.push("The role is remote and open worldwide.");
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
