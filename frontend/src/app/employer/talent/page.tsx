"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  TalentProfile,
  TalentPool,
  TalentComparisonResponse,
  talent,
  TalentSearchResponse,
} from "@/lib/api";
import { employerOnboardingEvents } from "@/lib/analytics";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrustBadge } from "@/components/trust/trust-badge";
import { TrustExplainerModal, type TrustExplainerItem } from "@/components/trust/trust-explainer-modal";
import { TrustStatusBanner } from "@/components/trust/trust-status-banner";
import { TrustSupportCard } from "@/components/trust/trust-support-card";
import { MessageCandidateButton } from "@/components/employer/message-candidate-button";
import {
  EmptyPanel,
  Eyebrow,
  Notice,
  PageSpinner,
  Spinner,
  checkboxClass,
  controlClass,
} from "@/components/employer/employer-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useEmployerI18n, type EmployerMessageKey, type EmployerVars } from "@/lib/i18n/employer-messages";
import { FREE_MODE } from "@/lib/free-mode";

const TALENT_STAGES = ["SOURCED", "REVIEWING", "PRIORITY", "CONTACTED"];
const EXPERIENCE_OPTIONS = ["1", "2", "3", "5", "8", "10"];

type T = (key: EmployerMessageKey, vars?: EmployerVars) => string;

/** Match reasons arrive as English sentences; translate the known shapes. */
function translateReason(reason: string, t: T, ts: (text: string) => string): string {
  const semantic = reason.match(/^Strong role-intent match \((\d+)\/100\)\.$/);
  if (semantic) return t("talent.reasonSemantic", { score: semantic[1] });
  const skills = reason.match(/^Skills overlap is high \((\d+)\/100\)\.$/);
  if (skills) return t("talent.reasonSkills", { score: skills[1] });
  return ts(reason);
}

function signalStatus(status: string, t: T): Pick<TrustExplainerItem, "statusLabel" | "statusVariant"> {
  if (status === "verified") return { statusLabel: t("talent.signalVerified"), statusVariant: "success" };
  if (status === "needs_attention") return { statusLabel: t("talent.signalNeedsAttention"), statusVariant: "warning" };
  return { statusLabel: t("talent.signalStrengthening"), statusVariant: "info" };
}

function candidateTrustReasons(candidate: TalentProfile, t: T, ts: (text: string) => string): TrustExplainerItem[] {
  if (candidate.trust?.explainability?.length) {
    return candidate.trust.explainability.slice(0, 3).map((signal) => ({
      title: ts(signal.label),
      description: ts(signal.detail),
      ...signalStatus(signal.status, t),
    }));
  }

  const fallback: TrustExplainerItem[] = [];

  if (candidate.trust?.maskedPhone) {
    fallback.push({
      title: t("talent.phoneTitle"),
      description: t("talent.phoneBody", { phone: candidate.trust.maskedPhone }),
      statusLabel: t("talent.signalVerified"),
      statusVariant: "info",
    });
  }

  if (candidate.verifiedSkills?.length) {
    fallback.push({
      title: t("talent.verifiedSkillsTitle"),
      description:
        candidate.verifiedSkills.length === 1
          ? t("talent.verifiedSkillsBody.one")
          : t("talent.verifiedSkillsBody.other", { count: candidate.verifiedSkills.length }),
      statusLabel: t("talent.evidenceBacked"),
      statusVariant: "success",
    });
  }

  if (candidate.partnerMarkers?.length) {
    fallback.push({
      title: t("talent.partnerTitle"),
      description: t("talent.partnerBody"),
      statusLabel: t("talent.partnerBacked"),
      statusVariant: "info",
    });
  }

  if (candidate.profileCompleteness >= 80) {
    fallback.push({
      title: t("talent.completeTitle"),
      description: t("talent.completeBody"),
      statusLabel: t("talent.highCompleteness"),
      statusVariant: "success",
    });
  }

  return fallback.slice(0, 3);
}

function candidateTrustExplainerItems(candidate: TalentProfile, t: T, ts: (text: string) => string): TrustExplainerItem[] {
  if (candidate.trust?.explainability?.length) {
    return candidate.trust.explainability.map((signal) => ({
      title: ts(signal.label),
      description: ts(signal.detail),
      ...signalStatus(signal.status, t),
    }));
  }
  return candidateTrustReasons(candidate, t, ts);
}

