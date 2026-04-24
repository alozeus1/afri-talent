import { Job } from "@/lib/api";
import { normalizeJobDescription } from "@/lib/job-description";
import { salaryPeriodSchemaUnit } from "@/lib/salary";

interface JobJsonLdProps {
  job: Job;
}

export function JobJsonLd({ job }: JobJsonLdProps) {
  const expiresAt = job.expiresAt ? new Date(job.expiresAt) : null;
  if (job.isExpired) return null;

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

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: cleanedDescription,
    datePosted: job.publishedAt || job.createdAt,
    validThrough: expiresAt?.toISOString(),
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
