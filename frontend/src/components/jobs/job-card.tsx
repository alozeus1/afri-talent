"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Job, TrustRiskLevel, savedJobs } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrustBadge } from "@/components/trust/trust-badge";
import { africaPill } from "@/lib/job-trust-labels";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { formatSalaryRange } from "@/lib/salary";
import { jobDiscoveryEvents } from "@/lib/analytics";
import { formatPostedShort } from "@/lib/posted-age";
import { MapPin, Briefcase, Globe, Plane, Heart, Clock } from "lucide-react";
import { Coachmark } from "@/components/ui/coachmark";

interface JobCardProps {
  job: Job;
  /** Saved state from a single savedJobs.ids() call made by the parent list. */
  initialSaved?: boolean;
}

type CardBadge = {
  key: string;
  label: string;
  variant: "success" | "info" | "warning" | "danger";
  riskLevel?: TrustRiskLevel;
  coachmark?: { title: string; description: string };
};

const MAX_TRUST_BADGES = 2;

/**
 * Fixed priority so a card shows at most two trust badges plus one caution
 * badge. The detail page carries the full trust breakdown.
 */
export function selectCardBadges(job: Job): { trust: CardBadge[]; caution: CardBadge | null } {
  const africa = africaPill(job);
  const trustCandidates: Array<CardBadge | null> = [
    job.hiresFromAfrica
      ? {
          key: "hires-from-africa",
          label: "Hires from Africa",
          variant: "success",
          coachmark: {
            title: "Hires from Africa",
            description:
              "This role is verified as open to applicants based in Africa — located in Africa, remote-worldwide, or offering visa sponsorship.",
          },
        }
      : null,
    africa && africa.variant !== "warning"
      ? { key: "africa", label: africa.label, variant: africa.variant === "success" ? "success" : "info" }
      : null,
    job.employer?.trust
      ? {
          key: "employer-trust",
          label: job.employer.trust.badge,
          riskLevel: job.employer.trust.riskLevel,
          variant: "success",
          coachmark: {
            title: "Verified Trust Standard",
            description:
              "This employer has passed strict vetting criteria to ensure a transparent and credible hiring process for global talent.",
          },
        }
      : null,
    job.discovery?.trustedJob ? { key: "trusted", label: "Trusted job", variant: "success" } : null,
    job.trust?.companyReviewed ? { key: "company-reviewed", label: "Company reviewed", variant: "info" } : null,
    job.trust?.jobQualityChecked ? { key: "quality", label: "Job quality checked", variant: "success" } : null,
    job.discovery?.sourceVerification === "DIRECT_EMPLOYER"
      ? { key: "direct", label: "Direct employer source", variant: "success" }
      : null,
    job.discovery?.sourceVerification === "ATS_PRIMARY"
      ? { key: "ats", label: "Verified ATS path", variant: "info" }
      : null,
  ];

  const cautionCandidates: Array<CardBadge | null> = [
    job.isExpired ? { key: "expired", label: "Expired", variant: "danger" } : null,
    africa && africa.variant === "warning" ? { key: "africa", label: africa.label, variant: "warning" } : null,
    job.trust?.newEmployerCaution
      ? { key: "new-employer", label: "New employer review", variant: "warning", riskLevel: "MEDIUM" }
      : null,
  ];

  return {
    trust: trustCandidates.filter((badge): badge is CardBadge => badge !== null).slice(0, MAX_TRUST_BADGES),
    caution: cautionCandidates.find((badge): badge is CardBadge => badge !== null) ?? null,
  };
}

