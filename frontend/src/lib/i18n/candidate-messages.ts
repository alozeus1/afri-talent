"use client";

// Candidate workspace dictionary (/candidate/* and its [locale] mirrors).
// Strings live in three area namespaces so each file stays reviewable:
//   messages/candidateHome     dashboard, applications, saved jobs/searches,
//                              alerts, calendar, analytics, referrals, settings
//   messages/candidateProfile  profile, resumes, resume builder, skills, trust
//   messages/candidateAi       AI assistant, chat, cover letter, advisor,
//                              career gap, interview prep, job matches, salary
// Keys are unique across the three (see __tests__/candidate-messages.test.ts).
import { useCallback, useMemo } from "react";
import { SUPPORTED_LOCALES, type SupportedLocale } from "./config";
import { useLocale } from "./client";
import candidateHome from "./messages/candidateHome";
import candidateProfile from "./messages/candidateProfile";
import candidateAi from "./messages/candidateAi";
import { formatMessage } from "./format";

export const CANDIDATE_NAMESPACES = { candidateHome, candidateProfile, candidateAi } as const;

const en = { ...candidateHome.en, ...candidateProfile.en, ...candidateAi.en };

export type CandidateMessageKey = keyof typeof en;
type CandidateDictionary = Record<CandidateMessageKey, string>;
export type CandidateVars = Record<string, string | number>;

export const CANDIDATE_MESSAGES = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    { ...candidateHome[locale], ...candidateProfile[locale], ...candidateAi[locale] },
  ]),
) as Record<SupportedLocale, CandidateDictionary>;

export function formatCandidateMessage(template: string, vars?: CandidateVars, locale: SupportedLocale = "en"): string {
  return formatMessage(template, vars, locale);
}

export function translateCandidate(locale: SupportedLocale, key: CandidateMessageKey, vars?: CandidateVars): string {
  return formatCandidateMessage(CANDIDATE_MESSAGES[locale]?.[key] || en[key] || key, vars, locale);
}

export type CandidateT = (key: CandidateMessageKey, vars?: CandidateVars) => string;

export function hasCandidateKey(key: string): key is CandidateMessageKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}

/**
 * Label for a backend enum value (e.g. status "SHORTLISTED") via `${prefix}.${value}`,
 * falling back to a humanised value ("SOME_VALUE" -> "Some value") for unknown values.
 */
export function enumLabel(t: CandidateT, prefix: string, value: string | null | undefined): string {
  if (!value) return "";
  const key = `${prefix}.${value}`;
  if (hasCandidateKey(key)) return t(key);
  // Data sources disagree on casing ("full-time" vs "FULL_TIME").
  const normalisedKey = `${prefix}.${value.trim().toUpperCase().replace(/[\s-]+/g, "_")}`;
  if (hasCandidateKey(normalisedKey)) return t(normalisedKey);
  const words = value.replace(/[_-]+/g, " ").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `t(key, vars?)` for the candidate workspace, in the active locale. */
export function useCandidateT(): CandidateT {
  const locale = useLocale();
  return useCallback(
    (key: CandidateMessageKey, vars?: CandidateVars) => translateCandidate(locale, key, vars),
    [locale],
  );
}

/** Locale-aware date/number helpers for candidate pages. */
export function useCandidateFormatters() {
  const locale = useLocale();
  return useMemo(() => {
    const intlLocale = locale === "en" ? "en-GB" : locale;
    const toDate = (value: string | number | Date) => (value instanceof Date ? value : new Date(value));
    return {
      locale,
      date: (
        value: string | number | Date | null | undefined,
        options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
      ) => (value ? new Intl.DateTimeFormat(intlLocale, options).format(toDate(value)) : "—"),
      dateTime: (value: string | number | Date | null | undefined) =>
        value
          ? new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "short" }).format(toDate(value))
          : "—",
      time: (value: string | number | Date | null | undefined) =>
        value ? new Intl.DateTimeFormat(intlLocale, { timeStyle: "short" }).format(toDate(value)) : "—",
      number: (value: number, options?: Intl.NumberFormatOptions) =>
        new Intl.NumberFormat(intlLocale, options).format(value),
      currency: (value: number, currency = "USD") => {
        try {
          return new Intl.NumberFormat(intlLocale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
        } catch {
          return `${currency} ${new Intl.NumberFormat(intlLocale).format(value)}`;
        }
      },
      /** "3 days ago" / "in 2 hours" in the active locale. */
      relative: (value: string | number | Date | null | undefined) => {
        if (!value) return "—";
        const diffSeconds = Math.round((toDate(value).getTime() - Date.now()) / 1000);
        const rtf = new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto" });
        const abs = Math.abs(diffSeconds);
        if (abs < 60) return rtf.format(0, "second");
        if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
        if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
        if (abs < 86400 * 30) return rtf.format(Math.round(diffSeconds / 86400), "day");
        if (abs < 86400 * 365) return rtf.format(Math.round(diffSeconds / (86400 * 30)), "month");
        return rtf.format(Math.round(diffSeconds / (86400 * 365)), "year");
      },
    };
  }, [locale]);
}
