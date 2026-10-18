"use client";

// Public / marketing / discovery surface strings (header, footer, home, auth,
// jobs, companies, salaries, pricing, guides, legal) for every supported
// locale. Same shape as support-messages.ts: an area hook with {var}
// interpolation, so the public surface can ship fully translated without
// colliding with edits to the shared site dictionary.
import { useCallback } from "react";
import { useLocale } from "./client";
import type { SupportedLocale } from "./config";
import { lazyLocaleRecord } from "./lazy-dictionary";
import discover from "./messages/discover";
import guides from "./messages/guides";
import legal from "./messages/legal";
import site from "./messages/site";
import { formatMessage } from "./format";

type KeysOf<N> = N extends { en: infer E } ? keyof E & string : never;

export type PublicMessageKey =
  | KeysOf<typeof site>
  | KeysOf<typeof discover>
  | KeysOf<typeof guides>
  | KeysOf<typeof legal>;

type PublicDictionary = Record<PublicMessageKey, string>;

const PUBLIC_NAMESPACES = [site, discover, guides, legal];

export const PUBLIC_MESSAGES: Record<SupportedLocale, PublicDictionary> = lazyLocaleRecord(
  (locale) => Object.assign({}, ...PUBLIC_NAMESPACES.map((ns) => ns[locale])) as PublicDictionary,
);

export type PublicVars = Record<string, string | number>;

export function formatPublicMessage(template: string, vars?: PublicVars, locale: SupportedLocale = "en"): string {
  return formatMessage(template, vars, locale);
}

// Look a key up namespace by namespace instead of reading the merged
// PUBLIC_MESSAGES dictionary: merging thousands of keys costs measurable
// main-thread time during hydration, and a lookup needs at most four probes.
function lookupPublic(locale: SupportedLocale, key: PublicMessageKey): string | undefined {
  for (const ns of PUBLIC_NAMESPACES) {
    const value = (ns[locale] as Record<string, string> | undefined)?.[key];
    if (value) return value;
  }
  return undefined;
}

/** Translate a public-surface key in a given locale (usable outside React). */
export function translatePublic(locale: SupportedLocale, key: PublicMessageKey, vars?: PublicVars): string {
  return formatPublicMessage(lookupPublic(locale, key) || lookupPublic("en", key) || key, vars, locale);
}

export type PublicT = (key: PublicMessageKey, vars?: PublicVars) => string;

/** `tp("site.footer.tagline")`, `tp("discover.results.count", { count: 3 })`. */
export function usePublicT(): PublicT {
  const locale = useLocale();
  return useCallback((key: PublicMessageKey, vars?: PublicVars) => translatePublic(locale, key, vars), [locale]);
}