export function JobCard({ job, initialSaved = false }: JobCardProps) {
  const locale = useLocale();
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [isSaving, setIsSaving] = useState(false);
  // Relative dates depend on "now", so compute after mount to keep server and
  // client markup identical (no hydration mismatch).
  const [postedLabel, setPostedLabel] = useState<string | null>(null);
  const tags = Array.isArray(job.tags) ? job.tags : [];
  const salary = formatSalaryRange({
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    salaryPeriod: job.salaryPeriod,
  });
  const freshnessLabel = job.discovery?.freshnessLabel?.toLowerCase() ?? null;
  const discoverySummary = job.rankingExplanation?.summary || job.trust?.guidance;
  const companyName = job.employer?.companyName || job.sourceName || null;
  const { trust: trustBadges, caution: cautionBadge } = selectCardBadges(job);
  const cardBadges = cautionBadge ? [...trustBadges, cautionBadge] : trustBadges;

  useEffect(() => {
    setIsSaved(initialSaved);
  }, [initialSaved]);

  useEffect(() => {
    setPostedLabel(formatPostedShort(job.publishedAt || job.createdAt));
  }, [job.publishedAt, job.createdAt]);

  const toggleSaved = async () => {
    if (isSaving) return;
    const next = !isSaved;
    setIsSaving(true);
    setIsSaved(next); // optimistic
    try {
      if (next) {
        await savedJobs.save(job.id);
      } else {
        await savedJobs.unsave(job.id);
      }
    } catch (err) {
      setIsSaved(!next); // roll back
      if ((err as { status?: number })?.status === 401) {
        const current = `${window.location.pathname}${window.location.search}`;
        window.location.assign(
          localizePath(`/login?redirect=${encodeURIComponent(current)}`, locale),
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Link
      href={localizePath(`/jobs/${job.slug}`, locale)}
      className="group block h-full"
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
      <Card className="isolate h-full cursor-pointer transition-all duration-300 border border-[var(--border-soft)] bg-white dark:bg-zinc-950 hover:bg-gradient-to-br hover:from-white hover:to-emerald-50/50 dark:hover:from-zinc-950 dark:hover:to-emerald-950/20 group-hover:-translate-y-1 hover:border-emerald-300 dark:hover:border-emerald-700 shadow-sm hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/0 to-emerald-500/0 group-hover:via-emerald-500/5 transition-all duration-500 rounded-xl pointer-events-none" />
        <CardContent className="relative z-10 flex h-full flex-col p-6">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1 pr-4">
              <h3 className="font-display text-lg font-bold text-gray-900 dark:text-gray-100 mb-1 line-clamp-2">
                {job.title}
              </h3>
              {companyName && (
                <p className="font-medium text-emerald-700 dark:text-emerald-300">{companyName}</p>
              )}
              {cardBadges.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {cardBadges.map((badge) =>
                    badge.coachmark ? (
                      <Coachmark
                        key={badge.key}
                        title={badge.coachmark.title}
                        description={badge.coachmark.description}
                      >
                        <TrustBadge label={badge.label} riskLevel={badge.riskLevel} variant={badge.variant} />
                      </Coachmark>
                    ) : (
                      <TrustBadge
                        key={badge.key}
                        label={badge.label}
                        riskLevel={badge.riskLevel}
                        variant={badge.variant}
                      />
                    ),
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void toggleSaved();
                }}
                disabled={isSaving}
                className={`p-2 rounded-full transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-70 ${
                  isSaved 
                    ? "bg-rose-50 text-rose-500 shadow-sm ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/30"
                    : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:bg-zinc-800/50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                }`}
                aria-pressed={isSaved}
                aria-label={isSaved ? "Remove saved job" : "Save job"}
              >
                <Heart className={`w-5 h-5 transition-transform duration-300 ${isSaved ? "fill-current scale-110" : "scale-100 active:scale-90"}`} />
              </button>
              <Badge variant="success">{job.type}</Badge>
              {job.jobField && <Badge variant="default">{job.jobField}</Badge>}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mb-4">
            <span className="inline-flex items-center text-sm font-medium text-gray-600 dark:text-gray-300">
              <MapPin className="w-4 h-4 mr-1.5 text-emerald-600 dark:text-emerald-400" />
              {job.workplaceType ? `${job.location} · ${job.workplaceType.toLowerCase()}` : job.location}
            </span>
            <span className="inline-flex items-center text-sm font-medium text-gray-600 dark:text-gray-300">
              <Briefcase className="w-4 h-4 mr-1.5 text-emerald-600 dark:text-emerald-400" />
              {job.seniority}
            </span>
          </div>

          {salary && (
            <p className="mb-4 font-display text-lg font-bold text-gray-900 dark:text-gray-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors duration-200">{salary}</p>
          )}

          {job.discovery && (
            <div className="mb-4 flex flex-wrap gap-2">
              {job.discovery.freshnessLabel && job.discovery.freshnessLabel !== "ACTIVE" && freshnessLabel && (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {freshnessLabel}
                </span>
              )}
              {job.discovery.salaryTransparent && (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Salary disclosed
                </span>
              )}
              {job.discovery.verifiedApplyPath && job.discovery.applyPathType === "ATS" && (
                <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-900/30 dark:text-indigo-300">
                  Direct ATS apply
                </span>
              )}
              {job.discovery.deliveryModel === "ON_PLATFORM" && (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-900/30 dark:text-emerald-300">
                  Apply on AfriTalent
                </span>
              )}
            </div>
          )}

          {discoverySummary && (
            <p className="mb-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {discoverySummary}
            </p>
          )}

          {(job.visaSponsorship === "YES" || job.relocationAssistance) && (
            <div className="flex flex-wrap gap-2 mb-3">
              {job.visaSponsorship === "YES" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50/80 border border-blue-100 dark:border-blue-900/50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold shadow-sm">
                  <Globe className="w-3.5 h-3.5" />
                  Visa Sponsored
                </span>
              )}
              {job.relocationAssistance && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50/80 border border-purple-100 dark:border-purple-900/50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-semibold shadow-sm">
                  <Plane className="w-3.5 h-3.5" />
                  Relocation Support
                </span>
              )}
            </div>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="default">
                  {tag}
                </Badge>
              ))}
              {tags.length > 3 && (
                <Badge variant="default">+{tags.length - 3}</Badge>
              )}
            </div>
          )}

          <div className="mt-auto" />

          <div className="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-zinc-800/60 pt-4">
            <span className="flex items-center gap-1.5 font-medium">
              <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {job.discovery?.verifiedApplyPath ? "Verified application path" : "External listing, verify before applying"}
            </span>
            <span className="flex items-center gap-2">
              {job.discovery?.sourceCount && job.discovery.sourceCount > 1 ? (
                <span>Cross-checked x{job.discovery.sourceCount}</span>
              ) : null}
              {postedLabel && (
                <span className="inline-flex items-center gap-1" data-testid="job-card-posted">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {postedLabel}
                </span>
              )}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
