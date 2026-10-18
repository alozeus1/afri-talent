// ─────────────────────────────────────────────────────────────────────────────
// Aggregator quality gate — title denylist.
//
// Some ATS boards publish evergreen "catch-all" postings ("Don't see your role
// but inspired to apply?", "General application", "Talent pool") that are not
// real vacancies. They are dropped before eligibility so they never reach the
// job board, and the inventory backfill retires any that were stored earlier.
// ─────────────────────────────────────────────────────────────────────────────

const EVERGREEN_TITLE_PATTERNS: RegExp[] = [
  /\b(?:don'?t|do not) see (?:your|the|a|an)(?: right| perfect| ideal| dream)? (?:role|job|position|opening)\b/,
  /\b(?:can'?t|cannot|didn'?t|did not) find (?:your|the|a|an)(?: right| perfect| ideal| dream)? (?:role|job|position|opening)\b/,
  /\bgeneral application\b/,
  /\bopen application\b/,
  /\bspontaneous application\b/,
  /\bunsolicited application\b/,
  /\btalent (?:pool|community|network)\b/,
  /\bexpression of interest\b/,
  /\bfuture (?:opportunities|openings|roles)\b/,
];

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** True for evergreen catch-all postings that are not a specific vacancy. */
export function isEvergreenPosting(title: string | null | undefined): boolean {
  const value = normalizeTitle(title ?? "");
  if (!value) return false;
  return EVERGREEN_TITLE_PATTERNS.some((pattern) => pattern.test(value));
}
