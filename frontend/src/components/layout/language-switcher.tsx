"use client";

import { usePathname } from "next/navigation";
import { localizePath, LOCALE_COOKIE, useLocale } from "@/lib/i18n/client";
import { SupportedLocale } from "@/lib/i18n/config";
import { preferences } from "@/lib/api";
import { usePublicT } from "@/lib/i18n/public-messages";

// Each language is named in its own script so speakers can always find it.
const OPTIONS: Array<{ value: SupportedLocale; label: string; name: string }> = [
  { value: "en", label: "EN", name: "English" },
  { value: "es", label: "ES", name: "Español" },
  { value: "fr", label: "FR", name: "Français" },
  { value: "pt", label: "PT", name: "Português" },
  { value: "ar", label: "AR", name: "العربية" },
];

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const tp = usePublicT();

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
      <span className="sr-only">{tp("site.language.label")}</span>
      <select
        aria-label={tp("site.language.label")}
        value={locale}
        onChange={(event) => onChange(event.target.value as SupportedLocale)}
        className="h-10 rounded-lg border border-line bg-surface px-2 text-sm text-fg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value} lang={option.value} aria-label={option.name}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
