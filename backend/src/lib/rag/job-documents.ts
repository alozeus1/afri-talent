import { JobStatus, Prisma, VisaSponsorshipStatus } from "@prisma/client";

export const JOB_SEMANTIC_NAMESPACE = "jobs";
export const JOB_SEMANTIC_SOURCE_TYPE = "JOB";

export const semanticJobSelect = Prisma.validator<Prisma.JobSelect>()({
  id: true,
  title: true,
  description: true,
  location: true,
  type: true,
  seniority: true,
  salaryMin: true,
  salaryMax: true,
  currency: true,
  tags: true,
  visaSponsorship: true,
  relocationAssistance: true,
  eligibleCountries: true,
  status: true,
  isExpired: true,
  employerId: true,
  sourceName: true,
  updatedAt: true,
  publishedAt: true,
});

export type SemanticJobRecord = Prisma.JobGetPayload<{ select: typeof semanticJobSelect }>;

export function buildJobSemanticContent(job: SemanticJobRecord): string {
  const segments = [
    job.title,
    job.description,
    `Location: ${job.location}`,
    `Employment type: ${job.type}`,
    `Seniority: ${job.seniority}`,
    job.sourceName ? `Company: ${job.sourceName}` : null,
    job.tags.length > 0 ? `Skills: ${job.tags.join(", ")}` : null,
    typeof job.salaryMin === "number" || typeof job.salaryMax === "number"
      ? `Compensation: ${job.salaryMin ?? "n/a"}-${job.salaryMax ?? "n/a"} ${job.currency ?? ""}`.trim()
      : null,
    job.visaSponsorship === VisaSponsorshipStatus.YES ? "Visa sponsorship available" : null,
    job.relocationAssistance ? "Relocation assistance available" : null,
    job.eligibleCountries.length > 0 ? `Eligible countries: ${job.eligibleCountries.join(", ")}` : null,
  ];

  return segments.filter(Boolean).join("\n");
}

export function buildJobSemanticMetadata(job: SemanticJobRecord): Record<string, unknown> {
  return {
    jobId: job.id,
    title: job.title,
    location: job.location,
    type: job.type,
    seniority: job.seniority,
    sourceName: job.sourceName,
    tags: job.tags,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    visaSponsorship: job.visaSponsorship,
    relocationAssistance: job.relocationAssistance,
    eligibleCountries: job.eligibleCountries,
    status: job.status,
    isExpired: job.isExpired,
  };
}

export function isSemanticJobIndexable(job: SemanticJobRecord): boolean {
  return job.status === JobStatus.PUBLISHED && !job.isExpired;
}
