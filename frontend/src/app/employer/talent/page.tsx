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
import { localizePath, useLocale } from "@/lib/i18n/client";

const TALENT_STAGES = ["SOURCED", "REVIEWING", "PRIORITY", "CONTACTED"];

function candidateTrustReasons(candidate: TalentProfile): TrustExplainerItem[] {
  if (candidate.trust?.explainability?.length) {
    return candidate.trust.explainability.slice(0, 3).map((signal) => ({
      title: signal.label,
      description: signal.detail,
      statusLabel:
        signal.status === "verified"
          ? "Verified"
          : signal.status === "needs_attention"
            ? "Needs attention"
            : "Strengthening",
      statusVariant:
        signal.status === "verified"
          ? ("success" as const)
          : signal.status === "needs_attention"
            ? ("warning" as const)
            : ("info" as const),
    }));
  }

  const fallback: TrustExplainerItem[] = [];

  if (candidate.trust?.maskedPhone) {
    fallback.push({
      title: "Phone verification",
      description: `AfriTalent has a verified phone signal on file: ${candidate.trust.maskedPhone}.`,
      statusLabel: "Verified",
      statusVariant: "info" as const,
    });
  }

  if (candidate.verifiedSkills?.length) {
    fallback.push({
      title: "Verified skills",
      description: `${candidate.verifiedSkills.length} skill signal${candidate.verifiedSkills.length === 1 ? "" : "s"} passed evidence-based review.`,
      statusLabel: "Evidence-backed",
      statusVariant: "success" as const,
    });
  }

  if (candidate.partnerMarkers?.length) {
    fallback.push({
      title: "Partner-issued trust marker",
      description: "An approved university, training, or scholarship partner has added a trust marker to this profile.",
      statusLabel: "Partner backed",
      statusVariant: "info" as const,
    });
  }

  if (candidate.profileCompleteness >= 80) {
    fallback.push({
      title: "Complete profile",
      description: "This candidate has supplied a strong amount of employer-facing profile detail.",
      statusLabel: "High completeness",
      statusVariant: "success" as const,
    });
  }

  return fallback.slice(0, 3);
}

function candidateTrustExplainerItems(candidate: TalentProfile): TrustExplainerItem[] {
  if (candidate.trust?.explainability?.length) {
    return candidate.trust.explainability.map((signal) => ({
      title: signal.label,
      description: signal.detail,
      statusLabel:
        signal.status === "verified"
          ? "Verified"
          : signal.status === "needs_attention"
            ? "Needs attention"
            : "Strengthening",
      statusVariant:
        signal.status === "verified"
          ? ("success" as const)
          : signal.status === "needs_attention"
            ? ("warning" as const)
            : ("info" as const),
    }));
  }

  return candidateTrustReasons(candidate);
}

