"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { skillsAssessments, SkillAssessmentItem } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const levelVariants: Record<string, "default" | "info" | "success" | "warning"> = {
  beginner: "default",
  intermediate: "info",
  advanced: "warning",
  expert: "success",
};

const levelColors: Record<string, string> = {
  beginner: "text-gray-600",
  intermediate: "text-blue-600",
  advanced: "text-purple-600",
  expert: "text-emerald-600",
};

function CircularProgress({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 15.9155;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#059669" : score >= 60 ? "#2563eb" : score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative h-16 w-16 flex-shrink-0">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
        <circle
          cx="18" cy="18" r="15.9155"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="3"
        />
        <circle
          cx="18" cy="18" r="15.9155"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900">
        {score}%
      </span>
    </div>
  );
}

export default function CandidateSkillsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [myAssessments, setMyAssessments] = useState<SkillAssessmentItem[]>([]);
  const [availableSkills, setAvailableSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingSkill, setStartingSkill] = useState<string | null>(null);
  const [activeAssessment, setActiveAssessment] = useState<SkillAssessmentItem | null>(null);
  const [scoreInput, setScoreInput] = useState(75);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const [assessments, available] = await Promise.all([
        skillsAssessments.list(),
        skillsAssessments.available(),
      ]);
      setMyAssessments(assessments);
      setAvailableSkills(available);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assessments");
    } finally {
      setLoading(false);
    }
  };

  const handleStartAssessment = async (skillName: string) => {
    setStartingSkill(skillName);
    try {
      const assessment = await skillsAssessments.start(skillName);
      setActiveAssessment(assessment);
      setScoreInput(75);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start assessment");
    } finally {
      setStartingSkill(null);
    }
  };

  const handleCompleteAssessment = async () => {
    if (!activeAssessment) return;
    setSubmitting(true);
    try {
      await skillsAssessments.complete(activeAssessment.id, scoreInput);
      setActiveAssessment(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete assessment");
    } finally {
      setSubmitting(false);
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Back Link */}
      <Link href="/candidate" className="inline-flex items-center text-emerald-600 hover:text-emerald-700 mb-6">
        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Validate Your Skills</h1>
        <p className="text-gray-600 text-lg">Take assessments to stand out to employers</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      ) : (
        <>
          {/* Active Assessment Modal */}
          {activeAssessment && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-md">
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {activeAssessment.skillName} Assessment
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Complete the assessment and submit your score.
                  </p>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Score: {scoreInput}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={scoreInput}
                      onChange={(e) => setScoreInput(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0</span>
                      <span>25</span>
                      <span>50</span>
                      <span>75</span>
                      <span>100</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={handleCompleteAssessment}
                      disabled={submitting}
                      className="flex-1"
                    >
                      {submitting ? "Submitting..." : "Submit Score"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setActiveAssessment(null)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Section 1: My Assessments */}
          <div className="mb-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">My Assessments</h2>
            {myAssessments.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="text-4xl mb-4">🎯</div>
                  <p className="text-gray-600">Take your first assessment to showcase your abilities</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {myAssessments.map((assessment) => (
                  <Card key={assessment.id}>
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        {assessment.score !== null ? (
                          <CircularProgress score={assessment.score} />
                        ) : (
                          <div className="h-16 w-16 flex-shrink-0 rounded-full bg-gray-100 flex items-center justify-center">
                            <span className="text-gray-400 text-sm">—</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 truncate">
                            {assessment.skillName}
                          </h3>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <Badge
                              variant={
                                assessment.status === "COMPLETED" ? "success" : "info"
                              }
                            >
                              {assessment.status}
                            </Badge>
                            {assessment.level && (
                              <Badge
                                variant={levelVariants[assessment.level.toLowerCase()] || "default"}
                              >
                                {assessment.level}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Score bar */}
                      {assessment.score !== null && (
                        <div className="mt-4">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                assessment.score >= 80
                                  ? "bg-emerald-500"
                                  : assessment.score >= 60
                                  ? "bg-blue-500"
                                  : assessment.score >= 40
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                              }`}
                              style={{ width: `${assessment.score}%` }}
                            />
                          </div>
                          <p className={`text-xs mt-1 ${levelColors[assessment.level?.toLowerCase() || ""] || "text-gray-500"}`}>
                            Score: {assessment.score}/100
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Available Assessments */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Available Assessments</h2>
            {availableSkills.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-gray-600">No additional assessments available at this time.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {availableSkills.map((skillName) => (
                  <Card key={skillName} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5 text-center">
                      <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                        <span className="text-emerald-600 text-lg font-bold">
                          {skillName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-3">{skillName}</h3>
                      <Button
                        size="sm"
                        onClick={() => handleStartAssessment(skillName)}
                        disabled={startingSkill === skillName}
                      >
                        {startingSkill === skillName ? "Starting..." : "Start Assessment"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
