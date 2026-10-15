"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { skillsAssessments, SkillAssessmentItem } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardGridSkeleton } from "@/components/ui/skeleton";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidateNotice,
  CandidatePageHeader,
  CandidateSpinner,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { enumLabel, useCandidateT, type CandidateMessageKey } from "@/lib/i18n/candidate-messages";

const levelVariants: Record<string, "default" | "info" | "success" | "warning"> = {
  beginner: "default",
  intermediate: "info",
  advanced: "warning",
  expert: "success",
};

function scoreTone(score: number) {
  if (score >= 80) return { stroke: "var(--success)", bar: "bg-success" };
  if (score >= 60) return { stroke: "var(--info)", bar: "bg-info" };
  if (score >= 40) return { stroke: "var(--warning)", bar: "bg-warning" };
  return { stroke: "var(--danger)", bar: "bg-danger" };
}

function CircularProgress({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 15.9155;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--line-strong)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          stroke={scoreTone(score).stroke}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-fg">{score}%</span>
    </div>
  );
}

export default function CandidateSkillsPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const { user, isLoading } = useAuth();
  const [myAssessments, setMyAssessments] = useState<SkillAssessmentItem[]>([]);
  const [availableSkills, setAvailableSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<CandidateMessageKey | null>(null);
  const [startingSkill, setStartingSkill] = useState<string | null>(null);
  const [activeAssessment, setActiveAssessment] = useState<SkillAssessmentItem | null>(null);
  const [scoreInput, setScoreInput] = useState(75);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const [assessments, available] = await Promise.all([skillsAssessments.list(), skillsAssessments.available()]);
      setMyAssessments(assessments);
      setAvailableSkills(available);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "CANDIDATE") loadData();
  }, [user, loadData]);

  useEffect(() => {
    if (!activeAssessment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) setActiveAssessment(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeAssessment, submitting]);

  const handleStartAssessment = async (skillName: string) => {
    setStartingSkill(skillName);
    setActionError(null);
    try {
      const assessment = await skillsAssessments.start(skillName);
      setActiveAssessment(assessment);
      setScoreInput(75);
    } catch {
      setActionError("skills.err.start");
    } finally {
      setStartingSkill(null);
    }
  };

  const handleCompleteAssessment = async () => {
    if (!activeAssessment) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await skillsAssessments.complete(activeAssessment.id, scoreInput);
      setActiveAssessment(null);
      await loadData();
    } catch {
      setActionError("skills.err.complete");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !user) {
    return <CandidateSpinner className="py-24" />;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CandidateBackLink href={localizePath("/candidate", locale)}>{t("nav.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader title={t("skills.title")} description={t("skills.subtitle")} />

      {actionError && <CandidateNotice className="mb-6">{t(actionError)}</CandidateNotice>}

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : loadError ? (
        <CandidateLoadError error={loadError} subject={t("ui.subject.skills")} onRetry={loadData} />
      ) : (
        <>
          {activeAssessment && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="assessment-dialog-title"
                className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-overlay"
              >
                <h3 id="assessment-dialog-title" className="mb-2 text-xl font-semibold text-fg">
                  {t("skills.modal.title", { skill: activeAssessment.skillName })}
                </h3>
                <p className="mb-6 text-fg-secondary">{t("skills.modal.body")}</p>
                <div className="mb-6">
                  <label htmlFor="assessment-score" className="mb-2 block text-sm font-medium text-fg-secondary">
                    {t("skills.modal.score", { score: scoreInput })}
                  </label>
                  <input
                    id="assessment-score"
                    type="range"
                    min="0"
                    max="100"
                    value={scoreInput}
                    onChange={(e) => setScoreInput(Number(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-muted accent-[var(--primary)]"
                  />
                  <div aria-hidden="true" className="mt-1 flex justify-between text-xs text-fg-muted">
                    <span>0</span>
                    <span>25</span>
                    <span>50</span>
                    <span>75</span>
                    <span>100</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleCompleteAssessment} disabled={submitting} className="flex-1">
                    {submitting ? t("skills.modal.submitting") : t("skills.modal.submit")}
                  </Button>
                  <Button variant="outline" onClick={() => setActiveAssessment(null)} disabled={submitting}>
                    {t("ui.cancel")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <section className="mb-12" aria-labelledby="my-assessments-heading">
            <h2 id="my-assessments-heading" className="mb-4 text-lg font-semibold text-fg">
              {t("skills.mine")}
            </h2>
            {myAssessments.length === 0 ? (
              <EmptyState
                icon={<Target className="h-6 w-6" />}
                title={t("skills.mineEmpty")}
                description={t("skills.mineEmptyBody")}
              />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {myAssessments.map((assessment) => (
                  <li key={assessment.id}>
                    <Card className="h-full">
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          {assessment.score !== null ? (
                            <CircularProgress score={assessment.score} />
                          ) : (
                            <div
                              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface-muted"
                              aria-label={t("skills.notScored")}
                            >
                              <span aria-hidden="true" className="text-sm text-fg-muted">
                                —
                              </span>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-semibold text-fg">{assessment.skillName}</h3>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <Badge variant={assessment.status === "COMPLETED" ? "success" : "info"}>
                                {enumLabel(t, "skills.status", assessment.status)}
                              </Badge>
                              {assessment.level && (
                                <Badge variant={levelVariants[assessment.level.toLowerCase()] || "default"}>
                                  {enumLabel(t, "skills.level", assessment.level.toLowerCase())}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        {assessment.score !== null && (
                          <div className="mt-4">
                            <div className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                              <div
                                className={`h-full rounded-full transition-all ${scoreTone(assessment.score).bar}`}
                                style={{ width: `${assessment.score}%` }}
                              />
                            </div>
                            <p className="mt-1 text-xs text-fg-muted">{t("skills.scoreOf", { score: assessment.score })}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="available-assessments-heading">
            <h2 id="available-assessments-heading" className="mb-4 text-lg font-semibold text-fg">
              {t("skills.available")}
            </h2>
            {availableSkills.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-fg-secondary">{t("skills.availableEmpty")}</CardContent>
              </Card>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {availableSkills.map((skillName) => (
                  <li key={skillName}>
                    <Card className="h-full transition-shadow hover:shadow-card">
                      <CardContent className="p-5 text-center">
                        <span
                          aria-hidden="true"
                          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-lg font-bold text-primary-text"
                        >
                          {skillName.charAt(0).toUpperCase()}
                        </span>
                        <h3 className="mb-3 font-semibold text-fg">{skillName}</h3>
                        <Button
                          size="sm"
                          onClick={() => handleStartAssessment(skillName)}
                          disabled={startingSkill === skillName}
                        >
                          {startingSkill === skillName ? t("skills.starting") : t("skills.start")}
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
