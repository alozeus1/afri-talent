"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { FREE_MODE } from "@/lib/free-mode";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";
import { useLocalizedContent } from "@/lib/i18n/content";
import { BookOpen, Lock, PlayCircle, Sparkles, Star, X } from "lucide-react";

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

// Lab tracks; copy lives in messages/guides (guides.labs.<slug>.*).
const premiumLearningLabs = [
  { slug: "cloud", field: "Cloud" },
  { slug: "ai", field: "AI" },
  { slug: "cybersecurity", field: "Cybersecurity" },
  { slug: "devops", field: "DevOps" },
  { slug: "frontend-engineering", field: "Frontend Engineering" },
  { slug: "backend-engineering", field: "Backend Engineering" },
  { slug: "python", field: "Python" },
  { slug: "yaml", field: "YAML" },
  { slug: "terraform", field: "Terraform" },
  { slug: "containerization", field: "Containerization" },
] as const;

const LAB_LEVELS = [
  { level: "l1", name: "common.beginner", stars: 1, scoreBand: "60-69" },
  { level: "l2", name: "common.intermediate", stars: 2, scoreBand: "70-84" },
  { level: "l3", name: "common.advanced", stars: 3, scoreBand: "85-100" },
] as const;

const labKey = (slug: string, field: string) => `guides.labs.${slug}.${field}` as PublicMessageKey;

const DIFFICULTY_KEYS: Record<string, "common.beginner" | "common.intermediate" | "common.advanced"> = {
  BEGINNER: "common.beginner",
  INTERMEDIATE: "common.intermediate",
  ADVANCED: "common.advanced",
};

function isEarlyLesson(course: LearningResourceItem): course is EarlyLearningLesson {
  return "steps" in course && Array.isArray((course as EarlyLearningLesson).steps);
}

