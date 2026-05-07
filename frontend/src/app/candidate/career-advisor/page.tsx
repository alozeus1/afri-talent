"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { skills, CareerAdviceResult } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toFriendlyError, type FriendlyError } from "@/lib/friendly-error";

const priorityVariant: Record<string, "danger" | "warning" | "default"> = {
  high: "danger",
  medium: "warning",
  low: "default",
};

export default function CareerAdvisorPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [targetRole, setTargetRole] = useState("");
  const [advice, setAdvice] = useState<CareerAdviceResult | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; targetRole: string | null; createdAt: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<FriendlyError | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await skills.getCareerHistory(5);
      setHistory(
        data.sessions.map((s) => ({ id: s.id, targetRole: s.targetRole, createdAt: s.createdAt }))
      );
      if (data.sessions.length > 0) {
        setAdvice(data.sessions[0].adviceContent);
        setTargetRole(data.sessions[0].targetRole || "");
      }
    } catch {
      // no history — fine
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    void loadHistory();
  }, [user, authLoading, loadHistory, router]);

  async function handleAnalyse() {
    if (!targetRole.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await skills.analyseCareer({ targetRole });
      setAdvice(result.advice);
      await loadHistory();
    } catch (err) {
      setError(toFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  if (historyLoading) return <DashboardSkeleton />;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Career Advisor</h1>
            <p className="text-sm text-gray-500 mt-1">
              AI-powered skill gap analysis and career path recommendations
            </p>
          </div>
          <Badge variant="info">Premium</Badge>
        </div>

        {/* Run new analysis */}
        <Card>
          <CardContent className="py-5 px-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Role
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Senior Software Engineer, Product Manager"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button onClick={handleAnalyse} disabled={loading || !targetRole.trim()}>
                {loading ? "Analysing..." : advice ? "Re-Analyse" : "Analyse Career"}
              </Button>
            </div>
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                data-testid="career-advisor-error"
                className={`mt-3 rounded-md border p-3 text-sm ${
                  error.tone === "error"
                    ? "bg-red-50 border-red-200 text-red-800"
                    : error.tone === "warning"
                      ? "bg-amber-50 border-amber-200 text-amber-900"
                      : "bg-blue-50 border-blue-200 text-blue-900"
                }`}
              >
                <p className="font-medium">{error.title}</p>
                <p className="mt-0.5">{error.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {!advice && !loading && (
          <EmptyState
            testId="career-advisor-empty"
            title="No analysis yet"
            description="Enter a target role above and we will map the skill gaps, salary range, and a 90-day plan."
          />
        )}

        {advice && (
          <div className="space-y-4">
            {/* Summary */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-900">Overview</h2>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 leading-relaxed">{advice.summary}</p>
              </CardContent>
            </Card>

            {/* Salary */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-900">Salary Expectation</h2>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-gray-900">
                  {advice.salaryRange.currency} {advice.salaryRange.min.toLocaleString()} –{" "}
                  {advice.salaryRange.max.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 mt-1">{advice.salaryRange.market}</p>
              </CardContent>
            </Card>

            {/* Skill Gaps */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-900">Skill Gaps</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                {advice.skillGaps.map((gap, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Badge variant={priorityVariant[gap.priority] || "default"}>
                      {gap.priority}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{gap.skill}</p>
                      <p className="text-xs text-gray-500">{gap.reason}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Career Paths */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-900">Career Paths</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                {advice.careerPaths.map((path, i) => (
                  <div key={i} className="border border-gray-100 rounded-md p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-gray-900">{path.title}</p>
                      <Badge variant="info">{path.timeline}</Badge>
                    </div>
                    <p className="text-xs text-gray-500">{path.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Certifications */}
            {advice.certifications.length > 0 && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-gray-900">Recommended Certifications</h2>
                </CardHeader>
                <CardContent className="space-y-3">
                  {advice.certifications.map((cert, i) => (
                    <div key={i} className="border border-gray-100 rounded-md p-3">
                      <p className="text-sm font-semibold text-gray-900">{cert.name}</p>
                      <p className="text-xs text-gray-400">{cert.provider}</p>
                      <p className="text-xs text-gray-500 mt-1">{cert.rationale}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* 90-Day Action Plan */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-900">90-Day Action Plan</h2>
              </CardHeader>
              <CardContent className="space-y-2">
                {advice.actionPlan.map((step, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <Badge variant="default" className="shrink-0">{step.week}</Badge>
                    <p className="text-sm text-gray-700">{step.action}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* History */}
        {history.length > 1 && (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-medium text-gray-600">Previous Sessions</h2>
            </CardHeader>
            <CardContent className="space-y-1">
              {history.map((session) => (
                <p key={session.id} className="text-xs text-gray-500">
                  {session.targetRole || "Untitled"} —{" "}
                  {new Date(session.createdAt).toLocaleDateString()}
                </p>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
