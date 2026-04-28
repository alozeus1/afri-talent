"use client";

import { useEffect, useState, useCallback } from "react";
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

const DIFFICULTY_OPTIONS = ["EASY", "MEDIUM", "HARD"];
const OUTCOME_OPTIONS = ["OFFERED", "REJECTED", "NO_RESPONSE", "IN_PROGRESS"];
const INTERVIEW_TYPES = [
  "PHONE_SCREEN",
  "TECHNICAL",
  "BEHAVIORAL",
  "SYSTEM_DESIGN",
  "TAKE_HOME",
  "PANEL",
  "ON_SITE",
  "OTHER",
];
const HELPFUL_STORAGE_KEY = "afritalent_interview_helpful_votes";

const MOCK_EXPERIENCES: InterviewExperienceItem[] = [
  {
    id: "sample-aws-cloud-engineer",
    company: { id: "sample-company-type-cloud", name: "Sample scenario: global cloud consulting team" },
    jobTitle: "AWS Cloud Engineer",
    difficulty: "MEDIUM",
    outcome: "IN_PROGRESS",
    interviewType: "TECHNICAL",
    process: "Practice scenario, not a real user-submitted interview. A typical flow could include a recruiter screen, AWS fundamentals round, troubleshooting exercise, and a short architecture discussion.",
    questions: ["How would you troubleshoot an EC2 instance that cannot be reached over SSH?", "Explain public vs private subnets in a VPC.", "How would you monitor a small production API?"],
    tips: "Prepare to explain IAM, VPC routing, security groups, CloudWatch, and one reliability story from your own experience.",
    duration: "Practice flow: 3 to 4 rounds",
    helpfulCount: 42,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "sample-devops-engineer",
    company: { id: "sample-company-type-saas", name: "Sample scenario: remote SaaS platform team" },
    jobTitle: "DevOps Engineer",
    difficulty: "HARD",
    outcome: "IN_PROGRESS",
    interviewType: "SYSTEM_DESIGN",
    process: "Practice scenario, not a real user-submitted interview. The candidate is asked to design a deployment pipeline, debug a failed release, and explain rollback and observability choices.",
    questions: ["Design a CI/CD pipeline from commit to production.", "A deployment passes tests but health checks fail. What do you do first?", "How do you manage secrets in CI/CD?"],
    tips: "Use a structured answer: quality gates, deployment strategy, monitoring, rollback, and communication.",
    duration: "Practice flow: 2 to 3 rounds",
    helpfulCount: 15,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: "sample-cybersecurity-analyst",
    company: { id: "sample-company-type-fintech", name: "Sample scenario: regulated fintech security team" },
    jobTitle: "Cybersecurity Analyst",
    difficulty: "HARD",
    outcome: "IN_PROGRESS",
    interviewType: "TECHNICAL",
    process: "Practice scenario, not a real user-submitted interview. The flow includes a security fundamentals screen, phishing/risk discussion, and an incident response case.",
    questions: ["How would you prioritize vulnerabilities when fixes exceed team capacity?", "What phishing indicators would you teach non-technical users?", "How would you document an incident escalation?"],
    tips: "Think in evidence, impact, urgency, and practical risk reduction. Avoid guessing when facts are missing.",
    duration: "Practice flow: 2 to 4 rounds",
    helpfulCount: 89,
    createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
  },
  {
    id: "sample-backend-developer",
    company: { id: "sample-company-type-marketplace", name: "Sample scenario: global marketplace engineering team" },
    jobTitle: "Backend Developer",
    difficulty: "MEDIUM",
    outcome: "IN_PROGRESS",
    interviewType: "TECHNICAL",
    process: "Practice scenario, not a real user-submitted interview. The candidate discusses API design, duplicate handling, data validation, and production debugging.",
    questions: ["Design an API for saving and tracking job applications.", "How would you prevent duplicate jobs from multiple providers?", "A production endpoint is timing out. What is your debugging sequence?"],
    tips: "Explain data models, status transitions, authorization, logs, metrics, and a safe mitigation path.",
    duration: "Practice flow: 3 rounds",
    helpfulCount: 23,
    createdAt: new Date(Date.now() - 86400000 * 18).toISOString(),
  },
  {
    id: "sample-product-manager",
    company: { id: "sample-company-type-startup", name: "Sample scenario: early-stage product team" },
    jobTitle: "Product Manager",
    difficulty: "MEDIUM",
    outcome: "IN_PROGRESS",
    interviewType: "BEHAVIORAL",
    process: "Practice scenario, not a real user-submitted interview. The flow evaluates product judgment, prioritization, early-user feedback, and safety metrics.",
    questions: ["How would you prioritize improvements for a pre-launch job platform?", "Tell me about a time you changed direction after user feedback.", "What metrics would you track for an application assistant feature?"],
    tips: "Anchor answers in user value, risk, learning speed, and measurable product quality signals.",
    duration: "Practice flow: 2 to 3 rounds",
    helpfulCount: 7,
    createdAt: new Date(Date.now() - 86400000 * 25).toISOString(),
  }
];

