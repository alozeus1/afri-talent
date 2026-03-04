"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { learning, LearningResourceItem } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const difficultyVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  BEGINNER: "success",
  INTERMEDIATE: "warning",
  ADVANCED: "danger",
};

const categoryGradients: Record<string, string> = {
  "Software Development": "from-blue-500 to-indigo-600",
  "Data Science": "from-purple-500 to-pink-600",
  "Design": "from-pink-500 to-rose-600",
  "Business": "from-amber-500 to-orange-600",
  "Marketing": "from-green-500 to-teal-600",
  "Leadership": "from-cyan-500 to-blue-600",
};

function getGradient(category: string): string {
  return categoryGradients[category] || "from-emerald-500 to-green-600";
}

export default function LearningPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<LearningResourceItem[]>([]);
  const [featured, setFeatured] = useState<LearningResourceItem[]>([]);
  const [recommended, setRecommended] = useState<LearningResourceItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedDifficulty, setSelectedDifficulty] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const [cats, featuredRes] = await Promise.all([
          learning.categories(),
          learning.list({ featured: true }),
        ]);
        setCategories(cats);
        setFeatured(featuredRes.resources);

        if (user) {
          try {
            const rec = await learning.recommended();
            setRecommended(rec);
          } catch {
            // Recommended may not be available
          }
        }
      } catch (err) {
        console.error("Failed to load initial data:", err);
      }
    };
    loadInitial();
  }, [user]);

  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedDifficulty, freeOnly, page]);

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
      setCourses(res.resources);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setSelectedCategory("");
    setSelectedDifficulty("");
    setFreeOnly(false);
    setPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Level Up Your Career</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Free and premium courses to grow your skills
        </p>
      </div>

      {/* Filter Bar */}
      <div className="mb-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Category Dropdown */}
              <select
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                value={selectedCategory}
                onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }}
              >
                <option value="">All Categories</option>
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
                <span className="text-sm text-gray-700">Free only</span>
              </label>

              {(selectedCategory || selectedDifficulty || freeOnly) && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommended for You */}
      {user && recommended.length > 0 && (
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Recommended for You</h2>
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
                  <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-2">{course.title}</h3>
                  {course.durationHours && (
                    <p className="text-xs text-gray-500 mb-2">{course.durationHours}h</p>
                  )}
                  <a href={course.url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="w-full">View Course</Button>
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Featured Courses</h2>
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
                      <Badge variant="success">Free</Badge>
                    ) : (
                      <Badge variant="warning">Paid</Badge>
                    )}
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2 line-clamp-2">{course.title}</h3>
                  {course.description && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{course.description}</p>
                  )}
                  {course.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {course.skills.slice(0, 3).map((skill) => (
                        <span key={skill} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    {course.durationHours && (
                      <span className="text-xs text-gray-500">{course.durationHours}h</span>
                    )}
                    <a href={course.url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm">View Course</Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* All Courses */}
      <div className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">All Courses</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📖</span>
            </div>
            <p className="text-gray-600 mb-2">No courses found</p>
            <p className="text-sm text-gray-500">Try adjusting your filters</p>
            {(selectedCategory || selectedDifficulty || freeOnly) && (
              <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {courses.map((course) => (
                <Card key={course.id} className="overflow-hidden">
                  <div className={`h-28 bg-gradient-to-br ${getGradient(course.category)} flex items-center justify-center`}>
                    <span className="text-white text-3xl">📚</span>
                  </div>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      <Badge variant="info">{course.provider}</Badge>
                      {course.isFree ? (
                        <Badge variant="success">Free</Badge>
                      ) : (
                        <Badge variant="warning">Paid</Badge>
                      )}
                      <Badge variant={difficultyVariants[course.difficulty] || "default"}>
                        {course.difficulty.charAt(0) + course.difficulty.slice(1).toLowerCase()}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-2">{course.title}</h3>
                    {course.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {course.skills.slice(0, 3).map((skill) => (
                          <span key={skill} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-auto">
                      {course.durationHours ? (
                        <span className="text-xs text-gray-500">{course.durationHours}h</span>
                      ) : (
                        <span />
                      )}
                      <a href={course.url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline">View Course</Button>
                      </a>
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
                  Previous
                </Button>
                <span className="flex items-center px-3 text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
