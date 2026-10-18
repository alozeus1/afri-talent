"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Job, savedJobs } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { africaPill } from "@/lib/job-trust-labels";
import { jobSourceDisplayName } from "@/lib/job-source";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { formatSalaryRange } from "@/lib/salary";
import { SalaryText } from "@/components/jobs/salary-text";
import { jobDiscoveryEvents } from "@/lib/analytics";
import { formatPostedShort } from "@/lib/posted-age";
import { MapPin, Briefcase, Heart, Clock } from "lucide-react";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";
import { usePublicLabel, useLocationLabel } from "@/lib/i18n/public-labels";

interface JobCardProps {
  job: Job;
  /** Saved state from a single savedJobs.ids() call made by the parent list. */
  initialSaved?: boolean;
}

export type CardSignal = {
  key: string;
  messageKey: PublicMessageKey;
  variant: "success" | "info" | "warning" | "danger";
};

/** At most three signals per card; the disclosed salary counts as one. */
export const MAX_CARD_SIGNALS = 3;

/**
 * Picks the few signals a list card shows, in a fixed priority:
 * a caution (expired, region-restricted, new employer) always wins a slot,
 * then the Africa-mobility signal (Hires from Africa > visa > open to
 * Africa), then freshness, then trust, then relocation. A disclosed salary
 * is rendered as its own line and takes one of the three slots. The detail
 * page carries the full trust breakdown.
 */
export function selectCardSignals(job: Job, options: { hasSalary: boolean }): CardSignal[] {
  const africa = africaPill(job);
  const freshness = job.discovery?.freshnessLabel;

  const caution: CardSignal | null = job.isExpired || freshness === "EXPIRED"
    ? { key: "expired", messageKey: "discover.badge.expired", variant: "danger" }
    : africa?.variant === "warning"
      ? { key: "africa", messageKey: "discover.label.regionRestricted", variant: "warning" }
      : job.trust?.newEmployerCaution
        ? { key: "new-employer", messageKey: "discover.badge.newEmployer", variant: "warning" }
        : null;

  const mobility: CardSignal | null = job.hiresFromAfrica
    ? { key: "hires-from-africa", messageKey: "discover.badge.hiresFromAfrica", variant: "success" }
    : job.visaSponsorship === "YES"
      ? { key: "visa", messageKey: "discover.card.visa", variant: "info" }
      : africa?.variant === "success"
        ? { key: "africa", messageKey: "discover.label.openToAfrica", variant: "success" }
        : africa?.variant === "info"
          ? { key: "africa", messageKey: "discover.label.possiblyOpen", variant: "info" }
          : null;

  const fresh: CardSignal | null =
    !job.isExpired && (freshness === "FRESH" || freshness === "RECENT")
      ? { key: "fresh", messageKey: "discover.card.newListing", variant: "info" }
      : null;

  const trusted: CardSignal | null =
    job.discovery?.trustedJob || job.employer?.trust
      ? { key: "trusted", messageKey: "discover.badge.trustedJob", variant: "success" }
      : null;

  const relocation: CardSignal | null = job.relocationAssistance
    ? { key: "relocation", messageKey: "discover.card.relocation", variant: "info" }
    : null;

  const slots = MAX_CARD_SIGNALS - (options.hasSalary ? 1 : 0);
  return [caution, mobility, fresh, trusted, relocation]
    .filter((signal): signal is CardSignal => signal !== null)
    .slice(0, slots);
}

export function JobCard({ job, initialSaved = false }: JobCardProps) {
  const locale = useLocale();
  const locationLabel = useLocationLabel();
  const tp = usePublicT();
  const label = usePublicLabel();
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [isSaving, setIsSaving] = useState(false);
  // Relative dates depend on "now", so compute after mount to keep server and
  // client markup identical (no hydration mismatch).
  const [postedLabel, setPostedLabel] = useState<string | null>(null);
  const salary = formatSalaryRange({
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    salaryPeriod: job.salaryPeriod,
  });
  const companyName = job.employer?.companyName || job.sourceName || null;
  const sourceName = jobSourceDisplayName(job);
  const signals = selectCardSignals(job, { hasSalary: Boolean(salary) });
  const place = locationLabel(job.location, { compact: true });
  const workplace = job.workplaceType ? label(job.workplaceType) : "";
  // Skip the workplace suffix when the place already says it ("Remote (CET ±3h)").
  const locationLine =
    workplace && !place.toLocaleLowerCase(locale).includes(workplace.toLocaleLowerCase(locale))
      ? [place, workplace].filter(Boolean).join(" · ")
      : place || workplace;
  const roleLine = [job.type ? label(job.type) : null, job.seniority ? label(job.seniority) : null]
    .filter(Boolean)
    .join(" · ");

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
      className="group block h-full rounded-2xl focus-visible:outline-none"
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
      <Card className="relative h-full cursor-pointer border border-line bg-surface shadow-xs transition-[transform,box-shadow,border-color] duration-200 group-hover:-translate-y-0.5 group-hover:border-line-strong group-hover:shadow-raised group-focus-visible:ring-2 group-focus-visible:ring-focus motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold leading-snug text-fg line-clamp-2 group-hover:text-primary-text">
                {job.title}
              </h3>
              {companyName && (
                <p className="mt-1 truncate text-sm font-medium text-fg-secondary">{companyName}</p>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void toggleSaved();
              }}
              disabled={isSaving}
              className={`-me-1 -mt-1 shrink-0 rounded-full p-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-70 ${
                isSaved
                  ? "bg-rose-50 text-rose-600 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30"
                  : "text-fg-muted hover:bg-surface-muted hover:text-fg"
              }`}
              aria-pressed={isSaved}
              aria-label={isSaved ? tp("discover.card.unsave") : tp("discover.card.save")}
            >
              <Heart aria-hidden="true" className={`h-5 w-5 ${isSaved ? "fill-current" : ""}`} />
            </button>
          </div>

          <div className="space-y-1 text-sm text-fg-secondary">
            <p className="flex min-w-0 items-center gap-1.5">
              <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-muted" />
              <span className="truncate">{locationLine}</span>
            </p>
            {roleLine && (
              <p className="flex min-w-0 items-center gap-1.5">
                <Briefcase aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-muted" />
                <span className="truncate">{roleLine}</span>
              </p>
            )}
          </div>

          {salary && (
            <p className="font-display text-base font-semibold tabular-nums text-fg">
              <SalaryText salary={job} />
            </p>
          )}

          {signals.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid="job-card-signals">
              {signals.map((signal) => (
                <Badge key={signal.key} variant={signal.variant}>
                  {tp(signal.messageKey)}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-xs text-fg-muted">
            {sourceName ? (
              <span data-testid="job-source-badge" className="truncate font-medium">
                {tp("discover.card.via", { source: sourceName })}
              </span>
            ) : job.discovery?.deliveryModel === "ON_PLATFORM" ? (
              <span className="truncate font-medium text-primary-text">{tp("discover.label.applyOnAfriTalent")}</span>
            ) : (
              <span />
            )}
            {postedLabel && (
              <span className="inline-flex shrink-0 items-center gap-1" data-testid="job-card-posted">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {label(postedLabel)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
