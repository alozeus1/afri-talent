// §4.1 — controlled job-field taxonomy.
//
// ~25 ISCO-style categories. Replaces the free-text `jobField` regex tagging
// that was producing wide-net mistakes (everything tagged "Healthcare", etc.).
// Stored on Job as `taxonomyField` + `taxonomyVersion` + `taxonomyConfidence`
// so we can re-classify under a future taxonomy without losing historical
// labels.

export const TAXONOMY_VERSION = 1;

export const JOB_TAXONOMY = [
  "SOFTWARE_ENGINEERING",
  "DATA",
  "SECURITY",
  "CLOUD_DEVOPS",
  "AI_ML",
  "PRODUCT",
  "DESIGN",
  "SALES",
  "MARKETING",
  "CUSTOMER_SUPPORT",
  "FINANCE",
  "ACCOUNTING",
  "HR",
  "LEGAL",
  "HEALTHCARE",
  "EDUCATION",
  "LOGISTICS",
  "SKILLED_TRADES",
  "HOSPITALITY",
  "OPERATIONS",
  "EXECUTIVE",
  "ENGINEERING_NON_SOFTWARE",
  "MANUFACTURING",
  "NONPROFIT",
  "OTHER",
] as const;

export type TaxonomyField = (typeof JOB_TAXONOMY)[number];

export const TAXONOMY_SET: ReadonlySet<TaxonomyField> = new Set(JOB_TAXONOMY);

export function isTaxonomyField(value: string): value is TaxonomyField {
  return TAXONOMY_SET.has(value as TaxonomyField);
}

export const TAXONOMY_LABELS: Record<TaxonomyField, string> = {
  SOFTWARE_ENGINEERING: "Software Engineering",
  DATA: "Data",
  SECURITY: "Security",
  CLOUD_DEVOPS: "Cloud / DevOps",
  AI_ML: "AI / ML",
  PRODUCT: "Product",
  DESIGN: "Design",
  SALES: "Sales",
  MARKETING: "Marketing",
  CUSTOMER_SUPPORT: "Customer Support",
  FINANCE: "Finance",
  ACCOUNTING: "Accounting",
  HR: "Human Resources",
  LEGAL: "Legal",
  HEALTHCARE: "Healthcare",
  EDUCATION: "Education",
  LOGISTICS: "Logistics",
  SKILLED_TRADES: "Skilled Trades",
  HOSPITALITY: "Hospitality",
  OPERATIONS: "Operations",
  EXECUTIVE: "Executive",
  ENGINEERING_NON_SOFTWARE: "Engineering (Non-Software)",
  MANUFACTURING: "Manufacturing",
  NONPROFIT: "Nonprofit",
  OTHER: "Other",
};
