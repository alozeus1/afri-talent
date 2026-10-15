const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between `iso` and `now`, or null when the date is missing/invalid. */
export function postedAgeDays(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now.getTime() - time) / DAY_MS));
}

/** Compact card label: "Posted today", "Posted 3d ago", "Posted 5w ago", "Posted 4mo ago". */
export function formatPostedShort(iso: string | null | undefined, now: Date = new Date()): string | null {
  const days = postedAgeDays(iso, now);
  if (days === null) return null;
  if (days === 0) return "Posted today";
  if (days < 7) return `Posted ${days}d ago`;
  if (days < 60) return `Posted ${Math.floor(days / 7)}w ago`;
  return `Posted ${Math.floor(days / 30)}mo ago`;
}

/** Long label for detail pages: "Posted today", "Posted 1 day ago", "Posted 12 days ago". */
export function formatPostedLong(iso: string | null | undefined, now: Date = new Date()): string | null {
  const days = postedAgeDays(iso, now);
  if (days === null) return null;
  if (days === 0) return "Posted today";
  if (days === 1) return "Posted 1 day ago";
  return `Posted ${days} days ago`;
}
