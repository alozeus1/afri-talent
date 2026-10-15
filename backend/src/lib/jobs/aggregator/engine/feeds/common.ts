// Small parsing helpers shared by the feed adapters.

export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" || (typeof value === "string" && /^\d{9,13}$/.test(value.trim()))) {
    const numeric = Number(value);
    // Seconds vs milliseconds since epoch.
    const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[, ]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

export function splitList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Parses free-text salary like "$50,000 - $80,000", "€60k-90k", "$35,3k- $52k". */
export function parseSalaryText(text: string | undefined | null): { min?: number; max?: number; currency?: string; period?: "yearly" | "monthly" | "hourly" } | undefined {
  if (!text) return undefined;
  const value = text.toLowerCase();
  const numbers = Array.from(value.matchAll(/(\d+(?:[.,]\d+)*)\s*(k)?/g))
    .map((match) => {
      const raw = match[1];
      // "35,3k" → 35.3k ; "50,000" → 50000
      const normalized = /,\d{3}(\D|$)/.test(raw) || /\.\d{3}(\D|$)/.test(raw)
        ? raw.replace(/[.,]/g, "")
        : raw.replace(",", ".");
      const numeric = Number.parseFloat(normalized);
      return match[2] ? numeric * 1000 : numeric;
    })
    .filter((numeric) => Number.isFinite(numeric) && numeric >= 1);
  if (numbers.length === 0) return undefined;
  const currency = value.includes("€") || value.includes("eur") ? "EUR" : value.includes("£") || value.includes("gbp") ? "GBP" : "USD";
  const period = /hour|\/h\b|per hr/.test(value) ? "hourly" : /month|\/mo\b/.test(value) ? "monthly" : "yearly";
  return { min: numbers[0], max: numbers[1], currency, period };
}

export function isRecent(date: Date | null | undefined, postedAfter: Date): boolean {
  return !date || date.getTime() >= postedAfter.getTime();
}
