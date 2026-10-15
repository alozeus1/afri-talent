"use client";

// Contact / customer-support strings for every supported locale. Kept in its
// own module (same shape as messages.ts) so the support surface can ship
// fully translated without colliding with edits to the main dictionary.
import { useLocale } from "./client";
import type { SupportedLocale } from "./config";
import supportNamespace from "./messages/support";
import { formatMessage } from "./format";

// Strings live in ./messages/support/<locale>.ts.
export type SupportMessageKey = keyof typeof supportNamespace.en;
type SupportDictionary = Record<SupportMessageKey, string>;

export const SUPPORT_MESSAGES: Record<SupportedLocale, SupportDictionary> = supportNamespace;

export function formatSupportMessage(
  template: string,
  vars: Record<string, string | number> = {},
  locale: SupportedLocale = "en",
): string {
  return formatMessage(template, vars, locale);
}

export function useSupportT() {
  const locale = useLocale();
  const dict = SUPPORT_MESSAGES[locale] ?? SUPPORT_MESSAGES.en;
  return (key: SupportMessageKey, vars?: Record<string, string | number>): string =>
    formatSupportMessage(dict[key] || SUPPORT_MESSAGES.en[key] || key, vars, locale);
}
