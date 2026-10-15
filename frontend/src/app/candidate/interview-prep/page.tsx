"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Info } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { mockInterviews } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";
import { trackEvent } from "@/lib/analytics";
import { EarlyTesterFeedback } from "@/components/feedback/early-tester-feedback";
import { FREE_MODE } from "@/lib/free-mode";
import {
  INTERVIEW_INSIGHTS,
  INTERVIEW_ROLE_TRACKS,
  InterviewDifficulty,
  InterviewPracticeQuestion,
  evaluateInterviewAnswerLocally,
  getInterviewQuestionsForRole,
} from "@/lib/early-tester-content";
import {
  CandidateBackLink,
  CandidateNotice,
  CandidatePageHeader,
  CandidateSpinner,
  candidateFieldClass,
  candidateLabelClass,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { enumLabel, useCandidateT, type CandidateMessageKey } from "@/lib/i18n/candidate-messages";
import { useLocalizedContent } from "@/lib/i18n/content";

type Difficulty = InterviewDifficulty;
type Stage = "setup" | "question" | "feedback" | "complete";
type Question = InterviewPracticeQuestion;

interface Feedback {
  score: number;
  feedback: string;
  suggestedAnswer: string;
  strengths: string[];
  improvements: string[];
  source?: "ai" | "heuristic";
}

const DIFFICULTY_OPTIONS: { value: Difficulty; active: string }[] = [
  { value: "easy", active: "border-success-line bg-success-soft text-success" },
  { value: "medium", active: "border-warning-line bg-warning-soft text-warning" },
  { value: "hard", active: "border-danger-line bg-danger-soft text-danger" },
];

export default function InterviewPrepPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const content = useLocalizedContent();
  // Display copy is localized; the English role stays the selection key.
  const localizedTracks = content.interviewTracks(INTERVIEW_ROLE_TRACKS);
  const localizedInsights = content.interviewInsights(INTERVIEW_INSIGHTS);

  const [stage, setStage] = useState<Stage>("setup");
  const [role, setRole] = useState(INTERVIEW_ROLE_TRACKS[0].role);
  const [customRole, setCustomRole] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<CandidateMessageKey | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push(localizePath("/login", locale));
  }, [authLoading, user, router, locale]);

  if (authLoading || !user) return <CandidateSpinner className="py-24" />;

  const targetRole = (customRole.trim() || role).trim();

  async function handleStart() {
    if (!targetRole) {
      setNotice("ip.chooseRole");
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const session = await mockInterviews.create({
        title: t("ip.sessionTitle", { role: targetRole }),
        targetRole,
        promptLanguage: locale.toUpperCase() as "EN" | "ES" | "FR" | "PT" | "AR",
      });
      setSessionId(session.id);

      const questionSet = Array.isArray(session.questionSet) ? (session.questionSet as string[]) : [];
      const sessionQuestions: Question[] =
        questionSet.length > 0
          ? questionSet.map((q: string) => ({
              question: q,
              category: "behavioral",
              difficulty,
              expectedPoints: [t("ip.pt.examples"), t("ip.pt.outcomes"), t("ip.pt.lessons")],
            }))
          : getDefaultQuestions(targetRole, difficulty);

      setQuestions(sessionQuestions);
      setCurrentIndex(0);
      setAnswer("");
      setFeedback(null);
      setStage("question");
      trackEvent("interview_prep_session_started", { role: targetRole, difficulty });
    } catch {
      setNotice("ip.startFailed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAnswer(event?: React.FormEvent) {
    event?.preventDefault();
    if (!answer.trim() || !sessionId || !questions[currentIndex]) return;
    setLoading(true);
    setNotice(null);
    try {
      const result = await mockInterviews.submitAnswer(sessionId, {
        question: questions[currentIndex].question,
        answer: answer.trim(),
      });
      setFeedback({
        score: result.score,
        feedback: result.feedback,
        suggestedAnswer: result.suggestedAnswer,
        strengths: result.strengths,
        improvements: [...result.improvements, ...(result.talkingPoints ?? [])],
        source: result.source,
      });
      setStage("feedback");
      trackEvent("interview_question_answered", {
        role: targetRole,
        category: questions[currentIndex].category,
        source: result.source,
      });
    } catch {
      setFeedback(evaluateInterviewAnswerLocally(questions[currentIndex], answer.trim()));
      setStage("feedback");
      setNotice("ip.localFallback");
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    if (currentIndex + 1 >= questions.length) {
      setStage("complete");
      return;
    }
    setCurrentIndex((prev) => prev + 1);
    setAnswer("");
    setFeedback(null);
    setNotice(null);
    setStage("question");
  }

  function handleRestart() {
    setStage("setup");
    setRole(INTERVIEW_ROLE_TRACKS[0].role);
    setCustomRole("");
    setSessionId(null);
    setQuestions([]);
    setCurrentIndex(0);
    setAnswer("");
    setFeedback(null);
    setNotice(null);
  }

  const currentQuestion = questions[currentIndex];
  const scoreTone = (score: number) => (score >= 70 ? "text-success" : score >= 50 ? "text-warning" : "text-danger");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-12">
      <CandidateBackLink href={localizePath("/candidate", locale)}>{t("ai.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader
        title={t("ip.title")}
        description={t("ip.subtitle")}
        actions={<Badge variant={FREE_MODE ? "success" : "info"}>{FREE_MODE ? t("ui.includedFree") : t("ui.premium")}</Badge>}
      />

      <div className="space-y-6">
        <div className="flex gap-3 rounded-xl border border-info-line bg-info-soft p-4 text-sm text-fg-secondary">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          <p>
            {t("ip.disclaimer")}
            {locale !== "en" ? <span className="mt-1 block text-xs text-fg-muted">{t("ip.contentNote")}</span> : null}
          </p>
        </div>

        {notice && (
          <CandidateNotice tone={notice === "ip.localFallback" ? "warning" : "danger"}>{t(notice)}</CandidateNotice>
        )}

        {stage === "setup" && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-fg">{t("ip.setup")}</h2>
            </CardHeader>
            <CardContent className="space-y-6">
              <fieldset>
                <legend className={candidateLabelClass}>
                  {t("ip.roleTrack")} <span aria-hidden="true" className="text-danger">*</span>
                </legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {INTERVIEW_ROLE_TRACKS.map((track, index) => {
                    const shown = localizedTracks[index];
                    const active = role === track.role && !customRole;
                    return (
                      <button
                        key={track.role}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setRole(track.role);
                          setCustomRole("");
                        }}
                        className={`rounded-xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                          active ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-strong"
                        }`}
                      >
                        <span className={`block text-sm font-semibold ${active ? "text-primary-text" : "text-fg"}`} dir="auto">
                          {shown.role}
                        </span>
                        <span className="mt-1 block text-xs text-fg-muted" dir="auto">
                          {shown.focus}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value)}
                  className={`${candidateFieldClass} mt-3`}
                  placeholder={t("ip.customRole")}
                  aria-label={t("ip.customRoleLabel")}
                />
              </fieldset>

              <fieldset>
                <legend className={candidateLabelClass}>{t("ip.difficulty")}</legend>
                <div className="flex gap-3">
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={difficulty === d.value}
                      onClick={() => setDifficulty(d.value)}
                      className={`flex-1 rounded-xl border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                        difficulty === d.value ? d.active : "border-line bg-surface text-fg-secondary hover:border-line-strong"
                      }`}
                    >
                      {t(`ip.diff.${d.value}` as CandidateMessageKey)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <Button onClick={handleStart} disabled={loading || !targetRole} className="w-full">
                {loading ? t("ip.starting") : t("ip.start")}
              </Button>
            </CardContent>
          </Card>
        )}

        {loading && stage !== "setup" && (
          <Card>
            <CardContent className="p-6">
              <LoadingState lines={5} />
            </CardContent>
          </Card>
        )}

        {stage === "question" && currentQuestion && !loading && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg-muted">
              <span>{t("ip.questionOf", { n: currentIndex + 1, total: questions.length })}</span>
              <div className="flex gap-2">
                <Badge variant="default">{enumLabel(t, "ip.cat", currentQuestion.category)}</Badge>
                <Badge
                  variant={
                    currentQuestion.difficulty === "hard" ? "danger" : currentQuestion.difficulty === "medium" ? "warning" : "success"
                  }
                >
                  {enumLabel(t, "ip.diff", currentQuestion.difficulty)}
                </Badge>
              </div>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={questions.length}
              aria-valuenow={currentIndex + 1}
              aria-label={t("ip.questionOf", { n: currentIndex + 1, total: questions.length })}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
            </div>

            <Card>
              <CardContent className="pt-6">
                <p className="text-base font-medium leading-relaxed text-fg" dir="auto">
                  {currentQuestion.question}
                </p>
                {currentQuestion.expectedPoints.length > 0 && (
                  <div className="mt-4 rounded-xl border border-info-line bg-info-soft p-3">
                    <p className="mb-1 text-xs font-semibold text-info">{t("ip.keyPoints")}</p>
                    <ul className="list-inside list-disc space-y-0.5 text-xs text-fg-secondary" dir="auto">
                      {currentQuestion.expectedPoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <form className="space-y-3" onSubmit={handleSubmitAnswer}>
                  <label htmlFor="interview-answer" className={candidateLabelClass}>
                    {t("ip.yourAnswer")}
                  </label>
                  <textarea
                    id="interview-answer"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={7}
                    className={`${candidateFieldClass} resize-y`}
                    placeholder={t("ip.answerPlaceholder")}
                  />
                  <Button type="submit" disabled={loading || !answer.trim()} className="w-full">
                    {loading ? t("ip.evaluating") : t("ip.submit")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {stage === "feedback" && feedback && !loading && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-fg">{t("ip.feedback")}</h2>
                  {feedback.source && (
                    <Badge variant={feedback.source === "ai" ? "info" : "warning"}>
                      {feedback.source === "ai" ? t("ip.aiFeedback") : t("ip.localFeedback")}
                    </Badge>
                  )}
                </div>
                <div className={`text-2xl font-semibold tabular-nums ${scoreTone(feedback.score)}`} aria-label={t("ip.score", { score: feedback.score })}>
                  {feedback.score}/100
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-fg-secondary" dir="auto">
                {feedback.feedback}
              </p>

              {feedback.strengths.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-success">{t("ip.strengths")}</p>
                  <ul className="list-inside list-disc space-y-0.5 text-sm text-fg-secondary" dir="auto">
                    {feedback.strengths.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {feedback.improvements.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning">{t("ip.improvements")}</p>
                  <ul className="list-inside list-disc space-y-0.5 text-sm text-fg-secondary" dir="auto">
                    {feedback.improvements.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-line pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-info">{t("ip.suggested")}</p>
                <p className="text-sm italic leading-relaxed text-fg-secondary" dir="auto">
                  {feedback.suggestedAnswer}
                </p>
              </div>

              <Button onClick={handleNext} className="w-full">
                {currentIndex + 1 >= questions.length ? t("ip.finish") : t("ip.next")}
              </Button>
            </CardContent>
          </Card>
        )}

        {stage === "complete" && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-fg">{t("ip.complete")}</h2>
              <p className="max-w-sm text-sm text-fg-muted">{t("ip.completeBody", { role: targetRole })}</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={handleRestart}>{t("ip.again")}</Button>
                <Button variant="outline" onClick={() => router.push(localizePath("/candidate/applications", locale))}>
                  {t("ip.viewApps")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-fg">{t("ip.insights")}</h2>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {localizedInsights.slice(0, 8).map((insight) => (
              <div key={insight.id} className="rounded-xl border border-line bg-surface-sunken p-3" dir="auto">
                <p className="text-sm font-semibold text-fg">{insight.title}</p>
                <p className="mt-1 text-xs text-fg-secondary">{insight.summary}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <EarlyTesterFeedback area="Interview prep usefulness" />
      </div>
    </div>
  );
}

function getDefaultQuestions(role: string, difficulty: Difficulty): Question[] {
  return [
    ...getInterviewQuestionsForRole(role, difficulty),
    {
      question: `Tell me about your experience relevant to a ${role} role.`,
      category: "behavioral" as const,
      difficulty,
      expectedPoints: ["Specific examples", "Measurable outcomes", "Relevance to role"],
    },
    {
      question: "Describe a challenging project and how you handled it using the STAR method.",
      category: "star practice" as const,
      difficulty,
      expectedPoints: ["Situation", "Task", "Action", "Result"],
    },
  ].slice(0, 6);
}