export default function TalentMarketplacePage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();

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
      setPoolError(err instanceof Error ? err.message : "Failed to load talent pools");
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
      setError(err instanceof Error ? err.message : "Failed to load candidates");
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
      setError(err instanceof Error ? err.message : "Failed to compare candidates");
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
      setPoolError(err instanceof Error ? err.message : "Failed to create talent pool");
    } finally {
      setCreatingPool(false);
    }
  };

  const saveCandidateToActivePool = async (candidate: TalentProfile) => {
    if (!activePool) {
      setPoolError("Create or select a talent pool before saving candidates.");
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
      setPoolError(err instanceof Error ? err.message : "Failed to add candidate to pool");
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
      setPoolError(err instanceof Error ? err.message : "Failed to update pool stage");
    } finally {
      setSavingCandidateId(null);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Talent Marketplace</h1>
        <p className="max-w-3xl text-gray-600">
          Search talent by role intent, trust evidence, and mobility clarity so the shortlist feels smaller, sharper, and safer to act on.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={localizePath("/employer/trust", locale)}>
            <Button variant="outline" size="sm">Employer Trust Profile</Button>
          </Link>
          <TrustExplainerModal
            title="How verified candidate filters work"
            description="Premium filters help you narrow the market, but candidates only qualify for these filters when they have real approved signals behind them."
            items={[
              {
                title: "Verified candidates",
                description: "These profiles passed stronger trust thresholds such as phone, identity, skills, profile consistency, or partner evidence.",
                statusLabel: "Evidence required",
                statusVariant: "success",
              },
              {
                title: "Verified skills",
                description: "Skill badges appear only after certificate, portfolio, assessment, partner, or manual review evidence is accepted.",
                statusLabel: "Not self-claimed",
                statusVariant: "success",
              },
              {
                title: "Assessment-backed and complete profiles",
                description: "These filters highlight candidates with stronger proof and enough profile context to support faster hiring decisions.",
                statusLabel: "Higher confidence",
                statusVariant: "info",
              },
            ]}
            triggerLabel="How trust filters work"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <TrustStatusBanner
            tone="info"
            title="Filter for proof, not just keywords"
            body="AfriTalent now blends semantic role intent, trust signals, and mobility context so recruiters can move from search to a real shortlist faster."
          />

          <Card>
            <CardContent className="p-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <Input
                  placeholder="Describe the role or hiring brief"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                />
                <Input
                  placeholder="Skills (e.g. React, Python)"
                  value={skills}
                  onChange={(event) => {
                    setSkills(event.target.value);
                    setPage(1);
                  }}
                />
                <Input
                  placeholder="Target country or market"
                  value={location}
                  onChange={(event) => {
                    setLocation(event.target.value);
                    setPage(1);
                  }}
                />
                <select
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={minExperience}
                  onChange={(event) => {
                    setMinExperience(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Min Experience</option>
                  <option value="1">1+ years</option>
                  <option value="2">2+ years</option>
                  <option value="3">3+ years</option>
                  <option value="5">5+ years</option>
                  <option value="8">8+ years</option>
                  <option value="10">10+ years</option>
                </select>
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setSkills("");
                    setLocation("");
                    setMinExperience("");
                    setVerifiedOnly(false);
                    setVerifiedSkillsOnly(false);
                    setFullyCompletedOnly(false);
                    setAssessmentBackedOnly(false);
                    setPage(1);
                    setComparison(null);
                    setCompareIds([]);
                  }}
                >
                  Clear Filters
                </Button>
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-3">
                {[
                  {
                    checked: verifiedOnly,
                    onChange: (checked: boolean) => setVerifiedOnly(checked),
                    title: "Show verified candidates only",
                    body: "Premium employers can filter for candidates with stronger verification and authenticity signals.",
                  },
                  {
                    checked: verifiedSkillsOnly,
                    onChange: (checked: boolean) => setVerifiedSkillsOnly(checked),
                    title: "Require verified skills",
                    body: "Only show candidates with at least one employer-facing verified skill badge.",
                  },
                  {
                    checked: assessmentBackedOnly,
                    onChange: (checked: boolean) => setAssessmentBackedOnly(checked),
                    title: "Assessment-backed candidates",
                    body: "Prioritize candidates whose trust profile includes verified assessment signals.",
                  },
                  {
                    checked: fullyCompletedOnly,
                    onChange: (checked: boolean) => setFullyCompletedOnly(checked),
                    title: "Fully completed profiles",
                    body: "Show candidates with complete employer-facing trust and profile data.",
                  },
                ].map((filter) => (
                  <label key={filter.title} className="flex items-start gap-3 text-sm text-blue-900">
                    <input
                      type="checkbox"
                      checked={filter.checked}
                      onChange={(event) => {
                        filter.onChange(event.target.checked);
                        setPage(1);
                      }}
                      className="mt-0.5 h-4 w-4 rounded border-blue-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>
                      <span className="block font-semibold">{filter.title}</span>
                      <span className="block text-blue-800">{filter.body}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Semantic search</p>
                  <p className="mt-2 text-sm text-slate-700">
                    Search by a recruiter brief, not just exact keywords.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Trust-aware ranking</p>
                  <p className="mt-2 text-sm text-slate-700">
                    Fit score blends verified skill proof, profile strength, and authenticity posture.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mobility clarity</p>
                  <p className="mt-2 text-sm text-slate-700">
                    Surface relocation and visa readiness before you spend shortlist time.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {comparison && (
            <Card className="border-emerald-200 bg-emerald-50/70">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Comparison summary</p>
                    <h2 className="mt-2 text-xl font-semibold text-emerald-950">Shortlist comparison deck</h2>
                    <p className="mt-2 max-w-2xl text-sm text-emerald-900/80">{comparison.comparison.summary}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setComparison(null)}>
                    Clear comparison
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
          )}

          {error && (
            <TrustStatusBanner
              tone="danger"
              title="We couldn't load talent results"
              body={error}
              actions={
                <Button size="sm" variant="outline" onClick={() => void fetchTalent()}>
                  Retry search
                </Button>
              }
            />
          )}

          {!loading && data && (
            <>
              {data.semantic?.query && (
                <TrustStatusBanner
                  tone="success"
                  title={`Semantic shortlist active for "${data.semantic.query}"`}
                  body={`${data.semantic.hitCount} indexed semantic signals reinforced these results. Use compare mode before you message finalists.`}
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 text-gray-600">
                <span>
                  {data.pagination.total} candidate{data.pagination.total !== 1 ? "s" : ""} found
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-500">{compareIds.length}/4 selected for comparison</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={compareIds.length < 2 || comparisonLoading}
                    onClick={() => void runComparison()}
                  >
                    {comparisonLoading ? "Comparing..." : "Compare Selected"}
                  </Button>
                </div>
              </div>

              {data.candidates.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-200">
                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-900 mb-2 font-semibold">No candidates match your current filters</p>
                  <p className="text-gray-600 text-sm max-w-xl mx-auto">
                    Try broadening the brief, location, or trust filters. The best recruiter flow usually starts with a role narrative, then narrows with proof and mobility.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    {hasActiveFilters && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setQuery("");
                          setSkills("");
                          setLocation("");
                          setMinExperience("");
                          setVerifiedOnly(false);
                          setVerifiedSkillsOnly(false);
                          setFullyCompletedOnly(false);
                          setAssessmentBackedOnly(false);
                          setPage(1);
                        }}
                      >
                        Reset filters
                      </Button>
                    )}
                    <Link href={localizePath("/trust", locale)}>
                      <Button size="sm">Open trust center</Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  {data.candidates.map((candidate) => {
                    const activeMembership = candidate.poolMemberships.find((membership) => membership.poolId === activePoolId);
                    const selectedForCompare = compareIds.includes(candidate.user.id);

                    return (
                      <Card key={candidate.user.id} className="h-full border border-slate-200 bg-white/95 shadow-sm">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex flex-wrap items-start gap-2">
                                <h3 className="font-semibold text-gray-900 text-lg">{candidate.user.name}</h3>
                                {candidate.trust && (
                                  <TrustBadge
                                    label={candidate.trust.badge}
                                    riskLevel={candidate.trust.riskLevel}
                                    variant="success"
                                  />
                                )}
                                <Badge variant="default">Fit {candidate.match.score}/100</Badge>
                              </div>
                              {candidate.headline && (
                                <p className="text-sm text-gray-600 mt-1">{candidate.headline}</p>
                              )}
                            </div>
                            <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                              <input
                                type="checkbox"
                                checked={selectedForCompare}
                                onChange={() => toggleCompare(candidate.user.id)}
                                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                              />
                              Compare
                            </label>
                          </div>

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
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Why this matched</p>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700">
                                <div className="rounded-xl bg-white px-3 py-2">Semantic {candidate.match.semanticScore}</div>
                                <div className="rounded-xl bg-white px-3 py-2">Skills {candidate.match.skillScore}</div>
                                <div className="rounded-xl bg-white px-3 py-2">Trust {candidate.match.trustScore}</div>
                                <div className="rounded-xl bg-white px-3 py-2">Mobility {candidate.match.mobilityScore}</div>
                              </div>
                              <div className="mt-3 space-y-2">
                                {candidate.match.reasons.map((reason) => (
                                  <p key={`${candidate.user.id}-${reason}`} className="text-xs leading-5 text-slate-600">
                                    {reason}
                                  </p>
                                ))}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Mobility readiness</p>
                              <div className="mt-3 flex items-center justify-between">
                                <span className="text-sm font-semibold text-emerald-950">{candidate.mobility.label}</span>
                                <span className="text-sm text-emerald-900">{candidate.mobility.score}/100</span>
                              </div>
                              <div className="mt-3 space-y-2 text-xs leading-5 text-emerald-900">
                                {candidate.mobility.factors.length > 0 ? (
                                  candidate.mobility.factors.map((factor) => (
                                    <p key={`${candidate.user.id}-${factor}`}>{factor}</p>
                                  ))
                                ) : (
                                  <p>Mobility context is still thin. Review the profile before assuming cross-border readiness.</p>
                                )}
                              </div>
                              {candidate.mobility.activeProcess && (
                                <div className="mt-3 rounded-xl bg-white px-3 py-3 text-xs text-emerald-900">
                                  Active process: {candidate.mobility.activeProcess.visaType} for {candidate.mobility.activeProcess.targetCountry} ({candidate.mobility.activeProcess.status.toLowerCase().replaceAll("_", " ")})
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 space-y-1.5 text-sm text-gray-600">
                            {candidate.yearsExperience != null && (
                              <p>Experience: {candidate.yearsExperience} years</p>
                            )}
                            {candidate.targetCountries?.length > 0 && (
                              <p>Target markets: {candidate.targetCountries.join(", ")}</p>
                            )}
                            {candidate.visaStatus && (
                              <p>Visa note: {candidate.visaStatus}</p>
                            )}
                          </div>

                          {candidate.trust && (
                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="flex flex-wrap gap-2">
                                {candidate.trust.premiumFilterEligible && (
                                  <TrustBadge label="Eligible for verified filters" variant="success" />
                                )}
                                {candidate.trust.maskedPhone && (
                                  <TrustBadge label="Phone verified" variant="info" />
                                )}
                                {candidate.trust.assessmentBacked && (
                                  <TrustBadge label="Assessment verified" variant="success" />
                                )}
                                {candidate.trust.fullyCompletedProfile && (
                                  <TrustBadge label="Complete profile" variant="success" />
                                )}
                              </div>

                              {!!candidate.verifiedSkills?.length && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {candidate.verifiedSkills?.slice(0, 3).map((skill) => (
                                    <TrustBadge
                                      key={skill.id}
                                      label={`${skill.skillName} verified`}
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
                                {candidateTrustReasons(candidate).map((reason) => (
                                  <div key={`${candidate.user.id}-${reason.title}`} className="rounded-xl bg-white px-3 py-3">
                                    <p className="text-sm font-medium text-slate-900">{reason.title}</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-600">{reason.description}</p>
                                  </div>
                                ))}
                              </div>

                              <div className="mt-3">
                                <TrustExplainerModal
                                  title={`Why ${candidate.user.name} looks credible`}
                                  description="AfriTalent explains trust using multiple evidence-backed signals so you can understand more than just a badge label."
                                  items={candidateTrustExplainerItems(candidate)}
                                  triggerLabel="See full trust breakdown"
                                />
                              </div>
                            </div>
                          )}

                          {candidate.poolMemberships.length > 0 && (
                            <div className="mt-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Current recruiter pools</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {candidate.poolMemberships.map((membership) => (
                                  <Badge key={membership.id} variant="default">
                                    {membership.poolName}: {membership.stage}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="mt-5 space-y-3">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!activePool || savingCandidateId === candidate.user.id}
                                onClick={() => void saveCandidateToActivePool(candidate)}
                              >
                                {activeMembership ? `Refresh ${activePool?.name}` : activePool ? `Save to ${activePool.name}` : "Create a pool first"}
                              </Button>
                              {activeMembership && (
                                <select
                                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                  value={activeMembership.stage}
                                  onChange={(event) => void updateCandidateStage(candidate, event.target.value)}
                                  disabled={savingCandidateId === candidate.user.id}
                                >
                                  {TALENT_STAGES.map((stage) => (
                                    <option key={stage} value={stage}>{stage}</option>
                                  ))}
                                </select>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <Link href={`/candidate/${candidate.user.id}`} className="flex-1">
                                <Button variant="outline" size="sm" className="w-full">
                                  View Profile
                                </Button>
                              </Link>
                              <Link href="/messages" className="flex-1">
                                <Button size="sm" className="w-full">
                                  Message
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {data.pagination.totalPages > 1 && (
                <div className="flex justify-center gap-2">
                  <Button
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-4 text-gray-600">
                    Page {page} of {data.pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={page === data.pagination.totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recruiter workspace</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">Talent pools</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Save strong candidates into reusable pools and move them through a simple sourcing stage flow.
                  </p>
                </div>
                <Badge variant="default">{pools.length} pool{pools.length === 1 ? "" : "s"}</Badge>
              </div>

              {poolError && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {poolError}
                </div>
              )}

              {poolLoading ? (
                <div className="mt-4 text-sm text-slate-500">Loading pools...</div>
              ) : pools.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  Create your first talent pool to start capturing semantic shortlist winners.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {pools.map((pool) => (
                    <button
                      key={pool.id}
                      type="button"
                      onClick={() => setActivePoolId(pool.id)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                        activePoolId === pool.id
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{pool.name}</p>
                          {pool.description && (
                            <p className="mt-1 text-sm text-slate-600">{pool.description}</p>
                          )}
                        </div>
                        <Badge variant="default">{pool.candidateCount}</Badge>
                      </div>
                      {pool.recentCandidates.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {pool.recentCandidates.map((candidate) => (
                            <Badge key={candidate.id} variant="default">
                              {candidate.candidateName} · {candidate.stage}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-6 space-y-3 border-t border-slate-200 pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Create a pool</p>
                <Input
                  placeholder="Pool name"
                  value={newPoolName}
                  onChange={(event) => setNewPoolName(event.target.value)}
                />
                <Input
                  placeholder="What this pool is for"
                  value={newPoolDescription}
                  onChange={(event) => setNewPoolDescription(event.target.value)}
                />
                <Button
                  size="sm"
                  disabled={creatingPool || !newPoolName.trim()}
                  onClick={() => void createPool()}
                >
                  {creatingPool ? "Creating..." : "Create Pool"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Comparison flow</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Shortlist review</h2>
              <p className="mt-2 text-sm text-slate-600">
                Select up to four candidates, then compare trust, skills, and mobility context before starting outreach.
              </p>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                <p>{compareIds.length} candidate{compareIds.length === 1 ? "" : "s"} selected.</p>
                <p className="mt-2">Recommended workflow: semantic search, save to pool, compare finalists, then message.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-8">
        <TrustSupportCard
          reportHref={localizePath("/trust/report", locale)}
          title="Need to flag a suspicious profile or hiring interaction?"
          description="If a candidate seems impersonated, inconsistent, or unsafe, file a trust report. Our moderation team uses those reports together with behavior and verification evidence."
        />
      </div>
    </div>
  );
}