export default function TalentMarketplacePage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { t, tn, tv, ts, fmt } = useEmployerI18n();

  const [data, setData] = useState<TalentSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pools, setPools] = useState<TalentPool[]>([]);
  const [activePoolId, setActivePoolId] = useState<string>("");
  const [poolLoading, setPoolLoading] = useState(true);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<TalentComparisonResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [savingCandidateId, setSavingCandidateId] = useState<string | null>(null);
  const [creatingPool, setCreatingPool] = useState(false);

  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState("");
  const [location, setLocation] = useState("");
  const [minExperience, setMinExperience] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [verifiedSkillsOnly, setVerifiedSkillsOnly] = useState(false);
  const [fullyCompletedOnly, setFullyCompletedOnly] = useState(false);
  const [assessmentBackedOnly, setAssessmentBackedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [newPoolName, setNewPoolName] = useState("");
  const [newPoolDescription, setNewPoolDescription] = useState("");

  const activePool = pools.find((pool) => pool.id === activePoolId) ?? null;
  const hasActiveFilters =
    Boolean(query.trim()) ||
    Boolean(skills.trim()) ||
    Boolean(location.trim()) ||
    Boolean(minExperience) ||
    verifiedOnly ||
    verifiedSkillsOnly ||
    fullyCompletedOnly ||
    assessmentBackedOnly;

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  // Error fallbacks are stored as "" and rendered through t() at paint time,
  // so these callbacks never depend on the active locale.
  const refreshPools = useCallback(async () => {
    if (!user || user.role !== "EMPLOYER") return;
    setPoolLoading(true);
    setPoolError(null);
    try {
      const response = await talent.listPools();
      setPools(response.pools);
      setActivePoolId((current) => {
        if (current && response.pools.some((pool) => pool.id === current)) {
          return current;
        }
        return response.pools[0]?.id ?? "";
      });
    } catch (err) {
      setPoolError(err instanceof Error ? err.message : "");
    } finally {
      setPoolLoading(false);
    }
  }, [user]);

  const fetchTalent = useCallback(async () => {
    if (!user || user.role !== "EMPLOYER") return;
    setLoading(true);
    setError(null);
    try {
      const response = await talent.search({
        query: query || undefined,
        skills: skills || undefined,
        location: location || undefined,
        minExperience: minExperience ? parseInt(minExperience, 10) : undefined,
        page,
        verifiedOnly,
        verifiedSkillsOnly,
        fullyCompletedOnly,
        assessmentBackedOnly,
      }) as TalentSearchResponse;
      setData(response);
      employerOnboardingEvents.talentResultsLoaded({
        results_count: response.pagination.total,
        page,
        verified_only: verifiedOnly,
        verified_skills_only: verifiedSkillsOnly,
        fully_completed_only: fullyCompletedOnly,
        assessment_backed_only: assessmentBackedOnly,
        skills_count: skills
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean).length,
        location: location || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "");
    } finally {
      setLoading(false);
    }
  }, [user, query, skills, location, minExperience, page, verifiedOnly, verifiedSkillsOnly, fullyCompletedOnly, assessmentBackedOnly]);

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
      void refreshPools();
      const debounce = setTimeout(() => {
        void fetchTalent();
      }, 300);
      return () => clearTimeout(debounce);
    }
  }, [fetchTalent, refreshPools, user]);

  const resetFilters = () => {
    setQuery("");
    setSkills("");
    setLocation("");
    setMinExperience("");
    setVerifiedOnly(false);
    setVerifiedSkillsOnly(false);
    setFullyCompletedOnly(false);
    setAssessmentBackedOnly(false);
    setPage(1);
  };

  const toggleCompare = (candidateUserId: string) => {
    setCompareIds((current) => {
      if (current.includes(candidateUserId)) {
        return current.filter((id) => id !== candidateUserId);
      }
      if (current.length >= 4) {
        return current;
      }
      return [...current, candidateUserId];
    });
  };

  const runComparison = async () => {
    if (compareIds.length < 2) return;
    setComparisonLoading(true);
    try {
      const response = await talent.compare({
        candidateIds: compareIds,
        query: query || undefined,
        location: location || undefined,
        minExperience: minExperience ? parseInt(minExperience, 10) : undefined,
        skills: skills || undefined,
      });
      setComparison(response);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("talent.errCompare"));
    } finally {
      setComparisonLoading(false);
    }
  };

  const createPool = async () => {
    if (!newPoolName.trim()) return;
    setCreatingPool(true);
    setPoolError(null);
    try {
      await talent.createPool({
        name: newPoolName.trim(),
        description: newPoolDescription.trim() || undefined,
      });
      setNewPoolName("");
      setNewPoolDescription("");
      await refreshPools();
    } catch (err) {
      setPoolError(err instanceof Error && err.message ? err.message : t("talent.errCreatePool"));
    } finally {
      setCreatingPool(false);
    }
  };

  const saveCandidateToActivePool = async (candidate: TalentProfile) => {
    if (!activePool) {
      setPoolError(t("talent.errNoPool"));
      return;
    }

    setSavingCandidateId(candidate.user.id);
    setPoolError(null);
    try {
      await talent.addCandidateToPool(activePool.id, {
        candidateUserId: candidate.user.id,
        semanticScore: candidate.match.semanticScore,
        trustScoreSnapshot: candidate.match.trustScore,
        mobilityScoreSnapshot: candidate.match.mobilityScore,
      });
      await Promise.all([refreshPools(), fetchTalent()]);
    } catch (err) {
      setPoolError(err instanceof Error && err.message ? err.message : t("talent.errAddToPool"));
    } finally {
      setSavingCandidateId(null);
    }
  };

  const updateCandidateStage = async (candidate: TalentProfile, stage: string) => {
    const membership = candidate.poolMemberships.find((item) => item.poolId === activePoolId);
    if (!membership) {
      return;
    }

    setSavingCandidateId(candidate.user.id);
    setPoolError(null);
    try {
      await talent.updatePoolCandidate(membership.poolId, candidate.user.id, { stage });
      await Promise.all([refreshPools(), fetchTalent()]);
    } catch (err) {
      setPoolError(err instanceof Error && err.message ? err.message : t("talent.errStage"));
    } finally {
      setSavingCandidateId(null);
    }
  };

  if (isLoading || !user) {
    return <PageSpinner />;
  }

  const trustFilters = [
    {
      id: "filter-verified",
      checked: verifiedOnly,
      onChange: setVerifiedOnly,
      title: t("talent.filterVerified"),
      body: FREE_MODE ? t("talent.filterVerifiedBodyFree") : t("talent.filterVerifiedBody"),
    },
    {
      id: "filter-verified-skills",
      checked: verifiedSkillsOnly,
      onChange: setVerifiedSkillsOnly,
      title: t("talent.filterSkills"),
      body: t("talent.filterSkillsBody"),
    },
    {
      id: "filter-assessment",
      checked: assessmentBackedOnly,
      onChange: setAssessmentBackedOnly,
      title: t("talent.filterAssessment"),
      body: t("talent.filterAssessmentBody"),
    },
    {
      id: "filter-complete",
      checked: fullyCompletedOnly,
      onChange: setFullyCompletedOnly,
      title: t("talent.filterComplete"),
      body: t("talent.filterCompleteBody"),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <Eyebrow className="text-primary-text">{t("talent.eyebrow")}</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{t("talent.title")}</h1>
        <p className="mt-3 max-w-3xl text-fg-secondary">{t("talent.subtitle")}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={localizePath("/employer/trust", locale)}>
            <Button variant="outline" size="sm">{t("talent.trustProfile")}</Button>
          </Link>
          <TrustExplainerModal
            title={t("talent.explainerTitle")}
            description={FREE_MODE ? t("talent.explainerBodyFree") : t("talent.explainerBody")}
            items={[
              {
                title: t("talent.explainerVerifiedTitle"),
                description: t("talent.explainerVerifiedBody"),
                statusLabel: t("talent.evidenceRequired"),
                statusVariant: "success",
              },
              {
                title: t("talent.verifiedSkillsTitle"),
                description: t("talent.explainerSkillsBody"),
                statusLabel: t("talent.notSelfClaimed"),
                statusVariant: "success",
              },
              {
                title: t("talent.explainerAssessmentTitle"),
                description: t("talent.explainerAssessmentBody"),
                statusLabel: t("talent.higherConfidence"),
                statusVariant: "info",
              },
            ]}
            triggerLabel={t("talent.explainerTrigger")}
          />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-6">
          <TrustStatusBanner tone="info" title={t("talent.bannerTitle")} body={t("talent.bannerBody")} />

          <Card>
            <CardContent className="p-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_0.8fr]">
                <Input
                  aria-label={t("talent.queryLabel")}
                  placeholder={t("talent.queryPlaceholder")}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                />
                <Input
                  aria-label={t("talent.skillsLabel")}
                  placeholder={t("talent.skillsPlaceholder")}
                  value={skills}
                  onChange={(event) => {
                    setSkills(event.target.value);
                    setPage(1);
                  }}
                />
                <Input
                  aria-label={t("talent.locationLabel")}
                  placeholder={t("talent.locationPlaceholder")}
                  value={location}
                  onChange={(event) => {
                    setLocation(event.target.value);
                    setPage(1);
                  }}
                />
                <select
                  aria-label={t("talent.minExperience")}
                  className={controlClass}
                  value={minExperience}
                  onChange={(event) => {
                    setMinExperience(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{t("talent.minExperience")}</option>
                  {EXPERIENCE_OPTIONS.map((years) => (
                    <option key={years} value={years}>
                      {t("talent.yearsPlus", { years })}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface-sunken p-4 sm:grid-cols-2">
                <legend className="sr-only">{t("talent.trustFiltersLegend")}</legend>
                {trustFilters.map((filter) => (
                  <label
                    key={filter.id}
                    htmlFor={filter.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${
                      filter.checked ? "border-success-line bg-primary-soft" : "border-transparent hover:bg-surface"
                    }`}
                  >
                    <input
                      id={filter.id}
                      type="checkbox"
                      checked={filter.checked}
                      onChange={(event) => {
                        filter.onChange(event.target.checked);
                        setPage(1);
                      }}
                      className={`mt-0.5 ${checkboxClass}`}
                    />
                    <span className="text-fg-secondary">
                      <span className="mb-0.5 block font-semibold text-fg">{filter.title}</span>
                      {filter.body}
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="grid flex-1 gap-3 md:grid-cols-3">
                  {[
                    [t("talent.semanticTitle"), t("talent.semanticBody")],
                    [t("talent.rankingTitle"), t("talent.rankingBody")],
                    [t("talent.mobilityTitle"), t("talent.mobilityBody")],
                  ].map(([title, body]) => (
                    <div key={title}>
                      <Eyebrow className="tracking-[0.14em]">{title}</Eyebrow>
                      <p className="mt-1 text-sm text-fg-secondary">{body}</p>
                    </div>
                  ))}
                </div>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      resetFilters();
                      setComparison(null);
                      setCompareIds([]);
                    }}
                  >
                    {t("talent.clearFilters")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {comparison && (
            <Card className="border-success-line">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Eyebrow className="text-primary-text">{t("talent.comparisonEyebrow")}</Eyebrow>
                    <h2 className="mt-2 text-xl font-semibold text-fg">{t("talent.comparisonTitle")}</h2>
                    <p className="mt-2 max-w-2xl text-sm text-fg-secondary">{ts(comparison.comparison.summary)}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setComparison(null)}>
                    {t("talent.clearComparison")}
                  </Button>
                </div>
                {comparison.comparison.commonSkills.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {comparison.comparison.commonSkills.map((skill) => (
                      <Badge key={skill} variant="default">{skill}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {loading && (
            <div className="flex justify-center py-12">
              <Spinner label={t("talent.searching")} />
            </div>
          )}

          {error !== null && (
            <TrustStatusBanner
              tone="danger"
              title={t("talent.errorTitle")}
              body={error || t("talent.errLoad")}
              actions={
                <Button size="sm" variant="outline" onClick={() => void fetchTalent()}>
                  {t("talent.retry")}
                </Button>
              }
            />
          )}

          {!loading && data && (
            <>
              {data.semantic?.query && (
                <TrustStatusBanner
                  tone="success"
                  title={t("talent.semanticActive", { query: data.semantic.query })}
                  body={t("talent.semanticHits", { count: data.semantic.hitCount })}
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 text-fg-secondary">
                <span className="font-medium text-fg" aria-live="polite">
                  {tn("talent.found", data.pagination.total)}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-fg-muted">{t("talent.selectedForCompare", { count: compareIds.length })}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={compareIds.length < 2 || comparisonLoading}
                    onClick={() => void runComparison()}
                  >
                    {comparisonLoading ? t("talent.comparing") : t("talent.compareSelected")}
                  </Button>
                </div>
              </div>

              {data.candidates.length === 0 ? (
                <EmptyPanel title={t("talent.emptyTitle")} description={t("talent.emptyBody")}>
                  {hasActiveFilters && (
                    <Button variant="outline" onClick={resetFilters}>
                      {t("talent.resetFilters")}
                    </Button>
                  )}
                  <Link href={localizePath("/trust", locale)}>
                    <Button>{t("common.openTrustCenter")}</Button>
                  </Link>
                </EmptyPanel>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  {data.candidates.map((candidate) => {
                    const activeMembership = candidate.poolMemberships.find((membership) => membership.poolId === activePoolId);
                    const selectedForCompare = compareIds.includes(candidate.user.id);
                    const compareId = `compare-${candidate.user.id}`;

                    return (
                      <Card
                        key={candidate.user.id}
                        className={`h-full transition-shadow hover:shadow-raised ${selectedForCompare ? "ring-2 ring-focus" : ""}`}
                      >
                        <CardContent className="flex h-full flex-col p-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-lg font-semibold text-fg">{candidate.user.name}</h3>
                                {candidate.trust && (
                                  <TrustBadge
                                    label={ts(candidate.trust.badge)}
                                    riskLevel={candidate.trust.riskLevel}
                                    variant="success"
                                  />
                                )}
                              </div>
                              {candidate.headline && <p className="mt-1 text-sm text-fg-secondary">{candidate.headline}</p>}
                            </div>
                            <div className="shrink-0 text-end">
                              <p className="text-2xl font-semibold tabular-nums text-primary-text">{candidate.match.score}</p>
                              <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">{t("talent.fit")}</p>
                            </div>
                          </div>

                          <label
                            htmlFor={compareId}
                            className="mt-3 inline-flex w-fit cursor-pointer items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-fg-muted"
                          >
                            <input
                              id={compareId}
                              type="checkbox"
                              checked={selectedForCompare}
                              onChange={() => toggleCompare(candidate.user.id)}
                              className={checkboxClass}
                            />
                            {t("talent.compare")}
                          </label>

                          {candidate.skills?.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-1.5">
                              {candidate.skills.slice(0, 6).map((skill) => (
                                <Badge key={skill} variant="default">{skill}</Badge>
                              ))}
                              {candidate.skills.length > 6 && (
                                <Badge variant="default">+{candidate.skills.length - 6}</Badge>
                              )}
                            </div>
                          )}

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-line bg-surface-sunken p-4">
                              <Eyebrow className="tracking-[0.14em]">{t("talent.whyMatched")}</Eyebrow>
                              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                {[
                                  [t("talent.scoreSemantic"), candidate.match.semanticScore],
                                  [t("talent.scoreSkills"), candidate.match.skillScore],
                                  [t("talent.scoreTrust"), candidate.match.trustScore],
                                  [t("talent.scoreMobility"), candidate.match.mobilityScore],
                                ].map(([label, value]) => (
                                  <div key={label} className="rounded-lg bg-surface px-2.5 py-2">
                                    <dt className="text-fg-muted">{label}</dt>
                                    <dd className="font-semibold tabular-nums text-fg">{value}</dd>
                                  </div>
                                ))}
                              </dl>
                              <div className="mt-3 space-y-1.5">
                                {candidate.match.reasons.map((reason) => (
                                  <p key={`${candidate.user.id}-${reason}`} className="text-xs leading-5 text-fg-secondary">
                                    {translateReason(reason, t, ts)}
                                  </p>
                                ))}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-success-line bg-success-soft p-4">
                              <Eyebrow className="tracking-[0.14em] text-success">{t("talent.mobilityReadiness")}</Eyebrow>
                              <div className="mt-3 flex items-center justify-between">
                                <span className="text-sm font-semibold text-fg">{tv("mobility.label", candidate.mobility.label)}</span>
                                <span className="text-sm tabular-nums text-fg-secondary">{candidate.mobility.score}/100</span>
                              </div>
                              <div className="mt-3 space-y-1.5 text-xs leading-5 text-fg-secondary">
                                {candidate.mobility.factors.length > 0 ? (
                                  candidate.mobility.factors.map((factor) => (
                                    <p key={`${candidate.user.id}-${factor}`}>{factor}</p>
                                  ))
                                ) : (
                                  <p>{t("talent.mobilityThin")}</p>
                                )}
                              </div>
                              {candidate.mobility.activeProcess && (
                                <div className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-fg-secondary">
                                  {t("talent.activeProcess", {
                                    visa: candidate.mobility.activeProcess.visaType,
                                    country: candidate.mobility.activeProcess.targetCountry,
                                    status: tv("visaProcess", candidate.mobility.activeProcess.status),
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          <dl className="mt-4 space-y-1 text-sm text-fg-secondary">
                            {candidate.yearsExperience != null && (
                              <div className="flex gap-1.5">
                                <dt className="text-fg-muted">{t("talent.experience")}</dt>
                                <dd>{tn("common.years", candidate.yearsExperience)}</dd>
                              </div>
                            )}
                            {candidate.targetCountries?.length > 0 && (
                              <div className="flex gap-1.5">
                                <dt className="text-fg-muted">{t("talent.targetMarkets")}</dt>
                                <dd>{candidate.targetCountries.join(", ")}</dd>
                              </div>
                            )}
                            {candidate.visaStatus && (
                              <div className="flex gap-1.5">
                                <dt className="text-fg-muted">{t("talent.visaNote")}</dt>
                                <dd>{candidate.visaStatus}</dd>
                              </div>
                            )}
                          </dl>

                          {candidate.trust && (
                            <div className="mt-4 rounded-2xl border border-line bg-surface-sunken p-4">
                              <div className="flex flex-wrap gap-2">
                                {candidate.trust.premiumFilterEligible && (
                                  <TrustBadge label={t("talent.badgeEligible")} variant="success" />
                                )}
                                {candidate.trust.maskedPhone && <TrustBadge label={t("talent.badgePhone")} variant="info" />}
                                {candidate.trust.assessmentBacked && (
                                  <TrustBadge label={t("talent.badgeAssessment")} variant="success" />
                                )}
                                {candidate.trust.fullyCompletedProfile && (
                                  <TrustBadge label={t("talent.badgeComplete")} variant="success" />
                                )}
                              </div>

                              {!!candidate.verifiedSkills?.length && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {candidate.verifiedSkills?.slice(0, 3).map((skill) => (
                                    <TrustBadge
                                      key={skill.id}
                                      label={t("talent.skillVerified", { skill: skill.skillName })}
                                      variant="success"
                                    />
                                  ))}
                                </div>
                              )}

                              {!!candidate.partnerMarkers?.length && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {candidate.partnerMarkers?.slice(0, 2).map((marker) => (
                                    <TrustBadge key={marker.id} label={marker.label} variant="info" />
                                  ))}
                                </div>
                              )}

                              <div className="mt-3 space-y-2">
                                {candidateTrustReasons(candidate, t, ts).map((reason) => (
                                  <div key={`${candidate.user.id}-${reason.title}`} className="rounded-xl bg-surface px-3 py-3">
                                    <p className="text-sm font-medium text-fg">{reason.title}</p>
                                    <p className="mt-1 text-xs leading-5 text-fg-secondary">{reason.description}</p>
                                  </div>
                                ))}
                              </div>

                              <div className="mt-3">
                                <TrustExplainerModal
                                  title={t("talent.whyCredible", { name: candidate.user.name })}
                                  description={t("talent.whyCredibleBody")}
                                  items={candidateTrustExplainerItems(candidate, t, ts)}
                                  triggerLabel={t("talent.fullBreakdown")}
                                />
                              </div>
                            </div>
                          )}

                          {candidate.poolMemberships.length > 0 && (
                            <div className="mt-4">
                              <Eyebrow className="tracking-[0.14em]">{t("talent.currentPools")}</Eyebrow>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {candidate.poolMemberships.map((membership) => (
                                  <Badge key={membership.id} variant="default">
                                    {membership.poolName}: {tv("status.stage", membership.stage)}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="mt-auto space-y-3 pt-5">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!activePool || savingCandidateId === candidate.user.id}
                                onClick={() => void saveCandidateToActivePool(candidate)}
                              >
                                {activeMembership && activePool
                                  ? t("talent.refreshIn", { pool: activePool.name })
                                  : activePool
                                    ? t("talent.saveTo", { pool: activePool.name })
                                    : t("talent.createPoolFirst")}
                              </Button>
                              {activeMembership && (
                                <select
                                  aria-label={t("talent.stageLabel")}
                                  className={`${controlClass} w-auto py-2`}
                                  value={activeMembership.stage}
                                  onChange={(event) => void updateCandidateStage(candidate, event.target.value)}
                                  disabled={savingCandidateId === candidate.user.id}
                                >
                                  {TALENT_STAGES.map((stage) => (
                                    <option key={stage} value={stage}>{tv("status.stage", stage)}</option>
                                  ))}
                                </select>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Link href={localizePath(`/employer/talent/${candidate.user.id}`, locale)} className="flex-1">
                                <Button variant="outline" size="sm" className="w-full">
                                  {t("talent.viewProfile")}
                                </Button>
                              </Link>
                              <div className="flex-1">
                                <MessageCandidateButton
                                  candidateUserId={candidate.user.id}
                                  candidateName={candidate.user.name}
                                  className="w-full"
                                />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {data.pagination.totalPages > 1 && (
                <nav className="flex items-center justify-center gap-2" aria-label={t("talent.pagination")}>
                  <Button variant="outline" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>
                    {t("common.previous")}
                  </Button>
                  <span className="px-4 text-sm text-fg-secondary">
                    {t("talent.pageOf", { page: fmt.number(page), total: fmt.number(data.pagination.totalPages) })}
                  </span>
                  <Button
                    variant="outline"
                    disabled={page === data.pagination.totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    {t("common.next")}
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Eyebrow>{t("talent.workspaceEyebrow")}</Eyebrow>
                  <h2 className="mt-2 text-xl font-semibold text-fg">{t("talent.poolsTitle")}</h2>
                  <p className="mt-2 text-sm text-fg-secondary">{t("talent.poolsBody")}</p>
                </div>
                <Badge variant="default">{tn("talent.poolCount", pools.length)}</Badge>
              </div>

              {poolError !== null && (
                <Notice tone="warning" role="alert" className="mt-4">
                  {poolError || t("talent.errPools")}
                </Notice>
              )}

              {poolLoading ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
                  <Spinner label={t("talent.loadingPools")} />
                  <span aria-hidden="true">{t("talent.loadingPools")}</span>
                </div>
              ) : pools.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-line-strong bg-surface-sunken px-4 py-5 text-sm text-fg-secondary">
                  {t("talent.poolsEmpty")}
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {pools.map((pool) => (
                    <button
                      key={pool.id}
                      type="button"
                      aria-pressed={activePoolId === pool.id}
                      onClick={() => setActivePoolId(pool.id)}
                      className={`w-full rounded-2xl border px-4 py-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                        activePoolId === pool.id
                          ? "border-success-line bg-primary-soft"
                          : "border-line bg-surface hover:border-line-strong"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-fg">{pool.name}</p>
                          {pool.description && <p className="mt-1 text-sm text-fg-secondary">{pool.description}</p>}
                        </div>
                        <Badge variant="default">{pool.candidateCount}</Badge>
                      </div>
                      {pool.recentCandidates.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {pool.recentCandidates.map((candidate) => (
                            <Badge key={candidate.id} variant="default">
                              {candidate.candidateName} · {tv("status.stage", candidate.stage)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <form
                className="mt-6 space-y-3 border-t border-line pt-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createPool();
                }}
              >
                <Eyebrow>{t("talent.createPoolEyebrow")}</Eyebrow>
                <Input
                  aria-label={t("talent.poolName")}
                  placeholder={t("talent.poolName")}
                  value={newPoolName}
                  onChange={(event) => setNewPoolName(event.target.value)}
                />
                <Input
                  aria-label={t("talent.poolPurpose")}
                  placeholder={t("talent.poolPurpose")}
                  value={newPoolDescription}
                  onChange={(event) => setNewPoolDescription(event.target.value)}
                />
                <Button type="submit" size="sm" disabled={creatingPool || !newPoolName.trim()}>
                  {creatingPool ? t("talent.creating") : t("talent.createPool")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <Eyebrow>{t("talent.flowEyebrow")}</Eyebrow>
              <h2 className="mt-2 text-xl font-semibold text-fg">{t("talent.flowTitle")}</h2>
              <p className="mt-2 text-sm text-fg-secondary">{t("talent.flowBody")}</p>
              <div className="mt-4 rounded-2xl border border-line bg-surface-sunken px-4 py-4 text-sm text-fg-secondary">
                <p className="font-medium text-fg">{tn("talent.selectedCount", compareIds.length)}</p>
                <p className="mt-2">{t("talent.flowTip")}</p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="mt-8">
        <TrustSupportCard
          reportHref={localizePath("/trust/report", locale)}
          title={t("talent.supportTitle")}
          description={t("talent.supportBody")}
        />
      </div>
    </div>
  );
}
