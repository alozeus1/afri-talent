"use client";

// Client body of the job detail page. The server page fetches the job (and
// emits JSON-LD); this view renders it in the visitor's language.
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RetryButton } from "@/components/ui/retry-button";
import { TrustBadge } from "@/components/trust/trust-badge";
import { TrustExplainerModal } from "@/components/trust/trust-explainer-modal";
import { TrustSupportCard } from "@/components/trust/trust-support-card";
import { JobApplyPanel } from "@/components/jobs/job-apply-panel";
import { ReportJobButton } from "@/components/jobs/report-job-button";
import { JobFitPanel } from "@/components/jobs/job-fit-panel";
import { SaveJobButton } from "@/components/jobs/save-job-button";
import { BackToJobs, CompanyLink } from "@/components/jobs/job-detail-links";
import { splitJobDescriptionSections } from "@/lib/job-description";
import { formatSalaryRange } from "@/lib/salary";
import { africaEligibility, deriveJobTrustLabels, type AfricaEligibilityStatus } from "@/lib/job-trust-labels";
import { formatPostedLong } from "@/lib/posted-age";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT, type PublicT } from "@/lib/i18n/public-messages";
import { usePublicLabel } from "@/lib/i18n/public-labels";
import type { Job, TrustRiskLevel } from "@/lib/api";
import { ArrowLeft, Briefcase, Check, Clock, Globe2, MapPin, Wallet } from "lucide-react";

type HeaderBadge = {
  key: string;
  label: string;
  variant: "success" | "info" | "warning";
  riskLevel?: TrustRiskLevel;
};

const MAX_HEADER_BADGES = 3;

/** At most three header badges: a caution (if any) always survives the cut. */
function selectHeaderBadges(job: Job, tp: PublicT, label: (text: string) => string): HeaderBadge[] {
  const trust: HeaderBadge[] = [];
  if (job.hiresFromAfrica) trust.push({ key: "africa", label: tp("discover.badge.hiresFromAfrica"), variant: "success" });
  if (job.employer?.trust) {
    trust.push({
      key: "employer",
      label: label(job.employer.trust.badge),
      riskLevel: job.employer.trust.riskLevel,
      variant: "success",
    });
  }
  if (job.discovery?.trustedJob) trust.push({ key: "trusted", label: tp("discover.badge.trustedJob"), variant: "success" });
  if (job.trust?.companyReviewed) trust.push({ key: "reviewed", label: tp("discover.badge.companyReviewed"), variant: "info" });
  if (job.trust?.jobQualityChecked) trust.push({ key: "quality", label: tp("discover.badge.qualityChecked"), variant: "success" });
  if (job.discovery?.sourceCount && job.discovery.sourceCount > 1) {
    trust.push({ key: "sources", label: tp("discover.badge.crossChecked", { count: job.discovery.sourceCount }), variant: "info" });
  }
  const caution: HeaderBadge | null = job.trust?.newEmployerCaution
    ? { key: "new", label: tp("discover.badge.newEmployer"), riskLevel: "MEDIUM", variant: "warning" }
    : null;
  return caution ? [...trust.slice(0, MAX_HEADER_BADGES - 1), caution] : trust.slice(0, MAX_HEADER_BADGES);
}

const AFRICA_STATUS_STYLES: Record<AfricaEligibilityStatus, { box: string; dot: string }> = {
  confirmed: { box: "border-success-line bg-success-soft", dot: "bg-emerald-500" },
  possible: { box: "border-warning-line bg-warning-soft", dot: "bg-amber-500" },
  restricted: { box: "border-danger-line bg-danger-soft", dot: "bg-red-500" },
  not_confirmed: { box: "border-line bg-surface-sunken", dot: "bg-fg-muted" },
};

export function JobDetailError({ error }: { error: string | null }) {
  const tp = usePublicT();
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div role="alert" className="mb-4 rounded-2xl border border-danger-line bg-danger-soft p-5">
        <p className="font-semibold text-danger">{tp("discover.detail.loadError")}</p>
        <p className="mt-1 text-sm text-fg-secondary">{error || tp("discover.detail.notFound")}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <RetryButton label={tp("site.error.retry")} />
        <BackToJobs>
          <Button variant="outline">{tp("site.error.backToJobs")}</Button>
        </BackToJobs>
      </div>
    </div>
  );
}

