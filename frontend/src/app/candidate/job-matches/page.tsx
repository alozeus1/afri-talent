"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, MapPin, RefreshCw, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { skills, JobMatch, ApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JobListSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { FREE_MODE } from "@/lib/free-mode";
import {
  CandidateBackLink,
  CandidateErrorAlert,
  CandidateNotice,
  CandidatePageHeader,
  toCandidateFriendly,
  type CandidateFriendlyError,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { enumLabel, useCandidateT } from "@/lib/i18n/candidate-messages";
import { useLocationLabel } from "@/lib/i18n/public-labels";

const scoreVariant = (score: number): "success" | "info" | "warning" | "default" => {
  if (score >= 80) return "success";
  if (score >= 60) return "info";
  if (score >= 40) return "warning";
  return "default";
};

const qualityVariant = (label?: string): "success" | "info" | "warning" | "default" => {
  if (label === "TRUSTED") return "success";
  if (label === "SOLID") return "info";
  if (label === "REVIEW") return "warning";
  return "default";
};

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
        active ? "border-success-line bg-primary-soft text-primary-text" : "border-line-strong text-fg-secondary hover:bg-surface-muted"
      }`}
    >
      {children}
    </button>
  );
}

export default function JobMatchesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const locationLabel = useLocationLabel();
  const locale = useLocale();
  const t = useCandidateT();

  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [embedding, setEmbedding] = useState(false);
  const [error, setError] = useState<CandidateFriendlyError | null>(null);
  const [embedState, setEmbedState] = useState<"ok" | "failed" | null>(null);
  const [filterVisa, setFilterVisa] = useState(false);
  const [filterRemote, setFilterRemote] = useState(false);

  const href = (path: string) => localizePath(path, locale);

  const filteredMatches = matches.filter((m) => {
    if (filterVisa && m.visaSponsorship !== "YES") return false;
    if (filterRemote && !m.location?.toLowerCase().includes("remote")) return false;
    return true;
  });

  const loadMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await skills.getJobMatches(10);
      setMatches(data.matches);
    } catch (err) {
      // No saved resume yet is the normal first-visit state, not an error:
      // fall through to the "Build your resume" empty state.
      if (err instanceof ApiError && err.code === "NO_RESUME") {
        setMatches([]);
      } else {
        setError(toCandidateFriendly(err, t));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(localizePath("/login", locale));
      return;
    }
    void loadMatches();
  }, [user, authLoading, router, locale, loadMatches]);

  async function handleReEmbed() {
    setEmbedding(true);
    setEmbedState(null);
    try {
      await skills.embedResume();
      setEmbedState("ok");
      await loadMatches();
    } catch {
      setEmbedState("failed");
    } finally {
      setEmbedding(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-12">
      <CandidateBackLink href={href("/candidate")}>{t("ai.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader
        title={t("jm.title")}
        description={FREE_MODE ? t("jm.subtitle") : t("jm.subtitlePaid")}
        actions={
          <Button variant="outline" onClick={handleReEmbed} disabled={embedding}>
            <RefreshCw className={`h-4 w-4 ${embedding ? "animate-spin" : ""}`} aria-hidden="true" />
            {embedding ? t("jm.refreshing") : t("jm.refresh")}
          </Button>
        }
      />

      <div role="group" aria-label={t("jm.filters")} className="mb-6 flex flex-wrap items-center gap-2">
        <FilterChip active={filterVisa} onClick={() => setFilterVisa(!filterVisa)}>
          {t("jm.filter.visa")}
        </FilterChip>
        <FilterChip active={filterRemote} onClick={() => setFilterRemote(!filterRemote)}>
          {t("jm.filter.remote")}
        </FilterChip>
      </div>

      <div className="space-y-6">
        {error && (
          <CandidateErrorAlert error={error} testId="job-matches-error">
            {error.tone === "warning" && !FREE_MODE && (
              <Link href={href("/pricing")} className="mt-2 inline-block text-sm font-semibold text-primary-text hover:underline">
                {t("jm.seePlans")}
              </Link>
            )}
          </CandidateErrorAlert>
        )}

        {embedState && (
          <CandidateNotice tone={embedState === "ok" ? "success" : "warning"}>
            {embedState === "ok" ? t("jm.refreshed") : t("jm.refreshFailed")}
          </CandidateNotice>
        )}

        {loading ? (
          <JobListSkeleton count={4} />
        ) : filteredMatches.length === 0 && !error ? (
          matches.length > 0 ? (
            <EmptyState
              testId="job-matches-empty-filtered"
              title={t("jm.emptyFiltered.title")}
              description={t("jm.emptyFiltered.body")}
              primaryAction={{
                label: t("jm.clearFilters"),
                onClick: () => {
                  setFilterVisa(false);
                  setFilterRemote(false);
                },
              }}
            />
          ) : (
            <EmptyState
              testId="job-matches-empty"
              icon={<Sparkles className="h-6 w-6" />}
              title={t("jm.empty.title")}
              description={t("jm.empty.body")}
              primaryAction={{ label: t("jm.empty.build"), href: href("/candidate/resume-builder") }}
              secondaryAction={{ label: t("jm.refresh"), onClick: () => void handleReEmbed() }}
            />
          )
        ) : (
          <ul className="space-y-3">
            {filteredMatches.map((match) => (
              <li key={match.jobId}>
                <Card data-testid="job-match-card" className="transition hover:border-line-strong hover:shadow-card">
                  <CardContent className="px-5 py-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <Link href={href(`/jobs/${match.slug}`)} className="block truncate font-semibold text-fg hover:text-primary-text">
                          {match.title}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-sm text-fg-muted">
                          <span>{match.company}</span>
                          {match.location ? (
                            <span className="inline-flex items-center gap-1">
                              · <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                              {locationLabel(match.location)}
                            </span>
                          ) : null}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {match.type ? <Badge variant="default">{enumLabel(t, "jobType", match.type)}</Badge> : null}
                          {match.seniority ? <Badge variant="default">{enumLabel(t, "jm.seniority", match.seniority)}</Badge> : null}
                          {match.matchMethod === "vector" && <Badge variant="info">{t("jm.semantic")}</Badge>}
                          {match.verifiedEmployer && (
                            <Badge variant="success" data-testid="verified-employer-badge" className="gap-1">
                              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              {t("jm.verifiedEmployer")}
                            </Badge>
                          )}
                          {match.riskLevel && (match.riskLevel === "HIGH" || match.riskLevel === "CRITICAL") && (
                            <Badge variant="danger">{t("jm.risk", { level: enumLabel(t, "jm.risk", match.riskLevel) })}</Badge>
                          )}
                          {match.qualityLabel && (
                            <Badge variant={qualityVariant(match.qualityLabel)}>{enumLabel(t, "jm.quality", match.qualityLabel)}</Badge>
                          )}
                          {match.visaSponsorship === "YES" && <Badge variant="success">{t("jm.visaOk")}</Badge>}
                        </div>
                        {match.explanation && (
                          <p className="mt-3 text-sm leading-6 text-fg-secondary" data-testid="match-explanation">
                            {match.explanation}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                        <Badge variant={scoreVariant(match.score)} className="text-sm tabular-nums">
                          {t("jm.score", { score: match.score })}
                        </Badge>
                        <Link href={href(`/jobs/${match.slug}`)}>
                          <Button size="sm">{t("jm.viewJob")}</Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
