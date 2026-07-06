// Pure client-side filtering for the learning catalog — extracted from the
// learning page so `/learning?search=<skill>` deep links (e.g. from the job
// fit panel's gap chips) are testable.

import { EARLY_LEARNING_LESSONS, EarlyLearningLesson } from "@/lib/early-tester-content";

export interface SearchableCourse {
  title: string;
  description?: string | null;
  category: string;
  skills: string[];
}

export function filterCoursesByQuery<T extends SearchableCourse>(courses: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return courses;
  return courses.filter((course) =>
    [course.title, course.description ?? "", course.category, course.skills.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

export function filterFallbackLessons(filters: {
  category: string;
  difficulty: string;
  freeOnly: boolean;
  query: string;
}): EarlyLearningLesson[] {
  const lessons = EARLY_LEARNING_LESSONS.filter((lesson) => {
    if (filters.category && lesson.category !== filters.category) return false;
    if (filters.difficulty && lesson.difficulty !== filters.difficulty) return false;
    if (filters.freeOnly && !lesson.isFree) return false;
    return true;
  });
  return filterCoursesByQuery(lessons, filters.query);
}
