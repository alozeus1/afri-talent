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

export function useAdminFormatters() {
  const locale = useLocale();
  const intlLocale = locale === "en" ? "en-GB" : locale;
  return {
    locale,
    date: (value: string | Date | null | undefined) =>
      value ? new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" }).format(new Date(value)) : "—",
    dateTime: (value: string | Date | null | undefined) =>
      value
        ? new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
        : "—",
    number: (value: number) => new Intl.NumberFormat(intlLocale).format(value),
  };
}
