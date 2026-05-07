"use client";

import { usePathname } from "next/navigation";
import { localizePath, LOCALE_COOKIE, useLocale } from "@/lib/i18n/client";
import { SupportedLocale } from "@/lib/i18n/config";
import { preferences } from "@/lib/api";

const OPTIONS: Array<{ value: SupportedLocale; label: string }> = [
  { value: "en", label: "EN" },
  { value: "es", label: "ES" },
  { value: "fr", label: "FR" },
  { value: "pt", label: "PT" },
  { value: "ar", label: "AR" },
];

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();

  const onChange = (nextLocale: SupportedLocale) => {
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    const targetPath = localizePath(pathname || "/", nextLocale);
    const apiLocale = nextLocale.toUpperCase() as "EN" | "ES" | "FR" | "PT" | "AR";
    void preferences.setLocale(apiLocale).catch(() => {
      // no-op when user isn't logged in
    });
    if (typeof window !== "undefined") {
      window.location.assign(targetPath);
    }
  };

  return (
    <label className="inline-flex items-center">
      <span className="sr-only">Language</span>
      <select
        aria-label="Language selector"
        value={locale}
        onChange={(event) => onChange(event.target.value as SupportedLocale)}
        className="h-10 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
