import Link from "next/link";
import { Job } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrustBadge } from "@/components/trust/trust-badge";
import { formatSalaryRange } from "@/lib/salary";
import { jobDiscoveryEvents } from "@/lib/analytics";

interface JobCardProps {
  job: Job;
}

export function JobCard({ job }: JobCardProps) {
  const salary = formatSalaryRange({
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    salaryPeriod: job.salaryPeriod,
  });
  const freshnessLabel = job.discovery?.freshnessLabel.toLowerCase();
  const discoverySummary = job.rankingExplanation?.summary || job.trust?.guidance;
  const lastSeenText = job.discovery?.lastSeenAt
    ? new Date(job.discovery.lastSeenAt).toLocaleDateString()
    : null;
  const trustReasons = [
    job.employer?.trust?.badge,
    job.trust?.companyReviewed ? "Company reviewed" : null,
    job.trust?.jobQualityChecked ? "Job quality checked" : null,
    job.discovery?.salaryTransparent ? "Salary disclosed" : null,
    job.discovery?.sourceCount && job.discovery.sourceCount > 1
      ? `Cross-checked across ${job.discovery.sourceCount} sources`
      : null,
  ].filter(Boolean) as string[];

  return (
    <Link
      href={`/jobs/${job.slug}`}
      prefetch={false}
      onClick={() => {
        jobDiscoveryEvents.resultClicked({
          job_id: job.id,
          quality_score: job.discovery?.qualityScore ?? 0,
          freshness_score: job.discovery?.freshnessScore ?? 0,
          ranking_score: job.rankingExplanation?.score ?? 0,
          trusted_job: job.discovery?.trustedJob ?? false,
          source_count: job.discovery?.sourceCount ?? 1,
        });
      }}
    >
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardContent className="p-6">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 mb-1 line-clamp-1">
                {job.title}
              </h3>
              <p className="text-emerald-600 font-medium">
                {job.employer?.companyName || job.sourceName || "Unknown"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {job.employer?.trust && (
                  <TrustBadge
                    label={job.employer.trust.badge}
                    riskLevel={job.employer.trust.riskLevel}
                    variant="success"
                  />
                )}
                {job.trust?.companyReviewed && (
                  <TrustBadge label="Company reviewed" variant="info" />
                )}
                {job.trust?.jobQualityChecked && (
                  <TrustBadge label="Job quality checked" variant="success" />
                )}
                {job.trust?.newEmployerCaution && (
                  <TrustBadge label="New employer review" riskLevel="MEDIUM" variant="warning" />
                )}
                {job.discovery?.trustedJob && (
                  <TrustBadge label="Trusted job" variant="success" />
                )}
                {job.discovery?.sourceCount && job.discovery.sourceCount > 1 && (
                  <TrustBadge label={`Cross-checked x${job.discovery.sourceCount}`} variant="info" />
                )}
              </div>
            </div>
            <Badge variant="success">{job.type}</Badge>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <span className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400">
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {job.location}
            </span>
            <span className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400">
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {job.seniority}
            </span>
          </div>

          {salary && (
            <p className="text-gray-900 dark:text-gray-100 font-semibold mb-4">{salary}</p>
          )}

          {job.discovery && (
            <div className="mb-4 flex flex-wrap gap-2">
              {job.discovery.freshnessLabel !== "ACTIVE" && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {freshnessLabel}
                </span>
              )}
              {job.discovery.salaryTransparent && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Salary disclosed
                </span>
              )}
              {job.discovery.visaClear && job.visaSponsorship === "YES" && (
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  Visa clarified
                </span>
              )}
            </div>
          )}

          {discoverySummary && (
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
              {discoverySummary}
            </p>
          )}

          {trustReasons.length > 0 && (
            <p className="mb-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Why this looks credible: {trustReasons.slice(0, 3).join(" • ")}
            </p>
          )}

          {(job.visaSponsorship === "YES" || job.relocationAssistance) && (
            <div className="flex flex-wrap gap-2 mb-3">
              {job.visaSponsorship === "YES" && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Visa Sponsored
                </span>
              )}
              {job.relocationAssistance && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Relocation Support
                </span>
              )}
            </div>
          )}

          {job.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {job.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="default">
                  {tag}
                </Badge>
              ))}
              {job.tags.length > 3 && (
                <Badge variant="default">+{job.tags.length - 3}</Badge>
              )}
            </div>
          )}

          {job.discovery?.sourceCount && job.discovery.sourceCount > 1 && lastSeenText && (
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              Cross-checked across {job.discovery.sourceCount} sources, refreshed {lastSeenText}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