function difficultyBadge(difficulty: string) {
  switch (difficulty.toUpperCase()) {
    case "EASY":
      return <Badge variant="success">Easy</Badge>;
    case "MEDIUM":
      return <Badge variant="warning">Medium</Badge>;
    case "HARD":
      return <Badge variant="danger">Hard</Badge>;
    default:
      return <Badge>{difficulty}</Badge>;
  }
}

function outcomeBadge(outcome: string) {
  switch (outcome.toUpperCase()) {
    case "OFFERED":
      return <Badge variant="success">Offered</Badge>;
    case "REJECTED":
      return <Badge variant="danger">Rejected</Badge>;
    case "NO_RESPONSE":
      return <Badge variant="warning">No Response</Badge>;
    case "IN_PROGRESS":
      return <Badge variant="info">In Progress</Badge>;
    default:
      return <Badge>{outcome}</Badge>;
  }
}

export default function InterviewsPage() {
  const { user } = useAuth();

  // List state
  const [data, setData] = useState<InterviewListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [page, setPage] = useState(1);

  // Expanded card
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Submit modal
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
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
  });

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
    setError(null);
    try {
      const response = await interviewExperiences.list({
        jobTitle: searchText || undefined,
        difficulty: filterDifficulty || undefined,
        page,
      });
      if (response && response.experiences.length > 0) {
        setData(response);
      } else {
        setData({
          experiences: MOCK_EXPERIENCES,
          pagination: { page: 1, limit: 10, total: MOCK_EXPERIENCES.length, totalPages: 1 }
        });
      }
    } catch {
      setData({
        experiences: MOCK_EXPERIENCES,
        pagination: { page: 1, limit: 10, total: MOCK_EXPERIENCES.length, totalPages: 1 }
      });
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

  const handleHelpful = async (id: string) => {
    if (helpfulSet.has(id)) return;
    const isDemoExperience = id.startsWith("exp-") || id.startsWith("sample-");
    const previousData = data;
    const previousHelpfulSet = helpfulSet;
    const nextHelpfulSet = new Set(helpfulSet).add(id);

    setHelpfulError(null);
    setHelpfulLoadingId(id);
    setHelpfulSet(nextHelpfulSet);
    window.localStorage.setItem(HELPFUL_STORAGE_KEY, JSON.stringify([...nextHelpfulSet]));
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        experiences: prev.experiences.map((exp) =>
          exp.id === id ? { ...exp, helpfulCount: exp.helpfulCount + 1 } : exp
        ),
      };
    });
    trackEvent("interview_experience_helpful_clicked", { experience_id: id, demo: isDemoExperience });

    try {
      if (user && !isDemoExperience) {
        await interviewExperiences.helpful(id);
      }
    } catch {
      setData(previousData);
      setHelpfulSet(previousHelpfulSet);
      window.localStorage.setItem(HELPFUL_STORAGE_KEY, JSON.stringify([...previousHelpfulSet]));
      setHelpfulError("Could not save your helpful vote. Please try again.");
    } finally {
      setHelpfulLoadingId(null);
    }
  };

  const addQuestion = () => {
    setFormData((prev) => ({
      ...prev,
      questions: [...prev.questions, ""],
    }));
  };

  const removeQuestion = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }));
  };

  const updateQuestion = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => (i === index ? value : q)),
    }));
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
      setFormData({
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
      });
      // Refresh list
      fetchExperiences();
      setTimeout(() => {
        setShowSubmitForm(false);
        setSubmitSuccess(false);
      }, 2000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit experience");
    } finally {
      setSubmitLoading(false);
    }
  };

  // Filter experiences client-side for outcome (API may not support it)
  const filteredExperiences = data?.experiences.filter((exp) => {
    if (filterOutcome && exp.outcome.toUpperCase() !== filterOutcome) return false;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Interview Insights</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Practice with clearly labeled sample scenarios now. Real community interview
          experiences will appear after early testers submit verified entries.
        </p>
      </div>

      {/* Search and Filters */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1">
              <Input
                placeholder="Search by company name or job title..."
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-gray-500 self-center mr-2">Difficulty:</span>
            {DIFFICULTY_OPTIONS.map((d) => (
              <button
                key={d}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  filterDifficulty === d
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                onClick={() => {
                  setFilterDifficulty(filterDifficulty === d ? "" : d);
                  setPage(1);
                }}
              >
                {d.charAt(0) + d.slice(1).toLowerCase()}
              </button>
            ))}

            <span className="text-sm text-gray-500 self-center ml-4 mr-2">Outcome:</span>
            {["OFFERED", "REJECTED"].map((o) => (
              <button
                key={o}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  filterOutcome === o
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                onClick={() => {
                  setFilterOutcome(filterOutcome === o ? "" : o);
                  setPage(1);
                }}
              >
                {o.charAt(0) + o.slice(1).toLowerCase()}
              </button>
            ))}

            {(filterDifficulty || filterOutcome) && (
              <button
                className="px-3 py-1 rounded-full text-sm font-medium text-red-600 hover:bg-red-50"
                onClick={() => {
                  setFilterDifficulty("");
                  setFilterOutcome("");
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <CardGridSkeleton count={3} />
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-8">{error}</div>
      )}
      {helpfulError && (
        <div className="bg-amber-50 text-amber-800 border border-amber-200 p-4 rounded-lg mb-8 text-sm">
          {helpfulError}
        </div>
      )}

      {/* Interview Cards */}
      {!loading && filteredExperiences && (
        <>
          {filteredExperiences.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
              <p className="text-lg font-semibold text-gray-900 mb-2">No matching interview scenarios yet</p>
              <p className="mx-auto max-w-xl text-sm leading-6 text-gray-500">
                Try clearing filters or use the sample scenarios to practice. Real community
                examples will be added after early testers submit verified experiences.
              </p>
            </div>
          ) : (
            <div className="space-y-4 mb-8">
              {filteredExperiences.map((exp) => (
                <InterviewCard
                  key={exp.id}
                  experience={exp}
                  isExpanded={expandedId === exp.id}
                  onToggle={() =>
                    setExpandedId(expandedId === exp.id ? null : exp.id)
                  }
                  onHelpful={() => handleHelpful(exp.id)}
                  isHelpfulMarked={helpfulSet.has(exp.id)}
                  isHelpfulLoading={helpfulLoadingId === exp.id}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2 mb-8">
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

      {/* Floating Share Button */}
      <div className="fixed bottom-8 right-8 z-50">
        <Button
          size="lg"
          className="shadow-lg"
          onClick={() => {
            if (!user) {
              alert("Please log in to share your interview experience.");
              return;
            }
            setShowSubmitForm(true);
          }}
        >
          ✍️ Share Your Experience
        </Button>
      </div>

      {/* Submit Modal */}
      {showSubmitForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <Card className="w-full max-w-2xl mb-10">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Share Your Interview Experience
                </h2>
                <button
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                  onClick={() => {
                    setShowSubmitForm(false);
                    setSubmitError(null);
                    setSubmitSuccess(false);
                  }}
                >
                  ×
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {submitSuccess && (
                <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg mb-4">
                  ✅ Experience shared successfully! Thank you for helping the community.
                </div>
              )}

              {submitError && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
                  {submitError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Company ID"
                  id="interview-companyId"
                  placeholder="Enter company ID"
                  value={formData.companyId}
                  onChange={(e) =>
                    setFormData({ ...formData, companyId: e.target.value })
                  }
                  required
                />
                <Input
                  label="Job Title"
                  id="interview-jobTitle"
                  placeholder="e.g. Senior Frontend Developer"
                  value={formData.jobTitle}
                  onChange={(e) =>
                    setFormData({ ...formData, jobTitle: e.target.value })
                  }
                  required
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="w-full">
                    <label
                      htmlFor="interview-difficulty"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Difficulty
                    </label>
                    <select
                      id="interview-difficulty"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={formData.difficulty}
                      onChange={(e) =>
                        setFormData({ ...formData, difficulty: e.target.value })
                      }
                    >
                      {DIFFICULTY_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d.charAt(0) + d.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full">
                    <label
                      htmlFor="interview-outcome"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Outcome
                    </label>
                    <select
                      id="interview-outcome"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={formData.outcome}
                      onChange={(e) =>
                        setFormData({ ...formData, outcome: e.target.value })
                      }
                    >
                      {OUTCOME_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o.replace("_", " ").charAt(0) +
                            o.replace("_", " ").slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full">
                    <label
                      htmlFor="interview-type"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Interview Type
                    </label>
                    <select
                      id="interview-type"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={formData.interviewType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          interviewType: e.target.value,
                        })
                      }
                    >
                      {INTERVIEW_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.replace(/_/g, " ").charAt(0) +
                            t.replace(/_/g, " ").slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="w-full">
                  <label
                    htmlFor="interview-process"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Interview Process
                  </label>
                  <textarea
                    id="interview-process"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[100px]"
                    placeholder="Describe the interview process step by step..."
                    value={formData.process}
                    onChange={(e) =>
                      setFormData({ ...formData, process: e.target.value })
                    }
                    required
                  />
                </div>

                {/* Questions */}
                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Interview Questions
                  </label>
                  {formData.questions.map((q, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <Input
                        placeholder={`Question ${i + 1}`}
                        value={q}
                        onChange={(e) => updateQuestion(i, e.target.value)}
                      />
                      {formData.questions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeQuestion(i)}
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addQuestion}
                  >
                    + Add Question
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="w-full">
                    <label
                      htmlFor="interview-tips"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Tips for Others
                    </label>
                    <textarea
                      id="interview-tips"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[80px]"
                      placeholder="Any tips for future candidates?"
                      value={formData.tips}
                      onChange={(e) =>
                        setFormData({ ...formData, tips: e.target.value })
                      }
                    />
                  </div>
                  <Input
                    label="Duration"
                    id="interview-duration"
                    placeholder="e.g. 2 weeks, 3 rounds"
                    value={formData.duration}
                    onChange={(e) =>
                      setFormData({ ...formData, duration: e.target.value })
                    }
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowSubmitForm(false);
                      setSubmitError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitLoading}>
                    {submitLoading ? "Submitting..." : "Share Experience"}
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
  const isSampleScenario = experience.id.startsWith("sample-") || experience.id.startsWith("exp-");

  return (
    <Card
      className="interactive-card cursor-pointer hover:shadow-md transition-shadow"
      onClick={onToggle}
    >
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {experience.company?.name || "Unknown Company"}
            </h3>
            <p className="text-sm text-gray-600">{experience.jobTitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isSampleScenario && <Badge variant="warning">Sample interview scenario</Badge>}
            {difficultyBadge(experience.difficulty)}
            {outcomeBadge(experience.outcome)}
            <Badge variant="info">
              {experience.interviewType.replace(/_/g, " ")}
            </Badge>
            <button
              type="button"
              className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
              aria-expanded={isExpanded}
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
            >
              {isExpanded ? "Hide details" : "View details"}
            </button>
          </div>
        </div>

        <p className="text-gray-600 text-sm mb-3 line-clamp-2">
          {experience.process}
        </p>

        {experience.questions.length > 0 && !isExpanded && (
          <p className="text-sm text-gray-400 mb-3">
            💡 {experience.questions.length} question
            {experience.questions.length !== 1 ? "s" : ""} shared
          </p>
        )}

        {/* Expanded Detail */}
        {isExpanded && (
          <div
            className="mt-4 pt-4 border-t border-gray-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">
                Full Interview Process
              </h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                {experience.process}
              </p>
            </div>

            {experience.questions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">
                  Interview Questions
                </h4>
                <ul className="list-disc list-inside space-y-1">
                  {experience.questions.map((q, i) => (
                    <li key={i} className="text-sm text-gray-600">
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {experience.tips && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">
                  Tips
                </h4>
                <p className="text-sm text-gray-600">{experience.tips}</p>
              </div>
            )}

            {experience.duration && (
              <p className="text-sm text-gray-400">
                Duration: {experience.duration}
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            {new Date(experience.createdAt).toLocaleDateString()}
          </span>
          <button
            type="button"
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed ${
              isHelpfulMarked
                ? "text-emerald-600 font-medium"
                : "text-gray-400 hover:text-emerald-600"
            }`}
            disabled={isHelpfulMarked || isHelpfulLoading}
            aria-pressed={isHelpfulMarked}
            aria-label={
              isHelpfulMarked
                ? `Marked helpful with ${experience.helpfulCount} helpful votes`
                : `Mark ${experience.company?.name || "this"} interview experience as helpful`
            }
            onClick={(e) => {
              e.stopPropagation();
              onHelpful();
            }}
          >
            {isHelpfulLoading ? "Saving..." : "Helpful"} ({experience.helpfulCount})
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
