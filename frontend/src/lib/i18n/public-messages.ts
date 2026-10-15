"use client";

// Public / marketing / discovery surface strings (header, footer, home, auth,
// jobs, companies, salaries, pricing, guides, legal) for every supported
// locale. Same shape as support-messages.ts: an area hook with {var}
// interpolation, so the public surface can ship fully translated without
// colliding with edits to the shared site dictionary.
import { useCallback } from "react";
import { useLocale } from "./client";
import { SUPPORTED_LOCALES, type SupportedLocale } from "./config";
import discover from "./messages/discover";
import guides from "./messages/guides";
import legal from "./messages/legal";
import site from "./messages/site";

type KeysOf<N> = N extends { en: infer E } ? keyof E & string : never;

export type PublicMessageKey =
  | KeysOf<typeof site>
  | KeysOf<typeof discover>
  | KeysOf<typeof guides>
  | KeysOf<typeof legal>;

type PublicDictionary = Record<PublicMessageKey, string>;

const PUBLIC_NAMESPACES = [site, discover, guides, legal];

export const PUBLIC_MESSAGES = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    Object.assign({}, ...PUBLIC_NAMESPACES.map((ns) => ns[locale])) as PublicDictionary,
  ]),
) as Record<SupportedLocale, PublicDictionary>;

export type PublicVars = Record<string, string | number>;

export function formatPublicMessage(template: string, vars?: PublicVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** Translate a public-surface key in a given locale (usable outside React). */
export function translatePublic(locale: SupportedLocale, key: PublicMessageKey, vars?: PublicVars): string {
  const dict = PUBLIC_MESSAGES[locale] ?? PUBLIC_MESSAGES.en;
  return formatPublicMessage(dict[key] || PUBLIC_MESSAGES.en[key] || key, vars);
}

export type PublicT = (key: PublicMessageKey, vars?: PublicVars) => string;

/** `tp("site.footer.tagline")`, `tp("discover.results.count", { count: 3 })`. */
export function usePublicT(): PublicT {
  const locale = useLocale();
  return useCallback((key: PublicMessageKey, vars?: PublicVars) => translatePublic(locale, key, vars), [locale]);
}