export function JobDetailView({ job }: { job: Job }) {
  const tp = usePublicT();
  const label = usePublicLabel();
  const locale = useLocale();

  const salary = formatSalaryRange({
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    salaryPeriod: job.salaryPeriod,
  });
  const descriptionSections = splitJobDescriptionSections(job.description);
  const sourceCount = job.discovery?.sourceCount ?? 0;
  const trustReasons = [
    job.employer?.trust?.badge
      ? {
          title: tp("discover.detail.reason.employerTitle"),
          description: tp("discover.detail.reason.employerBody", { badge: label(job.employer.trust.badge) }),
          statusLabel: label(job.employer.trust.badge),
          statusVariant: "success" as const,
        }
      : null,
    job.trust?.companyReviewed
      ? {
          title: tp("discover.badge.companyReviewed"),
          description: tp("discover.detail.reason.reviewedBody"),
          statusLabel: tp("discover.detail.reason.reviewed"),
          statusVariant: "info" as const,
        }
      : null,
    job.trust?.jobQualityChecked
      ? {
          title: tp("discover.badge.qualityChecked"),
          description: tp("discover.detail.reason.qualityBody"),
          statusLabel: tp("discover.detail.reason.checked"),
          statusVariant: "success" as const,
        }
      : null,
    job.discovery?.salaryTransparent
      ? {
          title: tp("discover.detail.reason.salaryTitle"),
          description: tp("discover.detail.reason.salaryBody"),
          statusLabel: tp("discover.detail.disclosed"),
          statusVariant: "info" as const,
        }
      : null,
    sourceCount > 1
      ? {
          title: tp("discover.detail.reason.lineageTitle"),
          description: tp("discover.detail.reason.lineageBody", { count: sourceCount }),
          statusLabel: `x${sourceCount}`,
          statusVariant: "info" as const,
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    description: string;
    statusLabel: string;
    statusVariant: "success" | "info";
  }>;

  const headerBadges = selectHeaderBadges(job, tp, label);
  const postedLabel = formatPostedLong(job.publishedAt || job.createdAt);
  const verdict = africaEligibility(job);
  const verdictStyle = AFRICA_STATUS_STYLES[verdict.status];
  const verdictLabels = deriveJobTrustLabels(job);
  const dateFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  const verifiedDateLabel = job.lastCheckedAt
    ? tp("discover.detail.lastVerified", { date: new Date(job.lastCheckedAt).toLocaleDateString(locale, dateFormat) })
    : job.publishedAt
      ? tp("discover.detail.published", { date: new Date(job.publishedAt).toLocaleDateString(locale, dateFormat) })
      : null;
  const hasMobilityDetails =
    job.visaSponsorship === "YES" ||
    job.relocationAssistance ||
    (job.eligibleCountries && job.eligibleCountries.length > 0);
  const hasTrustSignals = Boolean(job.discovery) || trustReasons.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <BackToJobs className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-primary-text hover:underline">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {tp("site.error.backToJobs")}
      </BackToJobs>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <article className="mb-6 rounded-2xl border border-line bg-surface p-6 shadow-xs sm:p-8">
            {/* 1. Header: title, company, location, salary, posted */}
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="font-display mb-2 text-2xl font-bold tracking-tight text-fg md:text-3xl">{job.title}</h1>
                <p className="text-lg font-semibold text-primary-text">
                  {job.employer?.id ? (
                    <CompanyLink companyId={job.employer.id}>{job.employer.companyName}</CompanyLink>
                  ) : (
                    job.employer?.companyName || job.sourceName || tp("discover.detail.company")
                  )}
                </p>
                {headerBadges.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {headerBadges.map((badge) => (
                      <TrustBadge key={badge.key} label={badge.label} riskLevel={badge.riskLevel} variant={badge.variant} />
                    ))}
                  </div>
                )}
              </div>
              <Badge variant="success" className="shrink-0 text-sm">
                {label(job.type)}
              </Badge>
            </div>

            <dl className="mb-6 flex flex-wrap gap-x-6 gap-y-3 text-fg-secondary">
              <div className="inline-flex items-center gap-2">
                <dt className="sr-only">{tp("discover.detail.location")}</dt>
                <MapPin className="h-5 w-5 text-fg-muted" aria-hidden="true" />
                <dd>{job.location}</dd>
              </div>
              <div className="inline-flex items-center gap-2">
                <dt className="sr-only">{tp("discover.detail.seniority")}</dt>
                <Briefcase className="h-5 w-5 text-fg-muted" aria-hidden="true" />
                <dd>{label(job.seniority)}</dd>
              </div>
              {salary && (
                <div className="inline-flex items-center gap-2 font-semibold text-fg">
                  <dt className="sr-only">{tp("discover.detail.salary")}</dt>
                  <Wallet className="h-5 w-5 text-fg-muted" aria-hidden="true" />
                  <dd>{label(salary)}</dd>
                </div>
              )}
              {postedLabel && (
                <div className="inline-flex items-center gap-2" data-testid="job-posted-age">
                  <dt className="sr-only">{tp("discover.detail.posted")}</dt>
                  <Clock className="h-5 w-5 text-fg-muted" aria-hidden="true" />
                  <dd>{label(postedLabel)}</dd>
                </div>
              )}
            </dl>

            {job.tags.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-2">
                {job.tags.map((tag) => (
                  <Badge key={tag} variant="default">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {job.discovery?.stale && (
              <div className="mb-6 rounded-2xl border border-warning-line bg-warning-soft px-4 py-4">
                <p className="font-semibold text-warning">{tp("discover.detail.agingTitle")}</p>
                <p className="mt-2 text-sm text-fg-secondary">{tp("discover.detail.agingBody")}</p>
              </div>
            )}

            {job.trust &&
              (job.trust.newEmployerCaution || job.trust.riskLevel === "MEDIUM" || job.trust.riskLevel === "HIGH") && (
                <div className="mb-6 rounded-2xl border border-warning-line bg-warning-soft px-4 py-4">
                  <p className="font-semibold text-warning">{tp("discover.detail.guidanceTitle")}</p>
                  <p className="mt-2 text-sm text-fg-secondary">{job.trust.guidance}</p>
                </div>
              )}

            {/* 2. Africa eligibility verdict (truth-first, never a guess) */}
            <section aria-labelledby="africa-verdict" className={`mb-8 rounded-2xl border p-6 ${verdictStyle.box}`}>
              <h2 id="africa-verdict" className="mb-2 flex items-center gap-2 font-semibold text-fg">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${verdictStyle.dot}`} aria-hidden="true" />
                {tp("discover.detail.africaQuestion")}
              </h2>
              <p className="font-medium text-fg">{label(verdict.headline)}</p>
              <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-fg-secondary marker:text-fg-muted">
                {verdict.reasons.map((reason) => (
                  <li key={reason}>{label(reason)}</li>
                ))}
              </ul>
              {verdictLabels.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                  {verdictLabels.map((l) => (
                    <TrustBadge key={l.label} label={label(l.label)} variant={l.variant === "default" ? "info" : l.variant} />
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
                <span>
                  {tp("discover.detail.source", { source: job.sourceName ?? job.employer?.companyName ?? tp("discover.detail.unknown") })}
                  {verifiedDateLabel && ` · ${verifiedDateLabel}`}
                </span>
                <span className="flex items-center gap-3">
                  <SaveJobButton jobId={job.id} />
                  <ReportJobButton jobId={job.id} />
                </span>
              </div>
            </section>

            {/* 3. Job description (employer-provided text, shown as published) */}
            <section aria-labelledby="job-description" className="mb-8 max-w-none">
              <h2 id="job-description" className="mb-4 text-xl font-semibold text-fg">
                {tp("discover.detail.description")}
              </h2>
              <div className="space-y-4 text-fg-secondary">
                {descriptionSections.map((section, index) => (
                  <p key={`${job.id}-description-${index}`} className="whitespace-pre-line leading-8">
                    {section}
                  </p>
                ))}
              </div>
            </section>

            {hasMobilityDetails && (
              <section aria-labelledby="mobility" className="mb-6 rounded-2xl border border-info-line bg-info-soft p-6">
                <h2 id="mobility" className="mb-3 flex items-center gap-2 font-semibold text-fg">
                  <Globe2 className="h-5 w-5 text-info" aria-hidden="true" />
                  {tp("discover.detail.international")}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {job.visaSponsorship === "YES" && (
                    <div className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-success" aria-hidden="true" />
                      <div>
                        <p className="font-medium text-fg">{tp("discover.detail.visaTitle")}</p>
                        <p className="text-sm text-fg-secondary">{tp("discover.detail.visaBody")}</p>
                      </div>
                    </div>
                  )}
                  {job.relocationAssistance && (
                    <div className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-success" aria-hidden="true" />
                      <div>
                        <p className="font-medium text-fg">{tp("discover.detail.relocationTitle")}</p>
                        <p className="text-sm text-fg-secondary">{tp("discover.detail.relocationBody")}</p>
                      </div>
                    </div>
                  )}
                </div>
                {job.eligibleCountries && job.eligibleCountries.length > 0 && (
                  <div className="mt-3 border-t border-info-line pt-3">
                    <p className="mb-2 text-sm font-medium text-fg-secondary">{tp("discover.detail.eligibleCountries")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {job.eligibleCountries.map((country) => (
                        <span
                          key={country}
                          className="rounded border border-line bg-surface px-2 py-0.5 text-xs font-medium text-fg-secondary"
                        >
                          {country}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            <JobFitPanel jobTags={job.tags} />

            {/* 4. Trust & signals (collapsed by default; the header already carries the top cues) */}
            {hasTrustSignals && (
              <details className="group mb-2 rounded-2xl border border-line bg-surface-sunken px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded font-semibold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  <span>{tp("discover.detail.signals")}</span>
                  <svg className="h-4 w-4 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>

                {job.discovery && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-fg-secondary">
                      {tp("discover.detail.signalQuality")}
                    </h3>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                      {[
                        [tp("discover.detail.freshness"), label(job.discovery.freshnessLabel)],
                        [tp("discover.detail.quality"), label(job.discovery.qualityLabel)],
                        [
                          tp("discover.detail.salaryClarity"),
                          job.discovery.salaryTransparent ? tp("discover.detail.disclosed") : tp("discover.detail.notDisclosed"),
                        ],
                        [
                          tp("discover.detail.applicationPath"),
                          job.discovery.validApplicationPath ? tp("discover.detail.verified") : tp("discover.detail.needsCaution"),
                        ],
                      ].map(([term, value]) => (
                        <div key={term} className="rounded-xl bg-surface px-4 py-3">
                          <dt className="text-xs font-medium text-fg-muted">{term}</dt>
                          <dd className="mt-1 text-base font-semibold text-fg">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {job.rankingExplanation?.summary && (
                      <p className="mt-4 text-sm text-fg-secondary">
                        {tp("discover.detail.whyRanks", { summary: job.rankingExplanation.summary })}
                      </p>
                    )}
                  </div>
                )}

                {trustReasons.length > 0 && (
                  <div className="mt-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-fg">{tp("discover.detail.trustedTitle")}</h3>
                        <p className="mt-1 text-sm leading-6 text-fg-secondary">{tp("discover.detail.trustedBody")}</p>
                      </div>
                      <TrustExplainerModal
                        title={tp("discover.detail.credibleTitle")}
                        description={tp("discover.detail.credibleBody")}
                        items={trustReasons}
                        triggerLabel={tp("discover.detail.breakdown")}
                      />
                    </div>
                    <div className="mt-3 space-y-3">
                      {trustReasons.map((reason) => (
                        <div key={reason.title} className="rounded-2xl bg-surface px-4 py-3">
                          <p className="font-medium text-fg">{reason.title}</p>
                          <p className="mt-1 text-sm text-fg-secondary">{reason.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </details>
            )}
          </article>
        </div>

        <aside className="lg:col-span-1">
          <JobApplyPanel job={job} />
          <div className="mt-6">
            <TrustSupportCard
              reportHref={`${localizePath("/trust/report", locale)}?targetJobId=${job.id}`}
              title={tp("discover.detail.offTitle")}
              description={tp("discover.detail.offBody")}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
