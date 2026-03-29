"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { TalentProfile, talent, TalentSearchResponse } from "@/lib/api";
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

  const [skills, setSkills] = useState("");
  const [location, setLocation] = useState("");
  const [minExperience, setMinExperience] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [verifiedSkillsOnly, setVerifiedSkillsOnly] = useState(false);
  const [fullyCompletedOnly, setFullyCompletedOnly] = useState(false);
  const [assessmentBackedOnly, setAssessmentBackedOnly] = useState(false);
  const [page, setPage] = useState(1);

  const hasActiveFilters =
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

  const fetchTalent = useCallback(async () => {
    if (!user || user.role !== "EMPLOYER") return;
    setLoading(true);
    setError(null);
    try {
      const response = await talent.search({
        skills: skills || undefined,
        location: location || undefined,
        minExperience: minExperience ? parseInt(minExperience) : undefined,
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
  }, [user, skills, location, minExperience, page, verifiedOnly, verifiedSkillsOnly, fullyCompletedOnly, assessmentBackedOnly]);

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
      const debounce = setTimeout(() => {
        fetchTalent();
      }, 300);
      return () => clearTimeout(debounce);
    }
  }, [fetchTalent, user]);

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Talent Marketplace</h1>
        <p className="max-w-3xl text-gray-600">
          Discover skilled African professionals with clearer trust signals, verified skills, and lower-noise search results.
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

      <TrustStatusBanner
        tone="info"
        title="Filter for proof, not just keywords"
        body="Paid plans unlock advanced filters, but candidates only appear in verified or assessment-backed views when the underlying trust signals actually passed review."
      />

      {/* Search Filters */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              placeholder="Skills (e.g. React, Python)"
              value={skills}
              onChange={(e) => {
                setSkills(e.target.value);
                setPage(1);
              }}
            />
            <Input
              placeholder="Location"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setPage(1);
              }}
            />
            <div>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
                value={minExperience}
                onChange={(e) => {
                  setMinExperience(e.target.value);
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
            </div>
            <Button
              variant="outline"
              onClick={() => {
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
          <p className="mt-4 text-xs leading-5 text-gray-500">
            Trust filters help reduce noise, but they do not replace human review. Use the trust explainer on profiles when you need to understand why someone is considered more credible.
          </p>
        </CardContent>
      </Card>

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
            <Button size="sm" variant="outline" onClick={() => fetchTalent()}>
              Retry search
            </Button>
          }
        />
      )}

      {!loading && data && (
        <>
          <div className="mb-4 text-gray-600">
            {data.pagination.total} candidate{data.pagination.total !== 1 ? "s" : ""} found
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
                Try broadening experience, location, or trust filters. Narrow trust filters are useful, but the strongest hiring outcomes usually combine them with role-specific skills and context.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    onClick={() => {
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
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {data.candidates.map((candidate) => (
                <Card key={candidate.user.id} className="h-full">
                  <CardContent className="p-6">
                    <div className="mb-3">
                      <div className="flex flex-wrap items-start gap-2">
                        <h3 className="font-semibold text-gray-900 text-lg">
                          {candidate.user.name}
                        </h3>
                        {candidate.trust && (
                          <TrustBadge
                            label={candidate.trust.badge}
                            riskLevel={candidate.trust.riskLevel}
                            variant="success"
                          />
                        )}
                      </div>
                      {candidate.headline && (
                        <p className="text-sm text-gray-600 mt-1">{candidate.headline}</p>
                      )}
                    </div>

                    {/* Skills */}
                    {candidate.skills && candidate.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {candidate.skills.slice(0, 5).map((skill) => (
                          <Badge key={skill} variant="default">{skill}</Badge>
                        ))}
                        {candidate.skills.length > 5 && (
                          <Badge variant="default">+{candidate.skills.length - 5}</Badge>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5 text-sm text-gray-600 mb-3">
                      {candidate.yearsExperience != null && (
                        <p>💼 {candidate.yearsExperience} years experience</p>
                      )}
                      {candidate.targetCountries && candidate.targetCountries.length > 0 && (
                        <p>🌍 {candidate.targetCountries.join(", ")}</p>
                      )}
                      {candidate.visaStatus && (
                        <p>📋 Visa: {candidate.visaStatus}</p>
                      )}
                    </div>

                    {/* Profile Completeness */}
                    {candidate.profileCompleteness != null && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>Profile completeness</span>
                          <span>{candidate.profileCompleteness}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              candidate.profileCompleteness >= 80
                                ? "bg-emerald-500"
                                : candidate.profileCompleteness >= 50
                                  ? "bg-yellow-500"
                                  : "bg-red-400"
                            }`}
                            style={{ width: `${candidate.profileCompleteness}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {candidate.trust && (
                      <div className="mb-4 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {candidate.trust.premiumFilterEligible && (
                            <TrustBadge label="Eligible for verified filters" variant="success" />
                          )}
                          {candidate.trust.maskedPhone && (
                            <TrustBadge label={`Phone verified`} variant="info" />
                          )}
                          {candidate.trust.assessmentBacked && (
                            <TrustBadge label="Assessment verified" variant="success" />
                          )}
                          {candidate.trust.fullyCompletedProfile && (
                            <TrustBadge label="Complete profile" variant="success" />
                          )}
                        </div>
                        {candidate.verifiedSkills && candidate.verifiedSkills.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {candidate.verifiedSkills.slice(0, 3).map((skill) => (
                              <TrustBadge
                                key={skill.id}
                                label={`${skill.skillName} verified`}
                                variant="success"
                              />
                            ))}
                          </div>
                        )}
                        {candidate.partnerMarkers && candidate.partnerMarkers.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {candidate.partnerMarkers.slice(0, 2).map((marker) => (
                              <TrustBadge key={marker.id} label={marker.label} variant="info" />
                            ))}
                          </div>
                        )}
                        {candidate.trust.warnings.length > 0 && (
                          <p className="text-xs text-amber-700">
                            {candidate.trust.warnings[0]}
                          </p>
                        )}
                      </div>
                    )}

                    {candidate.trust && (
                      <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Why this candidate is trusted
                            </p>
                            <div className="mt-3 space-y-2">
                              {candidateTrustReasons(candidate).length > 0 ? (
                                candidateTrustReasons(candidate).map((reason) => (
                                  <div key={`${candidate.user.id}-${reason.title}`} className="rounded-xl bg-white px-3 py-3">
                                    <p className="text-sm font-medium text-slate-900">{reason.title}</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-600">{reason.description}</p>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl bg-white px-3 py-3 text-xs leading-5 text-slate-600">
                                  This profile has some trust signals, but you may want to review the full profile before making a shortlist decision.
                                </div>
                              )}
                            </div>
                          </div>
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
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {data.pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="flex items-center px-4 text-gray-600">
                Page {page} of {data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page === data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <TrustSupportCard
        reportHref={localizePath("/trust/report", locale)}
        title="Need to flag a suspicious profile or hiring interaction?"
        description="If a candidate seems impersonated, inconsistent, or unsafe, file a trust report. Our moderation team uses those reports together with behavior and verification evidence."
      />
    </div>
  );
}
