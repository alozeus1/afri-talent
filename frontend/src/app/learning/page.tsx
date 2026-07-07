"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { filterCoursesByQuery, filterFallbackLessons } from "@/lib/learning-search";
import { Skeleton } from "@/components/ui/skeleton";
import { billing, BillingStatus, learning, LearningResourceItem } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeatureGate } from "@/components/pricing/feature-gate";
import {
  EARLY_LEARNING_CATEGORIES,
  EARLY_LEARNING_LESSONS,
  EarlyLearningLesson,
} from "@/lib/early-tester-content";
import { trackEvent } from "@/lib/analytics";
import { EarlyTesterFeedback } from "@/components/feedback/early-tester-feedback";
import { useT } from "@/lib/i18n/client";
import { Lock, PlayCircle, Sparkles, Star } from "lucide-react";

const difficultyVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  BEGINNER: "success",
  INTERMEDIATE: "warning",
  ADVANCED: "danger",
};

const categoryGradients: Record<string, string> = {
  "AWS Cloud Demos": "from-sky-500 to-blue-700",
  "Cybersecurity Demos": "from-slate-700 to-emerald-700",
  "DevOps Demos": "from-orange-500 to-amber-600",
  "AI Tools for Career Growth": "from-teal-500 to-cyan-700",
  "Job Search Skills": "from-emerald-500 to-green-700",
};

function getGradient(category: string): string {
  return categoryGradients[category] || "from-emerald-500 to-green-600";
}

