"use client";

// Saved jobs — candidate bookmarks list (roadmap Phase 2/D).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, MapPin } from "lucide-react";
import { savedJobs, SavedJobItem, Job } from "@/lib/api";
import { africaPill } from "@/lib/job-trust-labels";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { JobListSkeleton } from "@/components/ui/skeleton";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidateNotice,
  CandidatePageHeader,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { enumLabel, useCandidateFormatters, useCandidateT } from "@/lib/i18n/candidate-messages";

export default function SavedJobsPage() {
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const [items, setItems] = useState<SavedJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [removeFailed, setRemoveFailed] = useState(false);

  const href = (path: string) => localizePath(path, locale);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    savedJobs
      .list()
      .then((data) => setItems(data.saved))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unsave = async (jobId: string) => {
    setRemoveFailed(false);
    setItems((prev) => prev.filter((i) => i.job.id !== jobId));
    try {
      await savedJobs.unsave(jobId);
    } catch {
      setRemoveFailed(true);
      // refetch to restore accurate state on failure
      savedJobs
        .list()
        .then((data) => setItems(data.saved))
        .catch(() => {});
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-12">
      <CandidateBackLink href={href("/candidate")}>{t("nav.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader
        title={t("savedJobs.title")}
        description={t("savedJobs.subtitle")}
        actions={
          !loading && !error && items.length > 0 ? (
            <Badge variant="default">{t("savedJobs.count", { count: fmt.number(items.length) })}</Badge>
          ) : null
        }
      />

      {removeFailed ? (
        <CandidateNotice className="mb-4">{t("savedJobs.removeFailed")}</CandidateNotice>
      ) : null}

      {loading ? (
        <JobListSkeleton count={3} />
      ) : error ? (
        <CandidateLoadError error={error} subject={t("ui.subject.savedJobs")} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bookmark className="h-6 w-6" />}
          title={t("savedJobs.emptyTitle")}
          description={t("savedJobs.emptyBody")}
          primaryAction={{ label: t("dash.browseJobs"), href: href("/jobs") }}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const pill = africaPill(item.job as unknown as Job);
            return (
              <li key={item.id}>
                <Card className={item.job.isExpired ? "opacity-70" : "transition hover:border-line-strong hover:shadow-card"}>
                  <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link
                        href={href(`/jobs/${item.job.slug}`)}
                        className="font-semibold text-fg hover:text-primary-text"
                      >
                        {item.job.title}
                      </Link>
                      <p className="text-sm font-medium text-primary-text">
                        {item.job.employer?.companyName ?? item.job.sourceName ?? t("savedJobs.company")}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                        {item.job.location ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            {item.job.location}
                          </span>
                        ) : null}
                        {item.job.type ? <span>{enumLabel(t, "jobType", item.job.type)}</span> : null}
                        {item.job.hiresFromAfrica && <Badge variant="success">{t("savedJobs.hiresFromAfrica")}</Badge>}
                        {pill ? <Badge variant={pill.variant}>{pill.label}</Badge> : null}
                        {item.job.isExpired && <Badge variant="warning">{t("savedJobs.expired")}</Badge>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link href={href(`/jobs/${item.job.slug}`)}>
                        <Button size="sm" variant="outline">
                          {t("savedJobs.view")}
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unsave(item.job.id)}
                        aria-label={t("savedJobs.removeLabel", { title: item.job.title })}
                      >
                        {t("savedJobs.remove")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
