"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { ChevronDown, Lightbulb, PenLine, ThumbsUp, X } from "lucide-react";
import {
  interviewExperiences,
  InterviewListResponse,
  InterviewExperienceItem,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CardGridSkeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/analytics";
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { usePublicT, type PublicMessageKey, type PublicT } from "@/lib/i18n/public-messages";

const DIFFICULTY_OPTIONS = ["EASY", "MEDIUM", "HARD"] as const;
const OUTCOME_OPTIONS = ["OFFERED", "REJECTED", "NO_RESPONSE", "IN_PROGRESS"] as const;
const INTERVIEW_TYPES = [
  "PHONE_SCREEN",
  "TECHNICAL",
  "BEHAVIORAL",
  "SYSTEM_DESIGN",
  "TAKE_HOME",
  "PANEL",
  "ON_SITE",
  "OTHER",
] as const;
const HELPFUL_STORAGE_KEY = "afritalent_interview_helpful_votes";

const DIFFICULTY_LABELS: Record<string, PublicMessageKey> = {
  EASY: "guides.iv.difficulty.easy",
  MEDIUM: "guides.iv.difficulty.medium",
  HARD: "guides.iv.difficulty.hard",
};
const OUTCOME_LABELS: Record<string, PublicMessageKey> = {
  OFFERED: "guides.iv.outcome.offered",
  REJECTED: "guides.iv.outcome.rejected",
  NO_RESPONSE: "guides.iv.outcome.noResponse",
  IN_PROGRESS: "guides.iv.outcome.inProgress",
};
const TYPE_LABELS: Record<string, PublicMessageKey> = {
  PHONE_SCREEN: "guides.iv.type.phone",
  TECHNICAL: "guides.iv.type.technical",
  BEHAVIORAL: "guides.iv.type.behavioral",
  SYSTEM_DESIGN: "guides.iv.type.systemDesign",
  TAKE_HOME: "guides.iv.type.takeHome",
  PANEL: "guides.iv.type.panel",
  ON_SITE: "guides.iv.type.onSite",
  OTHER: "guides.iv.type.other",
};

const label = (map: Record<string, PublicMessageKey>, value: string, tp: PublicT) =>
  map[value.toUpperCase()] ? tp(map[value.toUpperCase()]) : value;

// Clearly labelled practice scenarios shown until real community entries exist.
const SAMPLE_SCENARIOS = [
  { id: "aws", difficulty: "MEDIUM", interviewType: "TECHNICAL", helpfulCount: 42, ageDays: 2 },
  { id: "devops", difficulty: "HARD", interviewType: "SYSTEM_DESIGN", helpfulCount: 15, ageDays: 5 },
  { id: "security", difficulty: "HARD", interviewType: "TECHNICAL", helpfulCount: 89, ageDays: 12 },
  { id: "backend", difficulty: "MEDIUM", interviewType: "TECHNICAL", helpfulCount: 23, ageDays: 18 },
  { id: "product", difficulty: "MEDIUM", interviewType: "BEHAVIORAL", helpfulCount: 7, ageDays: 25 },
] as const;

function buildSampleExperiences(tp: PublicT): InterviewExperienceItem[] {
  return SAMPLE_SCENARIOS.map((sample) => {
    const key = (field: string) => `guides.iv.sample.${sample.id}.${field}` as PublicMessageKey;
    return {
      id: `sample-${sample.id}`,
      company: { id: `sample-company-${sample.id}`, name: tp(key("company")) },
      jobTitle: tp(key("role")),
      difficulty: sample.difficulty,
      outcome: "IN_PROGRESS",
      interviewType: sample.interviewType,
      process: tp(key("process")),
      questions: [tp(key("q1")), tp(key("q2")), tp(key("q3"))],
      tips: tp(key("tips")),
      duration: tp(key("duration")),
      helpfulCount: sample.helpfulCount,
      createdAt: new Date(Date.now() - 86400000 * sample.ageDays).toISOString(),
    };
  });
}

const FIELD_CLASS =
  "w-full rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-fg placeholder:text-fg-muted shadow-xs focus:outline-none focus:ring-2 focus:ring-focus";
const chipClass = (active: boolean) =>
  `rounded-full px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
    active ? "bg-primary text-primary-fg" : "bg-surface-muted text-fg-secondary hover:text-fg"
  }`;

const EMPTY_FORM = {
  companyId: "",
  companySearch: "",
  jobTitle: "",
  difficulty: "MEDIUM",
  outcome: "OFFERED",
  interviewType: "TECHNICAL",
  process: "",
  questions: [""],
  tips: "",
  duration: "",
};

export default function InterviewsPage() {
  const t = useT();
  const tp = usePublicT();
  const locale = useLocale();
  const { user } = useAuth();
  const sampleExperiences = useMemo(() => buildSampleExperiences(tp), [tp]);

  // List state
  const [data, setData] = useState<InterviewListResponse | null>(null);
  const [usingSamples, setUsingSamples] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [page, setPage] = useState(1);

  // Expanded card
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Submit modal
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  // Helpful tracking
  const [helpfulSet, setHelpfulSet] = useState<Set<string>>(new Set());
  const [helpfulLoadingId, setHelpfulLoadingId] = useState<string | null>(null);
  const [helpfulError, setHelpfulError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(HELPFUL_STORAGE_KEY);
      if (saved) setHelpfulSet(new Set(JSON.parse(saved) as string[]));
    } catch {
      setHelpfulSet(new Set());
    }
  }, []);

  const fetchExperiences = useCallback(async () => {
    setLoading(true);
    try {
      const response = await interviewExperiences.list({
        jobTitle: searchText || undefined,
        difficulty: filterDifficulty || undefined,
        page,
      });
      if (response && response.experiences.length > 0) {
        setData(response);
        setUsingSamples(false);
      } else {
        setUsingSamples(true);
      }
    } catch {
      setUsingSamples(true);
    } finally {
      setLoading(false);
    }
  }, [searchText, filterDifficulty, page]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchExperiences();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchExperiences]);

  // Samples are rebuilt per locale, so they are derived rather than stored.
  const listData: InterviewListResponse | null = usingSamples
    ? {
        experiences: sampleExperiences.map((exp) =>
          helpfulSet.has(exp.id) ? { ...exp, helpfulCount: exp.helpfulCount + 1 } : exp,
        ),
        pagination: { page: 1, limit: 10, total: sampleExperiences.length, totalPages: 1 },
      }
    : data;

  // Escape closes the share dialog.
  useEffect(() => {
    if (!showSubmitForm) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowSubmitForm(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSubmitForm]);

  const handleHelpful = async (id: string) => {
    if (helpfulSet.has(id)) return;
    const isDemoExperience = id.startsWith("exp-") || id.startsWith("sample-");
    const previousData = data;
    const previousHelpfulSet = helpfulSet;
    const nextHelpfulSet = new Set(helpfulSet).add(id);

    setHelpfulError(null);
    setHelpfulLoadingId(id);
    setHelpfulSet(nextHelpfulSet);
    try {
      window.localStorage.setItem(HELPFUL_STORAGE_KEY, JSON.stringify([...nextHelpfulSet]));
    } catch {
      // Storage unavailable: the vote still counts for this session.
    }
    if (!isDemoExperience) {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          experiences: prev.experiences.map((exp) => (exp.id === id ? { ...exp, helpfulCount: exp.helpfulCount + 1 } : exp)),
        };
      });
    }
    trackEvent("interview_experience_helpful_clicked", { experience_id: id, demo: isDemoExperience });

    try {
      if (user && !isDemoExperience) {
        await interviewExperiences.helpful(id);
      }
    } catch {
      setData(previousData);
      setHelpfulSet(previousHelpfulSet);
      try {
        window.localStorage.setItem(HELPFUL_STORAGE_KEY, JSON.stringify([...previousHelpfulSet]));
      } catch {
        // ignore
      }
      setHelpfulError(tp("guides.iv.helpfulError"));
    } finally {
      setHelpfulLoadingId(null);
    }
  };

  const addQuestion = () => {
    setFormData((prev) => ({ ...prev, questions: [...prev.questions, ""] }));
  };

  const removeQuestion = (index: number) => {
    setFormData((prev) => ({ ...prev, questions: prev.questions.filter((_, i) => i !== index) }));
  };

  const updateQuestion = (index: number, value: string) => {
    setFormData((prev) => ({ ...prev, questions: prev.questions.map((q, i) => (i === index ? value : q)) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    try {
      await interviewExperiences.submit({
        companyId: formData.companyId,
        jobTitle: formData.jobTitle,
        difficulty: formData.difficulty,
        outcome: formData.outcome,
        interviewType: formData.interviewType,
        process: formData.process,
        questions: formData.questions.filter((q) => q.trim()),
        tips: formData.tips || undefined,
        duration: formData.duration || undefined,
      });
      setSubmitSuccess(true);
      setFormData(EMPTY_FORM);
      // Refresh list
      fetchExperiences();
      setTimeout(() => {
        setShowSubmitForm(false);
        setSubmitSuccess(false);
      }, 2000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tp("guides.iv.submitError"));
    } finally {
      setSubmitLoading(false);
    }
  };

  // Filter experiences client-side for outcome (API may not support it)
  const filteredExperiences = listData?.experiences.filter((exp) => {
    if (filterOutcome && exp.outcome.toUpperCase() !== filterOutcome) return false;
    return true;
  });

  const closeForm = () => {
    setShowSubmitForm(false);
    setSubmitError(null);
    setSubmitSuccess(false);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 pb-28 sm:px-6 lg:px-8">
      {/* Hero */}
      <div className="mb-12 text-center">
        <h1 className="font-display mb-4 text-4xl font-bold tracking-tight text-fg">{t("interviews.title")}</h1>
        <p className="mx-auto max-w-2xl text-lg text-fg-secondary">{t("interviews.practiceSubtitle")}</p>
      </div>

      {/* Search and filters */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="mb-4">
            <Input
              type="search"
              aria-label={t("interviews.searchPlaceholder")}
              placeholder={t("interviews.searchPlaceholder")}
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="me-2 text-sm text-fg-muted">{t("common.difficulty")}:</span>
            {DIFFICULTY_OPTIONS.map((d) => (
              <button
                type="button"
                key={d}
                aria-pressed={filterDifficulty === d}
                className={chipClass(filterDifficulty === d)}
                onClick={() => {
                  setFilterDifficulty(filterDifficulty === d ? "" : d);
                  setPage(1);
                }}
              >
                {tp(DIFFICULTY_LABELS[d])}
              </button>
            ))}

            <span className="me-2 ms-4 text-sm text-fg-muted">{t("common.outcome")}:</span>
            {(["OFFERED", "REJECTED"] as const).map((o) => (
              <button
                type="button"
                key={o}
                aria-pressed={filterOutcome === o}
                className={chipClass(filterOutcome === o)}
                onClick={() => {
                  setFilterOutcome(filterOutcome === o ? "" : o);
                  setPage(1);
                }}
              >
                {tp(OUTCOME_LABELS[o])}
              </button>
            ))}

            {(filterDifficulty || filterOutcome) && (
              <button
                type="button"
                className="rounded-full px-3 py-1 text-sm font-medium text-danger hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                onClick={() => {
                  setFilterDifficulty("");
                  setFilterOutcome("");
                  setPage(1);
                }}
              >
                {t("interviews.clearFilters")}
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && <CardGridSkeleton count={3} />}

      {helpfulError && (
        <div role="alert" className="mb-8 rounded-lg border border-warning-line bg-warning-soft p-4 text-sm text-fg">
          {helpfulError}
        </div>
      )}

      {/* Interview cards */}
      {!loading && filteredExperiences && (
        <>
          {filteredExperiences.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface-sunken p-10 text-center">
              <p className="mb-2 text-lg font-semibold text-fg">{t("interviews.noMatch")}</p>
              <p className="mx-auto max-w-xl text-sm leading-6 text-fg-muted">{t("interviews.noMatchDesc")}</p>
            </div>
          ) : (
            <div className="mb-8 space-y-4">
              {filteredExperiences.map((exp) => (
                <InterviewCard
                  key={exp.id}
                  experience={exp}
                  isExpanded={expandedId === exp.id}
                  onToggle={() => setExpandedId(expandedId === exp.id ? null : exp.id)}
                  onHelpful={() => handleHelpful(exp.id)}
                  isHelpfulMarked={helpfulSet.has(exp.id)}
                  isHelpfulLoading={helpfulLoadingId === exp.id}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {listData && listData.pagination.totalPages > 1 && (
            <div className="mb-8 flex justify-center gap-2">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                {t("common.previous")}
              </Button>
              <span className="flex items-center px-4 text-fg-secondary">
                {tp("discover.page.of", { page, total: listData.pagination.totalPages })}
              </span>
              <Button variant="outline" disabled={page === listData.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                {t("common.next")}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Floating share button */}
      <div className="fixed bottom-6 end-6 z-40 flex max-w-xs flex-col items-end gap-2">
        {loginPrompt && !user && (
          <div role="status" className="rounded-xl border border-line bg-surface-raised p-3 text-sm text-fg-secondary shadow-overlay">
            {tp("guides.iv.loginPrompt")}{" "}
            <Link
              href={`${localizePath("/login", locale)}?redirect=${encodeURIComponent(localizePath("/interviews", locale))}`}
              className="font-medium text-primary-text hover:underline"
            >
              {t("auth.signIn")}
            </Link>
          </div>
        )}
        <Button
          size="lg"
          className="shadow-raised"
          onClick={() => {
            if (!user) {
              setLoginPrompt(true);
              return;
            }
            setShowSubmitForm(true);
          }}
        >
          <PenLine className="me-2 h-4 w-4" aria-hidden="true" />
          {t("interviews.shareExperience")}
        </Button>
      </div>

      {/* Share dialog */}
      {showSubmitForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 pt-10">
          <button type="button" tabIndex={-1} aria-label={tp("site.trust.close")} className="fixed inset-0 cursor-default bg-black/50" onClick={closeForm} />
          <Card className="relative mb-10 w-full max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="share-interview-title">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 id="share-interview-title" className="text-xl font-bold text-fg">
                  {t("interviews.shareExperience")}
                </h2>
                <button
                  type="button"
                  aria-label={tp("site.trust.close")}
                  className="rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  onClick={closeForm}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {submitSuccess && (
                <div role="status" className="mb-4 rounded-lg border border-success-line bg-success-soft p-4 text-success">
                  {t("interviews.shareSuccess")}
                </div>
              )}

              {submitError && (
                <div role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft p-4 text-danger">
                  {submitError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label={t("interviews.companyId")}
                  id="interview-companyId"
                  placeholder={tp("guides.iv.companyIdPlaceholder")}
                  value={formData.companyId}
                  onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                  required
                />
                <Input
                  label={t("interviews.jobTitle")}
                  id="interview-jobTitle"
                  placeholder={tp("guides.iv.jobTitlePlaceholder")}
                  value={formData.jobTitle}
                  onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                  required
                />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="w-full">
                    <label htmlFor="interview-difficulty" className="mb-1 block text-sm font-medium text-fg-secondary">
                      {t("common.difficulty")}
                    </label>
                    <select
                      id="interview-difficulty"
                      className={FIELD_CLASS}
                      value={formData.difficulty}
                      onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                    >
                      {DIFFICULTY_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {tp(DIFFICULTY_LABELS[d])}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full">
                    <label htmlFor="interview-outcome" className="mb-1 block text-sm font-medium text-fg-secondary">
                      {t("common.outcome")}
                    </label>
                    <select
                      id="interview-outcome"
                      className={FIELD_CLASS}
                      value={formData.outcome}
                      onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
                    >
                      {OUTCOME_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {tp(OUTCOME_LABELS[o])}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full">
                    <label htmlFor="interview-type" className="mb-1 block text-sm font-medium text-fg-secondary">
                      {tp("guides.iv.interviewType")}
                    </label>
                    <select
                      id="interview-type"
                      className={FIELD_CLASS}
                      value={formData.interviewType}
                      onChange={(e) => setFormData({ ...formData, interviewType: e.target.value })}
                    >
                      {INTERVIEW_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {tp(TYPE_LABELS[type])}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="w-full">
                  <label htmlFor="interview-process" className="mb-1 block text-sm font-medium text-fg-secondary">
                    {t("interviews.interviewProcess")}
                  </label>
                  <textarea
                    id="interview-process"
                    className={`${FIELD_CLASS} min-h-[100px]`}
                    placeholder={tp("guides.iv.processPlaceholder")}
                    value={formData.process}
                    onChange={(e) => setFormData({ ...formData, process: e.target.value })}
                    required
                  />
                </div>

                {/* Questions */}
                <fieldset className="w-full">
                  <legend className="mb-1 block text-sm font-medium text-fg-secondary">{t("interviews.interviewQuestions")}</legend>
                  {formData.questions.map((q, i) => (
                    <div key={i} className="mb-2 flex gap-2">
                      <Input
                        aria-label={tp("guides.iv.questionN", { n: i + 1 })}
                        placeholder={tp("guides.iv.questionN", { n: i + 1 })}
                        value={q}
                        onChange={(e) => updateQuestion(i, e.target.value)}
                      />
                      {formData.questions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={tp("guides.iv.removeQuestion", { n: i + 1 })}
                          onClick={() => removeQuestion(i)}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
                    {t("interviews.addQuestion")}
                  </Button>
                </fieldset>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="w-full">
                    <label htmlFor="interview-tips" className="mb-1 block text-sm font-medium text-fg-secondary">
                      {t("interviews.tipsForOthers")}
                    </label>
                    <textarea
                      id="interview-tips"
                      className={`${FIELD_CLASS} min-h-[80px]`}
                      placeholder={tp("guides.iv.tipsPlaceholder")}
                      value={formData.tips}
                      onChange={(e) => setFormData({ ...formData, tips: e.target.value })}
                    />
                  </div>
                  <Input
                    label={t("interviews.duration")}
                    id="interview-duration"
                    placeholder={tp("guides.iv.durationPlaceholder")}
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={closeForm}>
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" disabled={submitLoading}>
                    {submitLoading ? t("common.submitting") : t("interviews.shareButton")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function InterviewCard({
  experience,
  isExpanded,
  onToggle,
  onHelpful,
  isHelpfulMarked,
  isHelpfulLoading,
}: {
  experience: InterviewExperienceItem;
  isExpanded: boolean;
  onToggle: () => void;
  onHelpful: () => void;
  isHelpfulMarked: boolean;
  isHelpfulLoading: boolean;
}) {
  const t = useT();
  const tp = usePublicT();
  const locale = useLocale();
  const isSampleScenario = experience.id.startsWith("sample-") || experience.id.startsWith("exp-");
  const detailsId = `interview-details-${experience.id}`;
  const difficultyVariant = experience.difficulty.toUpperCase() === "EASY" ? "success" : experience.difficulty.toUpperCase() === "HARD" ? "danger" : "warning";
  const outcomeVariant =
    experience.outcome.toUpperCase() === "OFFERED"
      ? "success"
      : experience.outcome.toUpperCase() === "REJECTED"
        ? "danger"
        : experience.outcome.toUpperCase() === "NO_RESPONSE"
          ? "warning"
          : "info";

  return (
    <Card className="transition-shadow hover:shadow-raised">
      <CardContent className="p-6">
        <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h3 className="text-lg font-semibold text-fg">{experience.company?.name || tp("guides.iv.unknownCompany")}</h3>
            <p className="text-sm text-fg-secondary">{experience.jobTitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isSampleScenario && <Badge variant="warning">{t("interviews.sampleScenario")}</Badge>}
            <Badge variant={difficultyVariant}>{label(DIFFICULTY_LABELS, experience.difficulty, tp)}</Badge>
            <Badge variant={outcomeVariant}>{label(OUTCOME_LABELS, experience.outcome, tp)}</Badge>
            <Badge variant="info">{label(TYPE_LABELS, experience.interviewType, tp)}</Badge>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs font-semibold text-fg-secondary hover:border-primary hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              aria-expanded={isExpanded}
              aria-controls={detailsId}
              onClick={onToggle}
            >
              {isExpanded ? t("interviews.hideDetails") : t("interviews.viewDetails")}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </div>

        <p className="mb-3 line-clamp-2 text-sm text-fg-secondary">{experience.process}</p>

        {experience.questions.length > 0 && !isExpanded && (
          <p className="mb-3 inline-flex items-center gap-1.5 text-sm text-fg-muted">
            <Lightbulb className="h-4 w-4" aria-hidden="true" />
            {tp("guides.iv.questionsShared", {
              count: experience.questions.length,
            })}
          </p>
        )}

        {/* Expanded detail */}
        {isExpanded && (
          <div id={detailsId} className="mt-4 space-y-4 border-t border-line pt-4">
            <div>
              <h4 className="mb-2 text-sm font-semibold text-fg">{t("interviews.fullProcess")}</h4>
              <p className="whitespace-pre-wrap text-sm text-fg-secondary">{experience.process}</p>
            </div>

            {experience.questions.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-fg">{t("interviews.questionsLabel")}</h4>
                <ul className="list-inside list-disc space-y-1">
                  {experience.questions.map((q, i) => (
                    <li key={i} className="text-sm text-fg-secondary">
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {experience.tips && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-fg">{t("interviews.tipsLabel")}</h4>
                <p className="text-sm text-fg-secondary">{experience.tips}</p>
              </div>
            )}

            {experience.duration && (
              <p className="text-sm text-fg-muted">
                {t("interviews.durationLabel")}: {experience.duration}
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <span className="text-xs text-fg-muted">{new Date(experience.createdAt).toLocaleDateString(locale)}</span>
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed ${
              isHelpfulMarked ? "font-medium text-primary-text" : "text-fg-muted hover:text-primary-text"
            }`}
            disabled={isHelpfulMarked || isHelpfulLoading}
            aria-pressed={isHelpfulMarked}
            aria-label={
              isHelpfulMarked
                ? tp("guides.iv.helpfulMarked", { count: experience.helpfulCount })
                : tp("guides.iv.helpfulMark", { company: experience.company?.name || tp("guides.iv.unknownCompany") })
            }
            onClick={onHelpful}
          >
            <ThumbsUp className="h-4 w-4" aria-hidden="true" />
            {isHelpfulLoading ? "…" : t("common.helpfulLabel")} ({experience.helpfulCount})
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
