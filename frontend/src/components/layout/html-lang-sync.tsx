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
    // Only write when the value actually changes. Any write to `lang` or `dir`
    // on <html> (even the same value) makes the browser re-resolve style for
    // the whole document; on a throttled phone that was an ~80 ms blocking
    // task on every page load. An absent `dir` already means ltr.
    if (root.lang !== locale) root.lang = locale;
    const dir = getLocaleDirection(locale);
    if ((root.getAttribute("dir") ?? "ltr") !== dir) root.dir = dir;
  }, [locale]);

  return null;
}
