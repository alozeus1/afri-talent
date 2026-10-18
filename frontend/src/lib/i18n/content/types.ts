// Shape of a locale's content overlay. Keys are the stable English
// identifiers of each dataset entry; values replace display fields only.
export interface ContentOverlay {
  /** lib/early-tester-content TOP_PAYING_ROLE_GUIDANCE, keyed by `role`. */
  topPayingRoles?: Record<
    string,
    { role?: string; description?: string; commonSkills?: string[]; experienceLevel?: string; marketEstimate?: string; salaryNote?: string }
  >;
  /** lib/market-reference-data MARKET_SALARY_BENCHMARKS, keyed by `role`; `levels` are level names in order. */
  salaryBenchmarks?: Record<string, { role?: string; note?: string; levels?: string[] }>;
  /** lib/market-reference-data OFFICIAL_IMMIGRATION_GUIDES, keyed by `country|pathway`. */
  immigrationGuides?: Record<
    string,
    { country?: string; pathway?: string; summary?: string; requirements?: string[]; sourceLabel?: string }
  >;
  /** lib/market-reference-data HIRING_RESOURCE_GUIDES, keyed by `title`. */
  hiringGuides?: Record<string, { title?: string; summary?: string; points?: string[] }>;
  /** lib/early-tester-content EARLY_LEARNING_LESSONS, keyed by `id`. */
  lessons?: Record<
    string,
    {
      title?: string;
      description?: string;
      outcomes?: string[];
      steps?: string[];
      checklist?: string[];
      practiceTask?: string;
    }
  >;
  /** Learning category display names, keyed by the English category. */
  learningCategories?: Record<string, string>;
  /** lib/early-tester-content INTERVIEW_ROLE_TRACKS, keyed by `role`; questions patched by index. */
  interviewTracks?: Record<
    string,
    { role?: string; focus?: string; questions?: Array<{ question?: string; expectedPoints?: string[] }> }
  >;
  /**
   * Interview practice questions, keyed by the English question text (or the
   * template, e.g. "...a {role} role.", for the custom-role fallbacks).
   */
  questions?: Record<string, { question?: string; expectedPoints?: string[] }>;
  /** lib/early-tester-content INTERVIEW_INSIGHTS, keyed by `id`. */
  interviewInsights?: Record<string, { title?: string; role?: string; summary?: string; bullets?: string[] }>;
  /** Flat tip lists, replaced wholesale. */
  tips?: {
    scam?: string[];
    resume?: string[];
    coverLetter?: string[];
    jobSearch?: string[];
  };
}
