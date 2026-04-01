"use client";

import { useRouter, usePathname } from "next/navigation";
import { localizePath, LOCALE_COOKIE, useLocale } from "@/lib/i18n/client";
import { SupportedLocale } from "@/lib/i18n/config";
import { preferences } from "@/lib/api";

const OPTIONS: Array<{ value: SupportedLocale; label: string }> = [
  { value: "en", label: "EN" },
  { value: "fr", label: "FR" },
  { value: "pt", label: "PT" },
  { value: "ar", label: "AR" },
];

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const onChange = async (nextLocale: SupportedLocale) => {
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    const apiLocale = nextLocale.toUpperCase() as "EN" | "FR" | "PT" | "AR";
    try {
      await preferences.setLocale(apiLocale);
    } catch {
      // no-op when user isn't logged in
    }
    router.push(localizePath(pathname || "/", nextLocale));
  };

  return (
    <label className="inline-flex items-center" aria-label="Language selector">
      <span className="sr-only">Language</span>
      <select
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
