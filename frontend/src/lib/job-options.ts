// Shared job option lists. The search filters and the employer post/edit job
// forms must use the same values, otherwise employer-posted jobs never match
// the filters candidates use.

export const JOB_FIELDS = [
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
] as const;

export const WORKPLACE_TYPES = [
  { label: "Remote", value: "REMOTE" },
  { label: "Hybrid", value: "HYBRID" },
  { label: "Onsite", value: "ONSITE" },
] as const;

export const VISA_SPONSORSHIP_OPTIONS = [
  { label: "Not specified", value: "UNKNOWN" },
  { label: "Yes, we sponsor visas", value: "YES" },
  { label: "No sponsorship", value: "NO" },
] as const;

export type VisaSponsorshipValue = (typeof VISA_SPONSORSHIP_OPTIONS)[number]["value"];

/** Splits a comma-separated countries input into a clean, de-duplicated list. */
export function parseCountryList(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const value = raw.trim().slice(0, 80);
    const key = value.toLowerCase();
    if (value && !seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out.slice(0, 60);
}
