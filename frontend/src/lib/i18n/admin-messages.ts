"use client";

import { useCallback } from "react";
import type { SupportedLocale } from "./config";
import { useLocale } from "./client";
import adminNamespace from "./messages/admin";

// Admin console dictionary. Kept separate from messages.ts so the console can
// ship complete translations without colliding with site-wide copy work.

// Strings live in ./messages/admin/<locale>.ts.
const en = adminNamespace.en;

export type AdminMessageKey = keyof typeof en;
type AdminDictionary = Record<AdminMessageKey, string>;

export const ADMIN_MESSAGES: Record<SupportedLocale, AdminDictionary> = adminNamespace;

export function formatAdminMessage(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

export function hasAdminKey(key: string): key is AdminMessageKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}

export function useAdminT() {
  const locale = useLocale();
  return useCallback(
    (key: AdminMessageKey, vars?: Record<string, string | number>) =>
      formatAdminMessage(ADMIN_MESSAGES[locale]?.[key] ?? en[key] ?? key, vars),
    [locale],
  );
}

/**
 * Translates an enum-like backend value through `<group>.<VALUE>` keys, falling
 * back to a humanised form for values the console has no copy for yet.
 */
export function useAdminEnum() {
  const t = useAdminT();
  return useCallback(
    (group: string, value: string | null | undefined) => {
      if (!value) return t("common.notAvailable");
      const key = `${group}.${value}`;
      if (hasAdminKey(key)) return t(key);
      const words = value.replace(/_/g, " ").toLowerCase();
      return words.charAt(0).toUpperCase() + words.slice(1);
    },
    [t],
  );
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

export function useAdminFormatters() {
  const locale = useLocale();
  const intlLocale = locale === "en" ? "en-GB" : locale;
  return {
    locale,
    relative: (value: string | Date | null | undefined) => {
      if (!value) return "—";
      const seconds = (new Date(value).getTime() - Date.now()) / 1000;
      const rtf = new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto" });
      for (const [unit, size] of RELATIVE_UNITS) {
        if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
      }
      return rtf.format(Math.round(seconds / 60), "minute");
    },
    money: (amountMinor: number | null | undefined, currency: string | null | undefined) => {
      if (amountMinor == null) return "—";
      const code = currency?.toUpperCase() || "USD";
      try {
        return new Intl.NumberFormat(intlLocale, { style: "currency", currency: code, maximumFractionDigits: 2 }).format(amountMinor / 100);
      } catch {
        return `${code} ${(amountMinor / 100).toFixed(2)}`;
      }
    },
    date: (value: string | Date | null | undefined) =>
      value ? new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" }).format(new Date(value)) : "—",
    dateTime: (value: string | Date | null | undefined) =>
      value
        ? new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
        : "—",
    number: (value: number) => new Intl.NumberFormat(intlLocale).format(value),
  };
}
