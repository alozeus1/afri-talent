"use client";

import { useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, normalizeLocale, SupportedLocale } from "./config";
import { MESSAGES, MessageKey } from "./messages";
import { formatMessage, type MessageVars } from "./format";

export const LOCALE_COOKIE = "afritalent-locale";

export function getLocaleFromPath(pathname: string | null): SupportedLocale {
  if (!pathname) return DEFAULT_LOCALE;
  const first = pathname.split("/").filter(Boolean)[0];
  if (isSupportedLocale(first)) return first;
  return DEFAULT_LOCALE;
}

export function stripLocaleFromPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "/";
  if (isSupportedLocale(segments[0])) {
    const rest = segments.slice(1).join("/");
    return rest ? `/${rest}` : "/";
  }
  return pathname;
}

export function localizePath(pathname: string, locale: SupportedLocale): string {
  const stripped = stripLocaleFromPath(pathname);
  if (stripped === "/") return `/${locale}`;
  return `/${locale}${stripped}`;
}

export function detectPreferredLocaleFromHeader(acceptLanguage: string | null): SupportedLocale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const first = acceptLanguage.split(",")[0]?.trim();
  return normalizeLocale(first);
}

/** Locale from the `afritalent-locale` cookie, or null when unset/invalid. */
export function readLocaleCookie(cookieString: string | null | undefined): SupportedLocale | null {
  if (!cookieString) return null;
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LOCALE_COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      return isSupportedLocale(value) ? value : null;
    }
  }
  return null;
}

/**
 * Resolve the active locale: an explicit `/<locale>/...` path prefix wins,
 * otherwise the `afritalent-locale` cookie (set by middleware and the language
 * switcher), otherwise the default. The cookie lets non-[locale] routes such as
 * /employer/* and /admin/* render translated copy.
 */
export function resolveLocale(pathname: string | null, cookieLocale: SupportedLocale | null): SupportedLocale {
  const first = pathname?.split("/").filter(Boolean)[0];
  if (isSupportedLocale(first)) return first;
  return cookieLocale ?? DEFAULT_LOCALE;
}

const noopSubscribe = () => () => {};
const getCookieSnapshot = () => readLocaleCookie(document.cookie);
// Server render (and hydration) has no document.cookie; the client re-renders
// with the cookie locale right after hydration, so markup never mismatches.
const getServerCookieSnapshot = () => null;

export function useLocale(): SupportedLocale {
  const pathname = usePathname();
  const cookieLocale = useSyncExternalStore(noopSubscribe, getCookieSnapshot, getServerCookieSnapshot);
  return useMemo(() => resolveLocale(pathname, cookieLocale), [pathname, cookieLocale]);
}

export function useT() {
  const locale = useLocale();
  const dict = MESSAGES[locale];
  return (key: MessageKey, vars?: MessageVars): string =>
    formatMessage(dict[key] || MESSAGES.en[key] || key, vars, locale);
}

