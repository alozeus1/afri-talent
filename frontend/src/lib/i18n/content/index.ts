"use client";

// Localized overlays for the static content datasets the public pages render
// (lib/early-tester-content.ts, lib/market-reference-data.ts). The English
// datasets stay the source of truth; each locale overlay replaces display
// fields by a stable English key (role name, slug, country + pathway...).
// Anything without an overlay renders in English, so new content degrades
// gracefully instead of breaking.
import { useMemo } from "react";
import { useLocale } from "../client";
import type { SupportedLocale } from "../config";
import type { ContentOverlay } from "./types";
import ar from "./ar";
import es from "./es";
import fr from "./fr";
import pt from "./pt";

export type { ContentOverlay } from "./types";

const OVERLAYS: Record<Exclude<SupportedLocale, "en">, ContentOverlay> = { fr, es, pt, ar };

function overlayFor(locale: SupportedLocale): ContentOverlay {
  return locale === "en" ? {} : OVERLAYS[locale] ?? {};
}

function mergeList<T, O extends object>(list: readonly T[], key: (item: T) => string, overlay?: Record<string, O>): T[] {
  if (!overlay) return [...list];
  return list.map((item) => {
    const patch = overlay[key(item)];
    return patch ? ({ ...item, ...patch } as T) : item;
  });
}

type Levelled = { level: string };

export function localizeContent(locale: SupportedLocale) {
  const o = overlayFor(locale);
  return {
    topPayingRoles: <T extends { role: string }>(list: readonly T[]) => mergeList(list, (r) => r.role, o.topPayingRoles),
    salaryBenchmarks: <T extends { role: string; levels: readonly Levelled[] }>(list: readonly T[]) =>
      list.map((item) => {
        const patch = o.salaryBenchmarks?.[item.role];
        if (!patch) return item;
        const { levels: levelNames, ...rest } = patch;
        return {
          ...item,
          ...rest,
          levels: item.levels.map((level, index) => ({ ...level, level: levelNames?.[index] ?? level.level })),
        } as T;
      }),
    immigrationGuides: <T extends { country: string; pathway: string }>(list: readonly T[]) =>
      mergeList(list, (g) => `${g.country}|${g.pathway}`, o.immigrationGuides),
    hiringGuides: <T extends { title: string }>(list: readonly T[]) => mergeList(list, (g) => g.title, o.hiringGuides),
    lessons: <T extends { id: string }>(list: readonly T[]) => mergeList(list, (l) => l.id, o.lessons),
    learningCategory: (category: string) => o.learningCategories?.[category] ?? category,
    interviewTracks: <T extends { role: string; questions: readonly { question: string }[] }>(list: readonly T[]) =>
      list.map((track) => {
        const patch = o.interviewTracks?.[track.role];
        if (!patch) return track;
        const { questions: questionPatches, ...rest } = patch;
        return {
          ...track,
          ...rest,
          questions: track.questions.map((q, index) => ({ ...q, ...(questionPatches?.[index] ?? {}) })),
        } as T;
      }),
    /**
     * Localizes practice questions. `key` (the English template) wins over the
     * question text, and `{role}` in the result is filled from `vars.role`.
     */
    interviewQuestions: <T extends { question: string; expectedPoints: string[]; key?: string }>(
      list: readonly T[],
      vars: { role: string },
    ) =>
      list.map((item) => {
        const patch = o.questions?.[item.key ?? item.question];
        if (!patch) return item;
        return {
          ...item,
          question: (patch.question ?? item.question).replaceAll("{role}", vars.role),
          expectedPoints: patch.expectedPoints ?? item.expectedPoints,
        } as T;
      }),
    interviewInsights: <T extends { id: string }>(list: readonly T[]) => mergeList(list, (i) => i.id, o.interviewInsights),
    tips: (key: keyof NonNullable<ContentOverlay["tips"]>, list: readonly string[]) => o.tips?.[key] ?? [...list],
  };
}

export type LocalizedContent = ReturnType<typeof localizeContent>;

/** Locale-aware accessors for the static content datasets. */
export function useLocalizedContent(): LocalizedContent {
  const locale = useLocale();
  return useMemo(() => localizeContent(locale), [locale]);
}