function LearningPageContent() {
  const t = useT();
  const tp = usePublicT();
  const content = useLocalizedContent();
  const router = useRouter();
  const locale = useLocale();
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
      setError(tp("guides.learn.fallbackNotice"));
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
      try {
        window.localStorage.setItem("afritalent_learning_completed_lessons", JSON.stringify([...next]));
      } catch {
        // Storage unavailable: progress still syncs to the account when signed in.
      }
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
  // Localized copy of the open lesson (falls back to English text per field).
  const lesson = selectedLesson ? content.lessons([selectedLesson])[0] : null;
  const currentPlan = FREE_MODE ? "PROFESSIONAL" : (billingStatus?.effectivePlan ?? billingStatus?.plan ?? "FREE");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="font-display text-4xl font-bold tracking-tight text-fg mb-3">{t("learning.title")}</h1>
        <p className="text-lg text-fg-secondary max-w-2xl mx-auto">
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
                placeholder={tp("guides.learn.searchPlaceholder")}
                className="min-w-[220px] flex-1 rounded-xl border border-line-strong bg-surface-raised px-4 py-2.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-focus"
                aria-label={tp("guides.learn.searchLabel")}
              />

              {/* Category Dropdown */}
              <select
                aria-label={t("common.allCategories")}
                className="rounded-xl border border-line-strong bg-surface-raised px-4 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-focus"
                value={selectedCategory}
                onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }}
              >
                <option value="">{t("common.allCategories")}</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{content.learningCategory(cat)}</option>
                ))}
              </select>

              {/* Difficulty Pills */}
              <div className="flex gap-2">
                {["BEGINNER", "INTERMEDIATE", "ADVANCED"].map((diff) => (
                  <button
                    type="button"
                    key={diff}
                    aria-pressed={selectedDifficulty === diff}
                    onClick={() => {
                      setSelectedDifficulty(selectedDifficulty === diff ? "" : diff);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                      selectedDifficulty === diff
                        ? "bg-primary text-primary-fg border-primary"
                        : "bg-surface text-fg-secondary border-line-strong hover:border-primary"
                    }`}
                  >
                    {t(DIFFICULTY_KEYS[diff])}
                  </button>
                ))}
              </div>

              {/* Free Toggle */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={freeOnly}
                  aria-labelledby="free-only-label"
                  onClick={() => { setFreeOnly(!freeOnly); setPage(1); }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                    freeOnly ? "bg-primary" : "bg-line-strong"
                  }`}
                >
                  <span aria-hidden="true" className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                    freeOnly ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1"
                  }`} />
                </button>
                <span id="free-only-label" className="text-sm text-fg-secondary">{t("common.freeOnly")}</span>
              </div>

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
          <h2 className="text-2xl font-bold text-fg mb-4">{t("learning.recommendedForYou")}</h2>
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-300"
          >
            {recommended.map((course) => (
              <Card key={course.id} className="min-w-[280px] max-w-[300px] flex-shrink-0">
                <div className={`h-32 rounded-t-xl bg-gradient-to-br ${getGradient(course.category)} flex items-center justify-center`}>
                  <BookOpen className="h-10 w-10 text-white" aria-hidden="true" />
                </div>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="info">{course.provider}</Badge>
                    <Badge variant={difficultyVariants[course.difficulty] || "default"}>
                      {DIFFICULTY_KEYS[course.difficulty] ? t(DIFFICULTY_KEYS[course.difficulty]) : course.difficulty}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-fg text-sm line-clamp-2 mb-2">{course.title}</h3>
                  {course.gapSkills && course.gapSkills.length > 0 && (
                    <p className="text-xs font-medium text-primary-text mb-2">
                      {tp("guides.learn.fillsGap", { skills: course.gapSkills.slice(0, 3).join(", ") })}
                    </p>
                  )}
                  {course.durationHours && (
                    <p className="text-xs text-fg-muted mb-2">{tp("guides.learn.hours", { count: course.durationHours })}</p>
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
          <h2 className="text-2xl font-bold text-fg mb-4">{t("learning.featuredCourses")}</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {content.lessons(featured).map((course) => (
              <Card key={course.id} className="overflow-hidden">
                <div className={`h-40 bg-gradient-to-br ${getGradient(course.category)} flex items-center justify-center`}>
                  <Star className="h-12 w-12 fill-white/90 text-white" aria-hidden="true" />
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
                  <h3 className="font-bold text-fg text-lg mb-2 line-clamp-2">{course.title}</h3>
                  {course.description && (
                    <p className="text-sm text-fg-secondary mb-3 line-clamp-2">{course.description}</p>
                  )}
                  {course.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {course.skills.slice(0, 3).map((skill) => (
                        <span key={skill} className="text-xs bg-surface-muted text-fg-secondary px-2 py-0.5 rounded">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    {course.durationHours && (
                      <span className="text-xs text-fg-muted">{tp("guides.learn.hours", { count: course.durationHours })}</span>
                    )}
                    {isEarlyLesson(course) ? (
                      <span className="flex items-center gap-2">
                        {completedLessons.has(course.id) ? (
                          <Badge variant="success">{tp("guides.learn.complete")}</Badge>
                        ) : lessonProgress[course.id] === "IN_PROGRESS" ? (
                          <Badge variant="info">{tp("guides.learn.inProgress")}</Badge>
                        ) : null}
                        <Button size="sm" variant={completedLessons.has(course.id) ? "outline" : "primary"} onClick={() => openLesson(course)}>
                          {completedLessons.has(course.id) ? tp("guides.learn.review") : t("learning.startLesson")}
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
            <Card className="border-dashed border-success-line bg-surface">
              <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="rounded-full bg-success-soft p-3 text-primary-text">
                  <Lock className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-fg">{tp("guides.learn.premiumLabs")}</h2>
                  <p className="mt-1 max-w-2xl text-sm text-fg-secondary">{tp("guides.learn.premiumLabsBody")}</p>
                </div>
                <Button type="button" onClick={() => router.push(localizePath("/billing", locale))}>
                  {tp("guides.learn.unlockLabs")}
                </Button>
              </CardContent>
            </Card>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-fg">{FREE_MODE ? tp("guides.learn.labs") : tp("guides.learn.premiumLabs")}</h2>
                <p className="text-sm text-fg-secondary">{tp("guides.learn.labsBody")}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-primary-text">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>{FREE_MODE ? tp("guides.learn.labsFree") : tp("guides.learn.labsEnabled")}</span>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {premiumLearningLabs.map((track) => (
                <Card key={track.slug} className="overflow-hidden border-success-line">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Badge variant="info">{tp(labKey(track.slug, "field"))}</Badge>
                        <h3 className="mt-2 text-lg font-semibold text-fg">{tp("guides.learn.labTrack", { field: tp(labKey(track.slug, "field")) })}</h3>
                        <p className="mt-1 text-sm text-fg-secondary">{tp(labKey(track.slug, "summary"))}</p>
                      </div>
                      <div className="rounded-full bg-success-soft p-2 text-primary-text">
                        <PlayCircle className="h-5 w-5" aria-hidden="true" />
                      </div>
                    </div>

                    <p className="mt-4 text-sm text-fg-secondary">{tp(labKey(track.slug, "intro"))}</p>

                    <div className="mt-4 space-y-3">
                      {LAB_LEVELS.map((level) => (
                        <div key={level.level} className="rounded-lg border border-line bg-surface-sunken p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <div className="flex gap-0.5" aria-hidden="true">
                                {Array.from({ length: level.stars }, (_, index) => (
                                  <Star key={index} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                ))}
                              </div>
                              <span className="text-sm font-semibold text-fg">{t(level.name)}</span>
                            </div>
                            <Badge variant={level.stars === 1 ? "success" : level.stars === 2 ? "warning" : "danger"}>
                              {level.scoreBand}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-fg-secondary">{tp(labKey(track.slug, level.level))}</p>
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
        <div role="status" className="mb-6 rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-fg">
          {error}
        </div>
      )}

      {/* All Courses */}
      <div className="mb-10">
        <h2 className="text-2xl font-bold text-fg mb-4">{t("learning.allCourses")}</h2>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="status" aria-busy="true" aria-label={t("common.loading")}>
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        ) : displayedCourses.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 bg-success-soft rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="h-6 w-6 text-primary-text" aria-hidden="true" />
            </div>
            <p className="text-fg-secondary mb-2">{t("learning.noResults")}</p>
            <p className="text-sm text-fg-muted">{t("common.tryAdjustingFilters")}</p>
            {(selectedCategory || selectedDifficulty || freeOnly || query) && (
              <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
                {t("common.clearFilters")}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {content.lessons(displayedCourses).map((course) => (
                <Card key={course.id} className="overflow-hidden">
                  <div className={`h-28 bg-gradient-to-br ${getGradient(course.category)} flex items-center justify-center`}>
                    <BookOpen className="h-8 w-8 text-white" aria-hidden="true" />
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
                        {DIFFICULTY_KEYS[course.difficulty] ? t(DIFFICULTY_KEYS[course.difficulty]) : course.difficulty}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-fg text-sm line-clamp-2 mb-2">{course.title}</h3>
                    {course.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {course.skills.slice(0, 3).map((skill) => (
                          <span key={skill} className="text-xs bg-surface-muted text-fg-secondary px-2 py-0.5 rounded">
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-auto">
                      {course.durationHours ? (
                        <span className="text-xs text-fg-muted">{tp("guides.learn.hours", { count: course.durationHours })}</span>
                      ) : (
                        <span />
                      )}
                      <div className="flex gap-2">
                        {isEarlyLesson(course) ? (
                          <>
                            {completedLessons.has(course.id) ? (
                              <Badge variant="success">{tp("guides.learn.complete")}</Badge>
                            ) : lessonProgress[course.id] === "IN_PROGRESS" ? (
                              <Badge variant="info">{tp("guides.learn.inProgress")}</Badge>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                openLesson(course);
                              }}
                            >
                              {t("learning.start")}
                            </Button>
                          </>
                        ) : (
                          <a href={course.url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline">{t("learning.view")}</Button>
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
                <span className="flex items-center px-3 text-sm text-fg-secondary">
                  {tp("discover.page.of", { page, total: totalPages })}
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

      {selectedLesson && lesson && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-8">
          <button type="button" tabIndex={-1} aria-label={t("learning.closeLesson")} className="fixed inset-0 cursor-default bg-black/50" onClick={() => setSelectedLesson(null)} />
          <Card className="relative w-full max-w-3xl" role="dialog" aria-modal="true" aria-labelledby="lesson-title">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Badge variant="info">{content.learningCategory(selectedLesson.category)}</Badge>
                  <h2 id="lesson-title" className="mt-3 text-2xl font-bold text-fg">{lesson.title}</h2>
                  <p className="mt-2 text-sm text-fg-secondary">{lesson.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLesson(null)}
                  className="rounded-full p-2 text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  aria-label={t("learning.closeLesson")}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant={difficultyVariants[selectedLesson.difficulty] || "default"}>
                  {DIFFICULTY_KEYS[selectedLesson.difficulty] ? t(DIFFICULTY_KEYS[selectedLesson.difficulty]) : selectedLesson.difficulty}
                </Badge>
                <Badge variant="success">{t("common.free")}</Badge>
                <Badge>{tp("guides.learn.hours", { count: selectedLesson.durationHours ?? 1 })}</Badge>
              </div>

              <section>
                <h3 className="font-semibold text-fg">{t("learning.learningOutcomes")}</h3>
                <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-fg-secondary">
                  {lesson.outcomes.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-fg">{t("learning.stepByStep")}</h3>
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-line bg-surface-sunken p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-fg" aria-live="polite">
                        {tp("guides.learn.stepOf", { step: activeLessonStep + 1, total: lesson.steps.length })}
                      </p>
                      <Badge variant={completedLessons.has(selectedLesson.id) ? "success" : "info"}>
                        {completedLessons.has(selectedLesson.id) ? tp("guides.learn.complete") : tp("guides.learn.inProgress")}
                      </Badge>
                    </div>
                    <p className="text-sm leading-6 text-fg-secondary">{lesson.steps[activeLessonStep]}</p>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={activeLessonStep === 0}
                        onClick={() => setLessonStep(selectedLesson.id, Math.max(0, activeLessonStep - 1))}
                      >
                        {t("common.previous")}
                      </Button>
                      <div className="flex gap-1">
                        {lesson.steps.map((step, index) => (
                          <button
                            key={step}
                            type="button"
                            aria-label={tp("guides.learn.goToStep", { step: index + 1 })}
                            aria-current={index === activeLessonStep ? "step" : undefined}
                            onClick={() => setLessonStep(selectedLesson.id, index)}
                            className={`h-2.5 w-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${index === activeLessonStep ? "bg-primary" : "bg-line-strong"}`}
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
                        {t("common.next")}
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="font-semibold text-fg">{t("learning.checklist")}</h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {lesson.checklist.map((item) => (
                    <li key={item} className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-fg-secondary">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>

              {lesson.practiceTask && (
                <section className="rounded-xl border border-success-line bg-success-soft p-4">
                  <h3 className="font-semibold text-fg">{t("learning.practiceTask")}</h3>
                  <p className="mt-1 text-sm text-fg-secondary">{lesson.practiceTask}</p>
                </section>
              )}

              <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-fg-muted">
                  {user ? tp("guides.learn.progressSynced") : t("learning.completionNote")}
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
