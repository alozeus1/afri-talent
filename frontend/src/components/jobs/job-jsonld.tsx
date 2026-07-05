import { Job } from "@/lib/api";
import { normalizeJobDescription } from "@/lib/job-description";
import { salaryPeriodSchemaUnit } from "@/lib/salary";

// §4.4 — JobPosting JSON-LD requires a validThrough date for Google for Jobs.
// We cap it at `datePosted + 60 days` so Search drops the listing even if the
// employer never set an explicit expiry — matches the master prompt formula
// `validThrough = min(expiresAt, datePosted + 60 days)`.
export const JSONLD_VALID_THROUGH_DAYS = 60;

export function computeJsonLdValidThrough(
  expiresAt: string | Date | null | undefined,
  datePosted: string | Date | null | undefined,
): string | null {
  const expiry = expiresAt ? new Date(expiresAt) : null;
  const posted = datePosted ? new Date(datePosted) : null;
  const cap = posted ? new Date(posted.getTime() + JSONLD_VALID_THROUGH_DAYS * 86400000) : null;

  if (expiry && cap) {
    return (expiry.getTime() < cap.getTime() ? expiry : cap).toISOString();
  }
  if (expiry) return expiry.toISOString();
  if (cap) return cap.toISOString();
  return null;
}

interface JobJsonLdProps {
  job: Job & { emitNoJsonLd?: boolean };
}

export function JobJsonLd({ job }: JobJsonLdProps) {
  // §4.4 — when the backend signals an expired listing in 200_WITH_NO_JSONLD
  // mode, the frontend renders the notice but drops the structured data so
  // Google Search doesn't keep showing the dead listing.
  if (job.isExpired || job.emitNoJsonLd) return null;

  const employmentTypeMap: Record<string, string> = {
    "full-time": "FULL_TIME",
    "part-time": "PART_TIME",
    "contract": "CONTRACTOR",
    "freelance": "CONTRACTOR",
    "internship": "INTERN",
    "temporary": "TEMPORARY",
    "volunteer": "VOLUNTEER",
  };

  const companyName = job.employer?.companyName || job.sourceName || "Company";
  const isRemote = job.location?.toLowerCase().includes("remote");
  const cleanedDescription = normalizeJobDescription(job.description).replace(/\s+/g, " ").trim();

  const datePosted = job.publishedAt || job.createdAt;
  const validThrough = computeJsonLdValidThrough(job.expiresAt ?? null, datePosted);

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: cleanedDescription,
    datePosted,
    validThrough,
    employmentType: employmentTypeMap[job.type?.toLowerCase()] || "FULL_TIME",
    hiringOrganization: {
      "@type": "Organization",
      name: companyName,
      ...(job.employer?.website ? { sameAs: job.employer.website } : {}),
    },
    ...(isRemote
      ? {
        jobLocationType: "TELECOMMUTE",
        applicantLocationRequirements: (job.eligibleCountries && job.eligibleCountries.length > 0)
          ? job.eligibleCountries.map((countryCode) => ({
            "@type": "Country",
            name: countryCode,
          }))
          : undefined,
      }
      : {
        jobLocation: {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            addressLocality: job.location,
            addressRegion: job.location,
          },
        },
        applicantLocationRequirements: (job.eligibleCountries && job.eligibleCountries.length > 0)
          ? job.eligibleCountries.map((countryCode) => ({
            "@type": "Country",
            name: countryCode,
          }))
          : undefined,
      }),
  };

  if (job.salaryMin || job.salaryMax) {
    jsonLd.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.currency || "USD",
      value: {
        "@type": "QuantitativeValue",
        ...(job.salaryMin && job.salaryMax
          ? { minValue: job.salaryMin, maxValue: job.salaryMax }
          : job.salaryMin
          ? { value: job.salaryMin }
          : { value: job.salaryMax }),
        unitText: salaryPeriodSchemaUnit(job.salaryPeriod),
      },
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}

/**
 * Serialize JSON-LD for embedding in a <script> tag. `JSON.stringify` does not
 * escape `<`, `>`, or `&`, so employer- or aggregator-controlled fields (title,
 * description, company name) could otherwise inject `</script><script>…` and
 * execute arbitrary markup on the public job page. Escaping these to their
 * `\uXXXX` forms keeps the output valid JSON while making script breakout and
 * U+2028/U+2029 line-separator issues impossible.
 */
function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
