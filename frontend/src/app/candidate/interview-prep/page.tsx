"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { mockInterviews } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";
import { trackEvent } from "@/lib/analytics";
import {
  INTERVIEW_INSIGHTS,
  INTERVIEW_ROLE_TRACKS,
  InterviewDifficulty,
  InterviewPracticeQuestion,
  evaluateInterviewAnswerLocally,
  getInterviewQuestionsForRole,
} from "@/lib/early-tester-content";

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

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; color: string }[] = [
  { value: "easy", label: "Easy", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "medium", label: "Medium", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "hard", label: "Hard", color: "bg-red-100 text-red-700 border-red-200" },
];

export default function InterviewPrepPage() {
  const { user } = useAuth();
  const router = useRouter();

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
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    router.push("/login");
    return null;
  }

  const targetRole = (customRole.trim() || role).trim();

  async function handleStart() {
    if (!targetRole) {
      setError("Please choose or enter a role to practice for.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await mockInterviews.create({
        title: `${targetRole} Interview Practice`,
        targetRole,
        promptLanguage: "EN",
      });
      setSessionId(session.id);

      const questionSet = Array.isArray(session.questionSet) ? (session.questionSet as string[]) : [];
      const sessionQuestions: Question[] =
        questionSet.length > 0
          ? questionSet.map((q: string) => ({
              question: q,
              category: "behavioral",
              difficulty,
              expectedPoints: ["Specific examples", "Measurable outcomes", "Lessons learned"],
            }))
          : getDefaultQuestions(targetRole, difficulty);

      setQuestions(sessionQuestions);
      setCurrentIndex(0);
      setAnswer("");
      setFeedback(null);
      setStage("question");
      trackEvent("interview_prep_session_started", { role: targetRole, difficulty });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start interview session");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAnswer() {
    if (!answer.trim() || !sessionId || !questions[currentIndex]) return;
    setLoading(true);
    setError(null);
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
    } catch (err) {
      const fallback = evaluateInterviewAnswerLocally(questions[currentIndex], answer.trim());
      setFeedback(fallback);
      setStage("feedback");
      setError(
        err instanceof Error
          ? `AI feedback was unavailable, so local practice feedback is shown. ${err.message}`
          : "AI feedback was unavailable, so local practice feedback is shown.",
      );
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
    setError(null);
  }

  const currentQuestion = questions[currentIndex];

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Interview Prep</h1>
            <p className="mt-1 text-sm text-gray-500">
              Practice with role-specific questions, structured feedback, and starter interview insights.
            </p>
          </div>
          <Badge variant="info">Premium</Badge>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          AI and local feedback are practice guidance only. They are not a hiring decision and should be reviewed against your real experience.
        </div>

        {error && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {error}
          </div>
        )}

        {stage === "setup" && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Set Up Your Practice Session</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Choose a role track *
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {INTERVIEW_ROLE_TRACKS.map((track) => (
                    <button
                      key={track.role}
                      type="button"
                      onClick={() => {
                        setRole(track.role);
                        setCustomRole("");
                      }}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        role === track.role && !customRole
                          ? "border-blue-500 bg-blue-50 text-blue-900"
                          : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
                      }`}
                    >
                      <span className="block text-sm font-semibold">{track.role}</span>
                      <span className="mt-1 block text-xs text-gray-500">{track.focus}</span>
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value)}
                  className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Or enter a custom role"
                  aria-label="Custom interview role"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Difficulty
                </label>
                <div className="flex gap-3">
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDifficulty(d.value)}
                      className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                        difficulty === d.value
                          ? d.color
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={handleStart} disabled={loading || !targetRole} className="w-full">
                {loading ? "Starting session..." : "Start Practice"}
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
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Question {currentIndex + 1} of {questions.length}</span>
              <div className="flex gap-2">
                <Badge variant="default">{currentQuestion.category}</Badge>
                <Badge
                  variant={
                    currentQuestion.difficulty === "hard"
                      ? "danger"
                      : currentQuestion.difficulty === "medium"
                        ? "default"
                        : "success"
                  }
                >
                  {currentQuestion.difficulty}
                </Badge>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6">
                <p className="text-base font-medium leading-relaxed text-gray-900">
                  {currentQuestion.question}
                </p>
                {currentQuestion.expectedPoints.length > 0 && (
                  <div className="mt-4 rounded-md bg-blue-50 p-3">
                    <p className="mb-1 text-xs font-medium text-blue-700">Key points to cover:</p>
                    <ul className="list-inside list-disc space-y-0.5 text-xs text-blue-600">
                      {currentQuestion.expectedPoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 pt-6">
                <label className="block text-sm font-medium text-gray-700">Your Answer</label>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={7}
                  className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Use the STAR method: describe the Situation, your Task, Actions taken, and Results achieved..."
                />
                <Button onClick={handleSubmitAnswer} disabled={loading || !answer.trim()} className="w-full">
                  {loading ? "Evaluating..." : "Submit Answer"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {stage === "feedback" && feedback && !loading && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">Feedback</h2>
                    {feedback.source && (
                      <Badge variant={feedback.source === "ai" ? "info" : "warning"}>
                        {feedback.source === "ai" ? "AI feedback" : "Local fallback"}
                      </Badge>
                    )}
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      feedback.score >= 70
                        ? "text-green-600"
                        : feedback.score >= 50
                          ? "text-yellow-600"
                          : "text-red-500"
                    }`}
                  >
                    {feedback.score}/100
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed text-gray-700">{feedback.feedback}</p>

                {feedback.strengths.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">
                      Strengths
                    </p>
                    <ul className="list-inside list-disc space-y-0.5 text-sm text-gray-700">
                      {feedback.strengths.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-600">
                    Improvements
                  </p>
                  <ul className="list-inside list-disc space-y-0.5 text-sm text-gray-700">
                    {feedback.improvements.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="border-t pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                    Suggested Answer Shape
                  </p>
                  <p className="text-sm italic leading-relaxed text-gray-600">
                    {feedback.suggestedAnswer}
                  </p>
                </div>

                <Button onClick={handleNext} className="w-full">
                  {currentIndex + 1 >= questions.length ? "Finish Session" : "Next Question"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {stage === "complete" && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="text-4xl">Done</div>
              <h2 className="text-xl font-semibold">Session Complete</h2>
              <p className="max-w-sm text-sm text-gray-500">
                You completed a practice session for <strong>{targetRole}</strong>. Review your feedback and repeat the session with a harder difficulty when ready.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={handleRestart}>Practice Again</Button>
                <Button
                  onClick={() => router.push("/candidate/applications")}
                  className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                >
                  View Applications
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Interview insight starters</h2>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {INTERVIEW_INSIGHTS.slice(0, 8).map((insight) => (
              <div key={insight.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-sm font-semibold text-gray-900">{insight.title}</p>
                <p className="mt-1 text-xs text-gray-600">{insight.summary}</p>
              </div>
            ))}
          </CardContent>
        </Card>
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