const premiumLearningLabs = [
  {
    field: "Cloud",
    slug: "cloud",
    summary: "Identity, networking, observability, and deployment choices in modern cloud systems.",
    intro: "Build a practical cloud foundation before you touch production workloads.",
    levels: [
      { name: "Beginner", stars: 1, scoreBand: "60-69", focus: "Core cloud concepts, regions, shared responsibility, and IAM basics." },
      { name: "Intermediate", stars: 2, scoreBand: "70-84", focus: "Networking, scaling, logging, and managed service selection." },
      { name: "Advanced", stars: 3, scoreBand: "85-100", focus: "Multi-account design, resilience, governance, and cost controls." },
    ],
  },
  {
    field: "AI",
    slug: "ai",
    summary: "Prompting, evaluation, retrieval, and safe deployment patterns for applied AI.",
    intro: "Practice the parts of AI work that teams actually hire for.",
    levels: [
      { name: "Beginner", stars: 1, scoreBand: "60-69", focus: "Prompt structure, output quality, and basic evaluation." },
      { name: "Intermediate", stars: 2, scoreBand: "70-84", focus: "RAG, citation quality, and failure-mode analysis." },
      { name: "Advanced", stars: 3, scoreBand: "85-100", focus: "Guardrails, hallucination control, and production monitoring." },
    ],
  },
  {
    field: "Cybersecurity",
    slug: "cybersecurity",
    summary: "Threat awareness, secure defaults, incident response, and verification habits.",
    intro: "Show that you can reason about risk, not only memorize controls.",
    levels: [
      { name: "Beginner", stars: 1, scoreBand: "60-69", focus: "Phishing, password hygiene, and common attack paths." },
      { name: "Intermediate", stars: 2, scoreBand: "70-84", focus: "Access control, logging, and suspicious activity triage." },
      { name: "Advanced", stars: 3, scoreBand: "85-100", focus: "Incident response, hardening, and secure architecture reviews." },
    ],
  },
  {
    field: "DevOps",
    slug: "devops",
    summary: "Delivery pipelines, rollout hygiene, monitoring, and rollback decisions.",
    intro: "A lab track for the operational habits teams expect from senior engineers.",
    levels: [
      { name: "Beginner", stars: 1, scoreBand: "60-69", focus: "Git workflows, build steps, and pipeline basics." },
      { name: "Intermediate", stars: 2, scoreBand: "70-84", focus: "CI/CD stages, environments, and deployment checks." },
      { name: "Advanced", stars: 3, scoreBand: "85-100", focus: "Release engineering, observability, and incident-safe rollouts." },
    ],
  },
  {
    field: "Frontend Engineering",
    slug: "frontend-engineering",
    summary: "Accessibility, state, performance, and component discipline.",
    intro: "A practical front-end pathway built around real product work.",
    levels: [
      { name: "Beginner", stars: 1, scoreBand: "60-69", focus: "Semantic HTML, responsive layouts, and forms." },
      { name: "Intermediate", stars: 2, scoreBand: "70-84", focus: "State management, component boundaries, and UX flow." },
      { name: "Advanced", stars: 3, scoreBand: "85-100", focus: "Rendering performance, accessibility audits, and app architecture." },
    ],
  },
  {
    field: "Backend Engineering",
    slug: "backend-engineering",
    summary: "APIs, data models, error handling, and service design.",
    intro: "Build backend judgment around reliability and maintainability.",
    levels: [
      { name: "Beginner", stars: 1, scoreBand: "60-69", focus: "HTTP, API contracts, and request validation." },
      { name: "Intermediate", stars: 2, scoreBand: "70-84", focus: "Databases, auth flows, and queue-based work." },
      { name: "Advanced", stars: 3, scoreBand: "85-100", focus: "Scaling, observability, and failure isolation." },
    ],
  },
  {
    field: "Python",
    slug: "python",
    summary: "Automation, scripting, data handling, and service integration.",
    intro: "A clean skill path for candidates who need practical Python fluency.",
    levels: [
      { name: "Beginner", stars: 1, scoreBand: "60-69", focus: "Syntax, functions, and data structures." },
      { name: "Intermediate", stars: 2, scoreBand: "70-84", focus: "APIs, file handling, and testing." },
      { name: "Advanced", stars: 3, scoreBand: "85-100", focus: "Async work, packaging, and production automation." },
    ],
  },
  {
    field: "YAML",
    slug: "yaml",
    summary: "Configuration discipline for infrastructure and build pipelines.",
    intro: "A precision-focused track for pipeline and platform users.",
    levels: [
      { name: "Beginner", stars: 1, scoreBand: "60-69", focus: "Indentation, structure, and key/value basics." },
      { name: "Intermediate", stars: 2, scoreBand: "70-84", focus: "CI pipeline syntax, anchors, and reusable blocks." },
      { name: "Advanced", stars: 3, scoreBand: "85-100", focus: "Complex manifests, templating, and validation strategy." },
    ],
  },
  {
    field: "Terraform",
    slug: "terraform",
    summary: "Infrastructure as code, state hygiene, modules, and environment strategy.",
    intro: "A practical track for infra teams and platform-minded candidates.",
    levels: [
      { name: "Beginner", stars: 1, scoreBand: "60-69", focus: "Providers, resources, and variables." },
      { name: "Intermediate", stars: 2, scoreBand: "70-84", focus: "State, modules, and reusable environments." },
      { name: "Advanced", stars: 3, scoreBand: "85-100", focus: "Workspaces, policy controls, and drift-safe delivery." },
    ],
  },
  {
    field: "Containerization",
    slug: "containerization",
    summary: "Dockerfiles, images, registries, and container safety.",
    intro: "Build and inspect container workflows the way teams actually use them.",
    levels: [
      { name: "Beginner", stars: 1, scoreBand: "60-69", focus: "Docker basics, images, and runtime concepts." },
      { name: "Intermediate", stars: 2, scoreBand: "70-84", focus: "Multi-stage builds, ports, and registries." },
      { name: "Advanced", stars: 3, scoreBand: "85-100", focus: "Security hardening, image minimization, and production orchestration." },
    ],
  },
] as const;

function isEarlyLesson(course: LearningResourceItem): course is EarlyLearningLesson {
  return "steps" in course && Array.isArray((course as EarlyLearningLesson).steps);
}

