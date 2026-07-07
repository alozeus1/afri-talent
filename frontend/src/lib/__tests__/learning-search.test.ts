import { filterCoursesByQuery, filterFallbackLessons } from "@/lib/learning-search";
import { EARLY_LEARNING_LESSONS } from "@/lib/early-tester-content";

const courses = [
  {
    title: "Kubernetes Fundamentals",
    description: "Container orchestration from scratch",
    category: "DevOps Demos",
    skills: ["kubernetes", "docker"],
  },
  {
    title: "Interview Storytelling",
    description: null,
    category: "Job Search Skills",
    skills: ["communication"],
  },
];

describe("filterCoursesByQuery", () => {
  it("returns all courses for an empty or whitespace query", () => {
    expect(filterCoursesByQuery(courses, "")).toHaveLength(2);
    expect(filterCoursesByQuery(courses, "   ")).toHaveLength(2);
  });

  it("matches title case-insensitively", () => {
    const result = filterCoursesByQuery(courses, "KUBERNETES");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Kubernetes Fundamentals");
  });

  it("matches skills and category", () => {
    expect(filterCoursesByQuery(courses, "docker")).toHaveLength(1);
    expect(filterCoursesByQuery(courses, "job search")).toHaveLength(1);
  });

  it("handles null descriptions and no matches", () => {
    expect(filterCoursesByQuery(courses, "storytelling")).toHaveLength(1);
    expect(filterCoursesByQuery(courses, "quantum basketry")).toHaveLength(0);
  });
});

describe("filterFallbackLessons", () => {
  it("returns every starter lesson when no filters are set", () => {
    const result = filterFallbackLessons({ category: "", difficulty: "", freeOnly: false, query: "" });
    expect(result).toHaveLength(EARLY_LEARNING_LESSONS.length);
  });

  it("filters by category", () => {
    const category = EARLY_LEARNING_LESSONS[0].category;
    const result = filterFallbackLessons({ category, difficulty: "", freeOnly: false, query: "" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((lesson) => lesson.category === category)).toBe(true);
  });

  it("filters by difficulty and freeOnly", () => {
    const difficulty = EARLY_LEARNING_LESSONS[0].difficulty;
    const result = filterFallbackLessons({ category: "", difficulty, freeOnly: true, query: "" });
    expect(result.every((lesson) => lesson.difficulty === difficulty && lesson.isFree)).toBe(true);
  });

  it("applies the search query on top of filters", () => {
    const lesson = EARLY_LEARNING_LESSONS[0];
    const result = filterFallbackLessons({
      category: "",
      difficulty: "",
      freeOnly: false,
      query: lesson.title.slice(0, 12),
    });
    expect(result.some((item) => item.id === lesson.id)).toBe(true);
  });
});
