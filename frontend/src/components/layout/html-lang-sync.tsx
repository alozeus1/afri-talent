"use client";

import { useEffect } from "react";

export function getLocaleDirection(locale: string): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * The root layout renders `<html lang="en">` because it cannot see the
 * `[locale]` segment. This keeps `lang` and `dir` on <html> in sync with the
 * active locale so screen readers pick the right language and Arabic renders
 * right-to-left. On unmount (navigating to a non-localized route) it restores
 * the root fallback.
 */
export function HtmlLangSync({ locale }: { locale: string }) {
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = getLocaleDirection(locale);
    return () => {
      root.lang = "en";
      root.dir = "ltr";
    };
  }, [locale]);

  return null;
}
