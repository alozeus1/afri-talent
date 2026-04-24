"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { mockInterviews } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";

type Difficulty = "easy" | "medium" | "hard";
type Stage = "setup" | "question" | "feedback" | "complete";

interface Question {
  question: string;
  category: string;
  difficulty: Difficulty;
  expectedPoints: string[];
}

interface Feedback {
  score: number;
  feedback: string;
  suggestedAnswer: string;
  strengths: string[];
  improvements: string[];
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
  const [role, setRole] = useState("");
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

  async function handleStart() {
    if (!role.trim()) {
      setError("Please enter a role to practice for.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Create a mock interview session
      const session = await mockInterviews.create({
        title: `${role} Interview Practice`,
        targetRole: role.trim(),
        promptLanguage: "EN",
      });
      setSessionId(session.id);

      // For now, use the question set from the session or generate placeholder questions
      // The backend /generate endpoint will be wired by backend-architect
      // We use the session questionSet if available, else show a message
      const questionSet = Array.isArray(session.questionSet) ? (session.questionSet as string[]) : [];
      const sessionQuestions: Question[] =
        questionSet.length > 0
          ? questionSet.map((q: string) => ({
              question: q,
              category: "behavioral",
              difficulty,
              expectedPoints: ["Specific examples", "Measurable outcomes", "Lessons learned"],
            }))
          : getDefaultQuestions(role.trim(), difficulty);

      setQuestions(sessionQuestions);
      setCurrentIndex(0);
      setAnswer("");
      setFeedback(null);
      setStage("question");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start interview session");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAnswer() {
    if (!answer.trim() || !sessionId) return;
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
      });
      setStage("feedback");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    if (currentIndex + 1 >= questions.length) {
      setStage("complete");
    } else {
      setCurrentIndex((prev) => prev + 1);
      setAnswer("");
      setFeedback(null);
      setStage("question");
    }
  }

  function handleRestart() {
    setStage("setup");
    setRole("");
    setSessionId(null);
    setQuestions([]);
    setCurrentIndex(0);
    setAnswer("");
    setFeedback(null);
    setError(null);
  }

  const currentQuestion = questions[currentIndex];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Interview Prep</h1>
            <p className="text-sm text-gray-500 mt-1">
              Practice with role-specific questions and get instant feedback
            </p>
          </div>
          <Badge variant="info">Premium</Badge>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Setup */}
        {stage === "setup" && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Set Up Your Practice Session</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role to practice for *
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Software Engineer, Product Manager, Data Analyst"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
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

              <Button
                onClick={handleStart}
                disabled={loading || !role.trim()}
                className="w-full"
              >
                {loading ? "Starting session..." : "Start Practice"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {loading && stage !== "setup" && (
          <Card>
            <CardContent className="p-6">
              <LoadingState lines={5} />
            </CardContent>
          </Card>
        )}

        {/* Question */}
        {stage === "question" && currentQuestion && !loading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>
                Question {currentIndex + 1} of {questions.length}
              </span>
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
                <p className="text-base font-medium text-gray-900 leading-relaxed">
                  {currentQuestion.question}
                </p>
                {currentQuestion.expectedPoints.length > 0 && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-md">
                    <p className="text-xs font-medium text-blue-700 mb-1">Key points to cover:</p>
                    <ul className="text-xs text-blue-600 space-y-0.5 list-disc list-inside">
                      {currentQuestion.expectedPoints.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-3">
                <label className="block text-sm font-medium text-gray-700">Your Answer</label>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={7}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Use the STAR method: describe the Situation, your Task, Actions taken, and Results achieved..."
                />
                <Button
                  onClick={handleSubmitAnswer}
                  disabled={loading || !answer.trim()}
                  className="w-full"
                >
                  {loading ? "Evaluating..." : "Submit Answer"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Feedback */}
        {stage === "feedback" && feedback && !loading && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Feedback</h2>
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
                <p className="text-sm text-gray-700 leading-relaxed">{feedback.feedback}</p>

                {feedback.strengths.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">
                      Strengths
                    </p>
                    <ul className="text-sm text-gray-700 space-y-0.5 list-disc list-inside">
                      {feedback.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1">
                    Improvements
                  </p>
                  <ul className="text-sm text-gray-700 space-y-0.5 list-disc list-inside">
                    {feedback.improvements.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="border-t pt-4">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
                    Suggested Answer
                  </p>
                  <p className="text-sm text-gray-600 leading-relaxed italic">
                    {feedback.suggestedAnswer}
                  </p>
                </div>

                <Button onClick={handleNext} className="w-full">
                  {currentIndex + 1 >= questions.length ? "Finish Session" : "Next Question →"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Complete */}
        {stage === "complete" && (
          <Card>
            <CardContent className="flex flex-col items-center text-center py-10 gap-4">
              <div className="text-4xl">🎉</div>
              <h2 className="text-xl font-semibold">Session Complete!</h2>
              <p className="text-sm text-gray-500 max-w-sm">
                Great work practising for your <strong>{role}</strong> interview. Review your
                feedback above and keep practising to improve your score.
              </p>
              <div className="flex gap-3">
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
      </div>
    </div>
  );
}

function getDefaultQuestions(role: string, difficulty: Difficulty): Question[] {
  return [
    {
      question: `Tell me about your experience relevant to a ${role} role.`,
      category: "behavioral",
      difficulty,
      expectedPoints: ["Specific examples", "Measurable outcomes", "Relevance to role"],
    },
    {
      question: "Describe a challenging project and how you handled it.",
      category: "situational",
      difficulty,
      expectedPoints: ["STAR method", "Clear problem", "Your specific actions", "Result"],
    },
    {
      question: "How do you prioritise tasks when you have multiple deadlines?",
      category: "behavioral",
      difficulty,
      expectedPoints: ["Prioritisation framework", "Communication", "Concrete example"],
    },
    {
      question: "Where do you see yourself in three years?",
      category: "behavioral",
      difficulty,
      expectedPoints: ["Career alignment", "Growth mindset", "Company fit"],
    },
    {
      question: "What is your biggest professional achievement?",
      category: "behavioral",
      difficulty,
      expectedPoints: ["Quantifiable result", "Personal contribution", "Impact"],
    },
  ];
}
