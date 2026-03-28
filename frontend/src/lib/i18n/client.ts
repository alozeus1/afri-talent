"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, normalizeLocale, SupportedLocale } from "./config";
import { MESSAGES, MessageKey } from "./messages";

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

export function useLocale(): SupportedLocale {
  const pathname = usePathname();
  return useMemo(() => getLocaleFromPath(pathname), [pathname]);
}

export function useT() {
  const locale = useLocale();
  const dict = MESSAGES[locale];
  return (key: MessageKey): string => dict[key] || MESSAGES.en[key] || key;
}

