"use client";

import { useEffect } from "react";
import { useLocale } from "@/lib/i18n/client";

export function getLocaleDirection(locale: string): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * The root layout renders `<html lang="en">` because it cannot see the
 * `[locale]` segment or the locale cookie. This keeps `lang` and `dir` on
 * <html> in sync with the active locale (path prefix, else the
 * `afritalent-locale` cookie) so screen readers pick the right language and
 * Arabic renders right-to-left on every route, including non-[locale] ones
 * such as /employer and /admin. Pass `locale` to force a value.
 */
export function HtmlLangSync({ locale: forced }: { locale?: string }) {
  const resolved = useLocale();
  const locale = forced ?? resolved;
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = getLocaleDirection(locale);
  }, [locale]);

  return null;
}
