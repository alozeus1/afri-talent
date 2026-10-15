import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RetryButton } from "@/components/ui/retry-button";
import { TrustBadge } from "@/components/trust/trust-badge";
import { TrustExplainerModal } from "@/components/trust/trust-explainer-modal";
import { TrustSupportCard } from "@/components/trust/trust-support-card";
import { JobJsonLd } from "@/components/jobs/job-jsonld";
import { JobApplyPanel } from "@/components/jobs/job-apply-panel";
import { splitJobDescriptionSections } from "@/lib/job-description";
import { formatSalaryRange } from "@/lib/salary";
import { getJobDetailServer } from "@/lib/server-public-api";
import {
  africaEligibility,
  deriveJobTrustLabels,
  type AfricaEligibilityStatus,
} from "@/lib/job-trust-labels";
import { ReportJobButton } from "@/components/jobs/report-job-button";
import { JobFitPanel } from "@/components/jobs/job-fit-panel";
import { SaveJobButton } from "@/components/jobs/save-job-button";
import { BackToJobs, CompanyLink } from "@/components/jobs/job-detail-links";
import { formatPostedLong } from "@/lib/posted-age";
import type { Job, TrustRiskLevel } from "@/lib/api";

type HeaderBadge = {
  label: string;
  variant: "success" | "info" | "warning";
  riskLevel?: TrustRiskLevel;
};

const MAX_HEADER_BADGES = 3;

/** At most three header badges: a caution (if any) always survives the cut. */
function selectHeaderBadges(job: Job): HeaderBadge[] {
  const trust: HeaderBadge[] = [];
  if (job.hiresFromAfrica) trust.push({ label: "Hires from Africa", variant: "success" });
  if (job.employer?.trust) {
    trust.push({ label: job.employer.trust.badge, riskLevel: job.employer.trust.riskLevel, variant: "success" });
  }
  if (job.discovery?.trustedJob) trust.push({ label: "Trusted job", variant: "success" });
  if (job.trust?.companyReviewed) trust.push({ label: "Company reviewed", variant: "info" });
  if (job.trust?.jobQualityChecked) trust.push({ label: "Job quality checked", variant: "success" });
  if (job.discovery?.sourceCount && job.discovery.sourceCount > 1) {
    trust.push({ label: `Cross-checked x${job.discovery.sourceCount}`, variant: "info" });
  }
  const caution: HeaderBadge | null = job.trust?.newEmployerCaution
    ? { label: "New employer review", riskLevel: "MEDIUM", variant: "warning" }
    : null;
  return caution
    ? [...trust.slice(0, MAX_HEADER_BADGES - 1), caution]
    : trust.slice(0, MAX_HEADER_BADGES);
}

const AFRICA_STATUS_STYLES: Record<AfricaEligibilityStatus, { box: string; dot: string }> = {
  confirmed: {
    box: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20",
    dot: "bg-emerald-500",
  },
  possible: {
    box: "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20",
    dot: "bg-amber-500",
  },
  restricted: {
    box: "border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20",
    dot: "bg-red-500",
  },
  not_confirmed: {
    box: "border-line bg-surface-sunken dark:border-zinc-700 dark:bg-zinc-900/60",
    dot: "bg-gray-400",
  },
};

type JobDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { slug } = await params;
  const { job, error, notFound: missing } = await getJobDetailServer(slug);

  if (missing) {
    notFound();
  }

  if (error || !job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
          <p className="font-semibold">We couldn&apos;t load this job right now.</p>
          <p className="mt-1 text-sm">{error || "Job not found"}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <RetryButton />
          <BackToJobs>
            <Button variant="outline">Back to jobs</Button>
          </BackToJobs>
        </div>
      </div>
    );
  }

  const salary = formatSalaryRange({
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    salaryPeriod: job.salaryPeriod,
  });
  const descriptionSections = splitJobDescriptionSections(job.description);
  const trustReasons = [
    job.employer?.trust?.badge
      ? {
          title: "Employer verification",
          description: `${job.employer.trust.badge} is shown because the employer cleared AfriTalent trust checks at that level.`,
          statusLabel: job.employer.trust.badge,
          statusVariant: "success" as const,
        }
      : null,
    job.trust?.companyReviewed
      ? {
          title: "Company reviewed",
          description: "AfriTalent reviewed the employer account beyond self-reported information.",
          statusLabel: "Reviewed",
          statusVariant: "info" as const,
        }
      : null,
    job.trust?.jobQualityChecked
      ? {
          title: "Job quality checked",
          description: "This listing passed quality checks for clarity, application path, and core job information.",
          statusLabel: "Checked",
          statusVariant: "success" as const,
        }
      : null,
    job.discovery?.salaryTransparent
      ? {
          title: "Salary transparency",
          description: "Compensation is disclosed, which reduces ambiguity and improves candidate confidence.",
          statusLabel: "Disclosed",
          statusVariant: "info" as const,
        }
      : null,
    job.discovery?.sourceCount && job.discovery.sourceCount > 1
      ? {
          title: "Cross-checked source lineage",
          description: `AfriTalent merged ${job.discovery.sourceCount} source records to reduce duplicates and preserve the strongest application path.`,
          statusLabel: `x${job.discovery.sourceCount}`,
          statusVariant: "info" as const,
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    description: string;
    statusLabel: string;
    statusVariant: "success" | "info";
  }>;

  const headerBadges = selectHeaderBadges(job);
  const postedLabel = formatPostedLong(job.publishedAt || job.createdAt);
  const verdict = africaEligibility(job);
  const verdictStyle = AFRICA_STATUS_STYLES[verdict.status];
  const verdictLabels = deriveJobTrustLabels(job);
  const verifiedDateLabel = job.lastCheckedAt
    ? `Last verified ${new Date(job.lastCheckedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : job.publishedAt
      ? `Published ${new Date(job.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : null;
  const hasMobilityDetails =
    job.visaSponsorship === "YES" ||
    job.relocationAssistance ||
    (job.eligibleCountries && job.eligibleCountries.length > 0);
  const hasTrustSignals = Boolean(job.discovery) || trustReasons.length > 0;

  return (
    <>
      <JobJsonLd job={job} />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <BackToJobs className="inline-flex items-center text-primary-text hover:text-emerald-700 mb-6">
          <svg className="w-4 h-4 mr-2 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to jobs
        </BackToJobs>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-surface rounded-xl border border-line p-8 mb-6 dark:bg-gray-900 dark:border-gray-800">
              {/* 1. Header: title, company, location, salary, posted */}
              <div className="flex justify-between items-start mb-4 gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-fg mb-2 dark:text-gray-100">{job.title}</h1>
                  <p className="text-primary-text font-semibold text-lg">
                    {job.employer?.id ? (
                      <CompanyLink companyId={job.employer.id}>{job.employer.companyName}</CompanyLink>
                    ) : (
                      job.employer?.companyName || job.sourceName || "Company"
                    )}
                  </p>
                  {headerBadges.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {headerBadges.map((badge) => (
                        <TrustBadge
                          key={badge.label}
                          label={badge.label}
                          riskLevel={badge.riskLevel}
                          variant={badge.variant}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <Badge variant="success" className="text-sm">
                  {job.type}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-4 mb-6 text-fg-secondary dark:text-gray-300">
                <span className="inline-flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {job.location}
                </span>
                <span className="inline-flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {job.seniority}
                </span>
                {salary && (
                  <span className="inline-flex items-center font-semibold text-fg dark:text-gray-100">
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {salary}
                  </span>
                )}
                {postedLabel && (
                  <span className="inline-flex items-center" data-testid="job-posted-age">
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {postedLabel}
                  </span>
                )}
              </div>

              {job.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {job.tags.map((tag) => (
                    <Badge key={tag} variant="default">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {job.discovery?.stale && (
                <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-900 dark:bg-amber-950/30">
                  <p className="font-semibold text-amber-900 dark:text-amber-200">Aging listing</p>
                  <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">
                    This job has not been refreshed recently, so AfriTalent downranks it and recommends extra caution before applying.
                  </p>
                </div>
              )}

              {job.trust &&
                (job.trust.newEmployerCaution ||
                  job.trust.riskLevel === "MEDIUM" ||
                  job.trust.riskLevel === "HIGH") && (
                  <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-900 dark:bg-amber-950/30">
                    <p className="font-semibold text-amber-900 dark:text-amber-200">Trust guidance</p>
                    <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">{job.trust.guidance}</p>
                  </div>
                )}

              {/* 2. Africa eligibility verdict (truth-first, never a guess) */}
              <div className={`mb-6 rounded-2xl border p-6 ${verdictStyle.box}`}>
                <h3 className="mb-2 flex items-center gap-2 font-semibold text-fg dark:text-gray-100">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${verdictStyle.dot}`} aria-hidden />
                  Can I apply from Africa?
                </h3>
                <p className="font-medium text-fg dark:text-gray-100">{verdict.headline}</p>
                <ul className="mt-2 space-y-1 text-sm text-fg-secondary dark:text-gray-300">
                  {verdict.reasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
                {verdictLabels.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-200/70 pt-3 dark:border-zinc-700">
                    {verdictLabels.map((l) => (
                      <TrustBadge key={l.label} label={l.label} variant={l.variant === "default" ? "info" : l.variant} />
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted dark:text-gray-400">
                  <span>
                    Source: {job.sourceName ?? job.employer?.companyName ?? "Unknown"}
                    {verifiedDateLabel && ` · ${verifiedDateLabel}`}
                  </span>
                  <span className="flex items-center gap-3"><SaveJobButton jobId={job.id} /><ReportJobButton jobId={job.id} /></span>
                </div>
              </div>

              {/* 3. Job description */}
              <div className="prose max-w-none dark:prose-invert mb-8">
                <h2 className="text-xl font-semibold text-fg mb-4 dark:text-gray-100">Job description</h2>
                <div className="space-y-4 text-fg-secondary dark:text-gray-300">
                  {descriptionSections.map((section, index) => (
                    <p key={`${job.id}-description-${index}`} className="whitespace-pre-line leading-8">
                      {section}
                    </p>
                  ))}
                </div>
              </div>

              {hasMobilityDetails && (
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 mb-6 border border-blue-100 dark:from-blue-950/30 dark:to-purple-950/30 dark:border-blue-900/60">
                  <h3 className="font-semibold text-fg mb-3 flex items-center gap-2 dark:text-gray-100">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    International opportunities
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {job.visaSponsorship === "YES" && (
                      <div className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 dark:text-green-400">&#10003;</span>
                        <div>
                          <p className="font-medium text-fg dark:text-gray-100">Visa sponsorship</p>
                          <p className="text-sm text-fg-secondary dark:text-gray-300">Employer provides visa support.</p>
                        </div>
                      </div>
                    )}
                    {job.relocationAssistance && (
                      <div className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 dark:text-green-400">&#10003;</span>
                        <div>
                          <p className="font-medium text-fg dark:text-gray-100">Relocation assistance</p>
                          <p className="text-sm text-fg-secondary dark:text-gray-300">Help with moving and settling in.</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {job.eligibleCountries && job.eligibleCountries.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-900/60">
                      <p className="text-sm font-medium text-fg-secondary mb-2 dark:text-gray-200">Eligible countries</p>
                      <div className="flex flex-wrap gap-1.5">
                        {job.eligibleCountries.map((country) => (
                          <span
                            key={country}
                            className="px-2 py-0.5 bg-surface rounded text-xs font-medium text-fg-secondary border border-line dark:bg-zinc-900 dark:text-gray-200 dark:border-zinc-700"
                          >
                            {country}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <JobFitPanel jobTags={job.tags} />

              {/* 4. Trust & signals (collapsed by default; the header already carries the top cues) */}
              {hasTrustSignals && (
                <details className="group mb-2 rounded-2xl border border-line bg-surface-sunken px-5 py-4 dark:border-zinc-700 dark:bg-zinc-900/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-fg dark:text-slate-100">
                    <span>Trust &amp; signals</span>
                    <svg className="h-4 w-4 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>

                  {job.discovery && (
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-fg-secondary dark:text-slate-300">Signal quality</h3>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-surface px-4 py-3 dark:bg-zinc-950">
                          <p className="text-xs font-medium text-fg-muted dark:text-slate-400">Freshness</p>
                          <p className="mt-1 text-base font-semibold text-fg dark:text-slate-100">{job.discovery.freshnessLabel}</p>
                        </div>
                        <div className="rounded-xl bg-surface px-4 py-3 dark:bg-zinc-950">
                          <p className="text-xs font-medium text-fg-muted dark:text-slate-400">Quality</p>
                          <p className="mt-1 text-base font-semibold text-fg dark:text-slate-100">{job.discovery.qualityLabel}</p>
                        </div>
                        <div className="rounded-xl bg-surface px-4 py-3 dark:bg-zinc-950">
                          <p className="text-xs font-medium text-fg-muted dark:text-slate-400">Salary clarity</p>
                          <p className="mt-1 text-base font-semibold text-fg dark:text-slate-100">
                            {job.discovery.salaryTransparent ? "Disclosed" : "Not disclosed"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-surface px-4 py-3 dark:bg-zinc-950">
                          <p className="text-xs font-medium text-fg-muted dark:text-slate-400">Application path</p>
                          <p className="mt-1 text-base font-semibold text-fg dark:text-slate-100">
                            {job.discovery.validApplicationPath ? "Verified" : "Needs caution"}
                          </p>
                        </div>
                      </div>
                      {job.rankingExplanation?.summary && (
                        <p className="mt-4 text-sm text-fg-secondary dark:text-slate-300">Why this ranks well: {job.rankingExplanation.summary}</p>
                      )}
                    </div>
                  )}

                  {trustReasons.length > 0 && (
                    <div className="mt-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-fg dark:text-gray-100">Why this employer or job looks trusted</h3>
                          <p className="mt-1 text-sm leading-6 text-fg-secondary dark:text-gray-300">
                            AfriTalent shows trust cues when there is concrete context behind them, not just a label.
                          </p>
                        </div>
                        <TrustExplainerModal
                          title="Why this job looks credible"
                          description="These are the main signals AfriTalent is surfacing for this role right now."
                          items={trustReasons}
                          triggerLabel="See trust breakdown"
                        />
                      </div>
                      <div className="mt-3 space-y-3">
                        {trustReasons.map((reason) => (
                          <div key={reason.title} className="rounded-2xl bg-surface px-4 py-3 dark:bg-zinc-950">
                            <p className="font-medium text-fg dark:text-gray-100">{reason.title}</p>
                            <p className="mt-1 text-sm text-fg-secondary dark:text-gray-300">{reason.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </details>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <JobApplyPanel job={job} />
            <div className="mt-6">
              <TrustSupportCard
                reportHref={`/trust/report?targetJobId=${job.id}`}
                title="Something about this job feels off?"
                description="Report suspicious salary claims, off-platform contact requests, impersonation, or unclear application paths. We combine reports with our own trust checks before action is taken."
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