function LearningPageContent() {
  const t = useT();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [courses, setCourses] = useState<LearningResourceItem[]>([]);
  const [featured, setFeatured] = useState<LearningResourceItem[]>([]);
  const [recommended, setRecommended] = useState<LearningResourceItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallbackContent, setUsingFallbackContent] = useState(false);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [lessonProgress, setLessonProgress] = useState<Record<string, "IN_PROGRESS" | "COMPLETED">>({});
  const [selectedLesson, setSelectedLesson] = useState<EarlyLearningLesson | null>(null);
  const [activeLessonStep, setActiveLessonStep] = useState(0);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedDifficulty, setSelectedDifficulty] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Deep links like /learning?search=kubernetes (job fit panel gap chips) seed the search box.
  const searchFromUrl = searchParams.get("search") ?? "";
  useEffect(() => {
    if (searchFromUrl) {
      setQuery(searchFromUrl);
      setPage(1);
    }
  }, [searchFromUrl]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("afritalent_learning_completed_lessons");
      if (saved) setCompletedLessons(new Set(JSON.parse(saved) as string[]));
    } catch {
      setCompletedLessons(new Set());
    }
  }, []);

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const [cats, featuredRes] = await Promise.all([
          learning.categories(),
          learning.list({ featured: true }),
        ]);
        setCategories(cats.length ? cats : EARLY_LEARNING_CATEGORIES);
        const featuredResources = featuredRes.resources.length
          ? featuredRes.resources
          : EARLY_LEARNING_LESSONS.filter((lesson) => lesson.featured).slice(0, 6);
        setFeatured(featuredResources);

        if (user) {
          try {
            const rec = await learning.recommended();
            setRecommended(rec);
          } catch {
            // Recommended may not be available
          }

          if (user.role === "CANDIDATE") {
            try {
              const [status, persistedProgress] = await Promise.all([
                billing.status(),
                learning.progress().catch(() => ({ progress: [] })),
              ]);
              setBillingStatus(status);
              const completed = new Set<string>();
              const progressMap: Record<string, "IN_PROGRESS" | "COMPLETED"> = {};
              persistedProgress.progress.forEach((item) => {
                if (item.status === "COMPLETED") {
                  completed.add(item.resourceId);
                  progressMap[item.resourceId] = "COMPLETED";
                } else if (item.status === "IN_PROGRESS") {
                  progressMap[item.resourceId] = "IN_PROGRESS";
                }
              });
              if (completed.size > 0) {
                setCompletedLessons((prev) => new Set([...prev, ...completed]));
              }
              setLessonProgress(progressMap);
            } catch {
              setBillingStatus(null);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load initial data:", err);
        setUsingFallbackContent(true);
        setCategories(EARLY_LEARNING_CATEGORIES);
        setFeatured(EARLY_LEARNING_LESSONS.filter((lesson) => lesson.featured).slice(0, 6));
      }
    };
    loadInitial();
  }, [user]);

  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedDifficulty, freeOnly, page, query]);

  const loadCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await learning.list({
        category: selectedCategory || undefined,
        difficulty: selectedDifficulty || undefined,
        isFree: freeOnly || undefined,
        page,
      });
      if (res.resources.length === 0) {
        setUsingFallbackContent(true);
        setCourses(filterFallbackLessons({ category: selectedCategory, difficulty: selectedDifficulty, freeOnly, query }));
        setTotalPages(1);
      } else {
        setUsingFallbackContent(false);
        setCourses(res.resources);
        setTotalPages(res.pagination.totalPages);
      }
    } catch {
      setUsingFallbackContent(true);
      setCourses(filterFallbackLessons({ category: selectedCategory, difficulty: selectedDifficulty, freeOnly, query }));
      setTotalPages(1);
      setError("Live learning catalog is unavailable, so AfriTalent starter lessons are shown.");
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setSelectedCategory("");
    setSelectedDifficulty("");
    setFreeOnly(false);
    setQuery("");
    setPage(1);
  };

  const persistLessonProgress = async (
    lessonId: string,
    status: "IN_PROGRESS" | "COMPLETED" | "NOT_STARTED",
    lastStepIndex = activeLessonStep,
  ) => {
    if (user?.role !== "CANDIDATE") return;
    try {
      await learning.updateProgress(lessonId, { status, lastStepIndex });
    } catch (err) {
      console.error("Failed to save learning progress:", err);
    }
  };

  const setLessonStep = (lessonId: string, step: number) => {
    setActiveLessonStep(step);
    if (!completedLessons.has(lessonId)) {
      setLessonProgress((prev) => ({ ...prev, [lessonId]: "IN_PROGRESS" }));
      void persistLessonProgress(lessonId, "IN_PROGRESS", step);
    }
  };

  const toggleCompleted = (lessonId: string) => {
    const willComplete = !completedLessons.has(lessonId);
    setCompletedLessons((prev) => {
      const next = new Set(prev);
      if (!willComplete) {
        next.delete(lessonId);
      } else {
        next.add(lessonId);
        trackEvent("lesson_completed", { lesson_id: lessonId });
      }
      window.localStorage.setItem("afritalent_learning_completed_lessons", JSON.stringify([...next]));
      return next;
    });
    setLessonProgress((prev) => ({
      ...prev,
      [lessonId]: willComplete ? "COMPLETED" : "IN_PROGRESS",
    }));
    void persistLessonProgress(lessonId, willComplete ? "COMPLETED" : "IN_PROGRESS", activeLessonStep);
  };

  const openLesson = (lesson: EarlyLearningLesson) => {
    setSelectedLesson(lesson);
    setActiveLessonStep(0);
    if (!completedLessons.has(lesson.id)) {
      setLessonProgress((prev) => ({ ...prev, [lesson.id]: "IN_PROGRESS" }));
      void persistLessonProgress(lesson.id, "IN_PROGRESS", 0);
    }
    trackEvent("lesson_started", { lesson_id: lesson.id, category: lesson.category });
  };

  const displayedCourses = query.trim() && !usingFallbackContent
    ? filterCoursesByQuery(courses, query)
    : courses;
  const currentPlan = billingStatus?.plan ?? "FREE";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-3 dark:text-gray-100">{t("learning.title")}</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto dark:text-gray-400">
          {t("learning.practicalSubtitle")}
        </p>
      </div>

      {/* Filter Bar */}
      <div className="mb-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search lessons, skills, or topics..."
                className="min-w-[220px] flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm dark:border-zinc-700"
                aria-label="Search learning lessons"
              />

              {/* Category Dropdown */}
              <select
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm dark:border-zinc-700"
                value={selectedCategory}
                onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }}
              >
                <option value="">{t("common.allCategories")}</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              {/* Difficulty Pills */}
              <div className="flex gap-2">
                {["BEGINNER", "INTERMEDIATE", "ADVANCED"].map((diff) => (
                  <button
                    key={diff}
                    onClick={() => {
                      setSelectedDifficulty(selectedDifficulty === diff ? "" : diff);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      selectedDifficulty === diff
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-gray-700 border-gray-300 hover:border-emerald-400"
                    }`}
                  >
                    {diff.charAt(0) + diff.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>

              {/* Free Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <button
                  onClick={() => { setFreeOnly(!freeOnly); setPage(1); }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    freeOnly ? "bg-emerald-600" : "bg-gray-300"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    freeOnly ? "translate-x-6" : "translate-x-1"
                  }`} />
                </button>
                <span className="text-sm text-gray-700 dark:text-gray-300">{t("common.freeOnly")}</span>
              </label>

              {(selectedCategory || selectedDifficulty || freeOnly || query) && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  {t("common.clearFilters")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommended for You */}
      {user && recommended.length > 0 && (
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 dark:text-gray-100">{t("learning.recommendedForYou")}</h2>
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-300"
          >
            {recommended.map((course) => (
              <Card key={course.id} className="min-w-[280px] max-w-[300px] flex-shrink-0">
                <div className={`h-32 rounded-t-xl bg-gradient-to-br ${getGradient(course.category)} flex items-center justify-center`}>
                  <span className="text-white text-4xl">📚</span>
                </div>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="info">{course.provider}</Badge>
                    <Badge variant={difficultyVariants[course.difficulty] || "default"}>
                      {course.difficulty.charAt(0) + course.difficulty.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-2 dark:text-gray-100">{course.title}</h3>
                  {course.gapSkills && course.gapSkills.length > 0 && (
                    <p className="text-xs font-medium text-emerald-700 mb-2 dark:text-emerald-400">
                      Fills your gap: {course.gapSkills.slice(0, 3).join(", ")}
                    </p>
                  )}
                  {course.durationHours && (
                    <p className="text-xs text-gray-500 mb-2 dark:text-gray-400">{course.durationHours}h</p>
                  )}
                  <a href={course.url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="w-full">{t("learning.viewLesson")}</Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Featured Courses */}
      {featured.length > 0 && (
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 dark:text-gray-100">{t("learning.featuredCourses")}</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featured.map((course) => (
              <Card key={course.id} className="overflow-hidden">
                <div className={`h-40 bg-gradient-to-br ${getGradient(course.category)} flex items-center justify-center`}>
                  <span className="text-white text-5xl">⭐</span>
                </div>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="info">{course.provider}</Badge>
                    {course.isFree ? (
                      <Badge variant="success">{t("common.free")}</Badge>
                    ) : (
                      <Badge variant="warning">{t("common.paid")}</Badge>
                    )}
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2 line-clamp-2 dark:text-gray-100">{course.title}</h3>
                  {course.description && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2 dark:text-gray-400">{course.description}</p>
                  )}
                  {course.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {course.skills.slice(0, 3).map((skill) => (
                        <span key={skill} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded dark:text-gray-400">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    {course.durationHours && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">{course.durationHours}h</span>
                    )}
                    {isEarlyLesson(course) ? (
                      <span className="flex items-center gap-2">
                        {completedLessons.has(course.id) ? (
                          <Badge variant="success">Complete</Badge>
                        ) : lessonProgress[course.id] === "IN_PROGRESS" ? (
                          <Badge variant="info">In progress</Badge>
                        ) : null}
                        <Button size="sm" variant={completedLessons.has(course.id) ? "outline" : "primary"} onClick={() => openLesson(course)}>
                          {completedLessons.has(course.id) ? "Review" : t("learning.startLesson")}
                        </Button>
                      </span>
                    ) : (
                      <a href={course.url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm">{t("learning.viewCourse")}</Button>
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Premium Labs */}
      <div className="mb-10">
        <FeatureGate
          feature="Learning Labs"
          requiredPlan="PROFESSIONAL"
          currentPlan={currentPlan}
          fallback={
            <Card className="border-dashed border-emerald-200 bg-white dark:bg-zinc-900">
              <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="rounded-full bg-emerald-100 p-3 text-emerald-700">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Premium Learning Labs</h2>
                  <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                    Beginner, intermediate, and advanced labs are reserved for professional plan candidates.
                  </p>
                </div>
                <Button type="button" onClick={() => { window.location.href = "/billing"; }}>
                  Upgrade to unlock labs
                </Button>
              </CardContent>
            </Card>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Premium Learning Labs</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Structured practice across cloud, AI, cybersecurity, DevOps, frontend, backend, Python, YAML,
                  Terraform, and containerization.
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <Sparkles className="h-4 w-4" />
                <span>Professional plan enabled</span>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {premiumLearningLabs.map((track) => (
                <Card key={track.slug} className="overflow-hidden border-emerald-100">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Badge variant="info">{track.field}</Badge>
                        <h3 className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">{track.field} Lab Track</h3>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{track.summary}</p>
                      </div>
                      <div className="rounded-full bg-emerald-50 p-2 text-emerald-700">
                        <PlayCircle className="h-5 w-5" />
                      </div>
                    </div>

                    <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">{track.intro}</p>

                    <div className="mt-4 space-y-3">
                      {track.levels.map((level) => (
                        <div key={level.name} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <div className="flex gap-0.5">
                                {Array.from({ length: level.stars }, (_, index) => (
                                  <Star key={index} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                ))}
                              </div>
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{level.name}</span>
                            </div>
                            <Badge variant={level.stars === 1 ? "success" : level.stars === 2 ? "warning" : "danger"}>
                              {level.scoreBand}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">{level.focus}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </FeatureGate>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          {error}
        </div>
      )}

      {/* All Courses */}
      <div className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 dark:text-gray-100">{t("learning.allCourses")}</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          </div>
        ) : displayedCourses.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📖</span>
            </div>
            <p className="text-gray-600 mb-2 dark:text-gray-400">{t("learning.noResults")}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("common.tryAdjustingFilters")}</p>
            {(selectedCategory || selectedDifficulty || freeOnly || query) && (
              <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {displayedCourses.map((course) => (
                <Card key={course.id} className="overflow-hidden">
                  <div className={`h-28 bg-gradient-to-br ${getGradient(course.category)} flex items-center justify-center`}>
                    <span className="text-white text-3xl">📚</span>
                  </div>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      <Badge variant="info">{course.provider}</Badge>
                      {course.isFree ? (
                        <Badge variant="success">{t("common.free")}</Badge>
                      ) : (
                        <Badge variant="warning">{t("common.paid")}</Badge>
                      )}
                      <Badge variant={difficultyVariants[course.difficulty] || "default"}>
                        {course.difficulty.charAt(0) + course.difficulty.slice(1).toLowerCase()}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-2 dark:text-gray-100">{course.title}</h3>
                    {course.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {course.skills.slice(0, 3).map((skill) => (
                          <span key={skill} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded dark:text-gray-400">
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-auto">
                      {course.durationHours ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{course.durationHours}h</span>
                      ) : (
                        <span />
                      )}
                      <div className="flex gap-2">
                        {isEarlyLesson(course) ? (
                          <>
                            {completedLessons.has(course.id) ? (
                              <Badge variant="success">Complete</Badge>
                            ) : lessonProgress[course.id] === "IN_PROGRESS" ? (
                              <Badge variant="info">In progress</Badge>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                openLesson(course);
                              }}
                            >
                              Start
                            </Button>
                          </>
                        ) : (
                          <a href={course.url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline">View</Button>
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t("common.previous")}
                </Button>
                <span className="flex items-center px-3 text-sm text-gray-600 dark:text-gray-400">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  {t("common.next")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedLesson && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8">
          <Card className="w-full max-w-3xl">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Badge variant="info">{selectedLesson.category}</Badge>
                  <h2 className="mt-3 text-2xl font-bold text-gray-900 dark:text-gray-100">{selectedLesson.title}</h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{selectedLesson.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLesson(null)}
                  className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:text-gray-400"
                  aria-label="Close lesson"
                >
                  X
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant={difficultyVariants[selectedLesson.difficulty] || "default"}>
                  {selectedLesson.difficulty.charAt(0) + selectedLesson.difficulty.slice(1).toLowerCase()}
                </Badge>
                <Badge variant="success">{t("common.free")}</Badge>
                <Badge>{selectedLesson.durationHours}h</Badge>
              </div>

              <section>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t("learning.learningOutcomes")}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
                  {selectedLesson.outcomes.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t("learning.stepByStep")}</h3>
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-gray-200 bg-white p-4 dark:bg-zinc-900">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Step {activeLessonStep + 1} of {selectedLesson.steps.length}
                      </p>
                      <Badge variant={completedLessons.has(selectedLesson.id) ? "success" : "info"}>
                        {completedLessons.has(selectedLesson.id) ? "Complete" : "In progress"}
                      </Badge>
                    </div>
                    <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">{selectedLesson.steps[activeLessonStep]}</p>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={activeLessonStep === 0}
                        onClick={() => setLessonStep(selectedLesson.id, Math.max(0, activeLessonStep - 1))}
                      >
                        Previous
                      </Button>
                      <div className="flex gap-1">
                        {selectedLesson.steps.map((step, index) => (
                          <button
                            key={step}
                            type="button"
                            aria-label={`Go to lesson step ${index + 1}`}
                            onClick={() => setLessonStep(selectedLesson.id, index)}
                            className={`h-2.5 w-2.5 rounded-full ${index === activeLessonStep ? "bg-emerald-600" : "bg-gray-300"}`}
                          />
                        ))}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={activeLessonStep === selectedLesson.steps.length - 1}
                        onClick={() =>
                          setLessonStep(selectedLesson.id, Math.min(selectedLesson.steps.length - 1, activeLessonStep + 1))
                        }
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t("learning.checklist")}</h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {selectedLesson.checklist.map((item) => (
                    <li key={item} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>

              {selectedLesson.practiceTask && (
                <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <h3 className="font-semibold text-emerald-900">{t("learning.practiceTask")}</h3>
                  <p className="mt-1 text-sm text-emerald-800">{selectedLesson.practiceTask}</p>
                </section>
              )}

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Progress is saved to your AfriTalent account and synced across devices.
                </p>
                <Button
                  onClick={() => {
                    toggleCompleted(selectedLesson.id);
                    if (!completedLessons.has(selectedLesson.id)) {
                      setActiveLessonStep(selectedLesson.steps.length - 1);
                    }
                  }}
                >
                  {completedLessons.has(selectedLesson.id) ? t("learning.markIncomplete") : t("learning.markComplete")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <EarlyTesterFeedback
        area="Learning content usefulness"
        areaSlug="learning-hub"
        showApprovedFeedback
      />
    </div>
  );
}

export default function LearningPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      }
    >
      <LearningPageContent />
    </Suspense>
  );
}
