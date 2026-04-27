"use client";

import { useState } from "react";
import Link from "next/link";
import { Job } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrustBadge } from "@/components/trust/trust-badge";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { formatSalaryRange } from "@/lib/salary";
import { jobDiscoveryEvents } from "@/lib/analytics";
import { MapPin, Briefcase, Globe, Plane, Heart } from "lucide-react";
import { Coachmark } from "@/components/ui/coachmark";

interface JobCardProps {
  job: Job;
}

export function JobCard({ job }: JobCardProps) {
  const locale = useLocale();
  const [isSaved, setIsSaved] = useState(false);
  const tags = Array.isArray(job.tags) ? job.tags : [];
  const salary = formatSalaryRange({
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    salaryPeriod: job.salaryPeriod,
  });
  const freshnessLabel = job.discovery?.freshnessLabel?.toLowerCase() ?? null;
  const discoverySummary = job.rankingExplanation?.summary || job.trust?.guidance;
  const lastSeenText = job.discovery?.lastSeenAt
    ? new Date(job.discovery.lastSeenAt).toLocaleDateString()
    : null;
  const trustReasons = [
    job.employer?.trust?.badge,
    job.trust?.companyReviewed ? "Company reviewed" : null,
    job.trust?.jobQualityChecked ? "Job quality checked" : null,
    job.discovery?.salaryTransparent ? "Salary disclosed" : null,
    job.discovery?.sourceVerification === "ATS_PRIMARY" ? "Primary ATS source" : null,
    job.discovery?.sourceVerification === "DIRECT_EMPLOYER" ? "Direct employer posting" : null,
    job.discovery?.sourceCount && job.discovery.sourceCount > 1
      ? `Cross-checked across ${job.discovery.sourceCount} sources`
      : null,
  ].filter(Boolean) as string[];

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
      <Card className="isolate h-full cursor-pointer transition-all duration-300 border border-[var(--border-soft)] bg-white dark:bg-zinc-950 hover:bg-gradient-to-br hover:from-white hover:to-emerald-50/50 dark:hover:from-zinc-950 dark:hover:to-emerald-950/20 group-hover:-translate-y-1 hover:border-emerald-300 dark:hover:border-emerald-700 shadow-sm hover:shadow-[0_28px_72px_rgba(16,185,129,0.12)] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/0 to-emerald-500/0 group-hover:via-emerald-500/5 transition-all duration-500 rounded-xl pointer-events-none" />
        <CardContent className="relative z-10 flex h-full flex-col p-6">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1 pr-4">
              <h3 className="font-display text-lg font-bold text-gray-900 dark:text-gray-100 mb-1 line-clamp-2">
                {job.title}
              </h3>
              <p className="font-medium text-emerald-700 dark:text-emerald-300">
                {job.employer?.companyName || job.sourceName || "Unknown"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {job.employer?.trust && (
                  <Coachmark 
                    title="Verified Trust Standard" 
                    description="This employer has passed strict vetting criteria to ensure a transparent and credible hiring process for global talent."
                  >
                    <TrustBadge
                      label={job.employer.trust.badge}
                      riskLevel={job.employer.trust.riskLevel}
                      variant="success"
                    />
                  </Coachmark>
                )}
                {job.trust?.companyReviewed && (
                  <TrustBadge label="Company reviewed" variant="info" />
                )}
                {job.trust?.jobQualityChecked && (
                  <TrustBadge label="Job quality checked" variant="success" />
                )}
                {job.trust?.newEmployerCaution && (
                  <span className="animate-pulse inline-block">
                    <TrustBadge label="New employer review" riskLevel="MEDIUM" variant="warning" />
                  </span>
                )}
                {job.discovery?.trustedJob && (
                  <TrustBadge label="Trusted job" variant="success" />
                )}
                {job.discovery?.sourceVerification === "DIRECT_EMPLOYER" && (
                  <TrustBadge label="Direct employer source" variant="success" />
                )}
                {job.discovery?.sourceVerification === "ATS_PRIMARY" && (
                  <TrustBadge label="Verified ATS path" variant="info" />
                )}
                {job.discovery?.sourceCount && job.discovery.sourceCount > 1 && (
                  <TrustBadge label={`Cross-checked x${job.discovery.sourceCount}`} variant="info" />
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsSaved(!isSaved);
                }}
                className={`p-2 rounded-full transition-all duration-300 ${
                  isSaved 
                    ? "bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400" 
                    : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:bg-zinc-800/50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                }`}
                aria-label={isSaved ? "Remove from saved jobs" : "Save job"}
              >
                <Heart className={`w-5 h-5 transition-transform duration-300 ${isSaved ? "fill-current scale-110" : "scale-100 active:scale-90"}`} />
              </button>
              <Badge variant="success">{job.type}</Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mb-4">
            <span className="inline-flex items-center text-sm font-medium text-gray-600 dark:text-gray-300">
              <MapPin className="w-4 h-4 mr-1.5 text-emerald-600 dark:text-emerald-400" />
              {job.location}
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
              {job.discovery.visaClear && job.visaSponsorship === "YES" && (
                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:border-blue-500/20 dark:bg-blue-900/30 dark:text-blue-300">
                  Visa clarified
                </span>
              )}
            </div>
          )}

          {discoverySummary && (
            <p className="mb-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
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
              {job.title.length * 12 + 45} people viewed this
            </span>
            {job.discovery?.sourceCount && job.discovery.sourceCount > 1 && (
              <span>Cross-checked x{job.discovery.sourceCount}{lastSeenText && ` • ${lastSeenText}`}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
