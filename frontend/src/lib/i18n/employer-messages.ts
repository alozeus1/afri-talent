"use client";

import { useCallback, useMemo } from "react";
import { SUPPORTED_LOCALES, type SupportedLocale } from "./config";
import { useLocale } from "./client";
import employer from "./messages/employer";
import employerJobs from "./messages/employerJobs";
import employerTalent from "./messages/employerTalent";
import employerSetup from "./messages/employerSetup";
import employerInsights from "./messages/employerInsights";
import { formatMessage } from "./format";

// Employer area dictionary (dashboard, jobs, talent, onboarding, trust,
// analytics, integrations). Strings live in ./messages/employer*/<locale>.ts,
// split per surface so parallel work never edits the same file. Key prefixes
// are unique across the employer namespaces, so merging them is lossless.

const NAMESPACES = [employer, employerJobs, employerTalent, employerSetup, employerInsights] as const;

const en = {
  ...employer.en,
  ...employerJobs.en,
  ...employerTalent.en,
  ...employerSetup.en,
  ...employerInsights.en,
};

export type EmployerMessageKey = keyof typeof en;
type EmployerDictionary = Record<EmployerMessageKey, string>;
export type EmployerVars = Record<string, string | number>;

export const EMPLOYER_MESSAGES = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    Object.assign({}, ...NAMESPACES.map((ns) => ns[locale])) as EmployerDictionary,
  ]),
) as Record<SupportedLocale, EmployerDictionary>;

export function hasEmployerKey(key: string): key is EmployerMessageKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}

export function formatEmployerMessage(template: string, vars?: EmployerVars, locale: SupportedLocale = "en"): string {
  return formatMessage(template, vars, locale);
}

// Reverse index of English copy the API still returns as text (onboarding
// labels, trust badges, upgrade framing). `server.*` keys hold those exact
// English strings, so the UI can show them translated without a contract change.
const SERVER_COPY: Map<string, EmployerMessageKey> = new Map(
  (Object.keys(en) as EmployerMessageKey[])
    .filter((key) => key.startsWith("server."))
    .map((key) => [en[key], key]),
);

export function translateEmployer(
  locale: SupportedLocale,
  key: EmployerMessageKey,
  vars?: EmployerVars,
): string {
  return formatEmployerMessage(EMPLOYER_MESSAGES[locale]?.[key] || en[key] || key, vars, locale);
}

export function useEmployerT() {
  const locale = useLocale();
  return useCallback(
    (key: EmployerMessageKey, vars?: EmployerVars) => translateEmployer(locale, key, vars),
    [locale],
  );
}

/**
 * Translation helpers for the employer area:
 * - `t(key, vars)` plain lookup with `{var}` interpolation;
 * - `tn(key, count, vars)` formats an ICU plural message with `{count}`;
 * - `tv(prefix, value)` translates an enum or option value (`status.job.DRAFT`),
 *   falling back to a humanised value for anything the API adds later;
 * - `ts(text)` translates known English API copy, else returns it unchanged;
 * - `fmt` locale-aware date and number formatting.
 */
export function useEmployerI18n() {
  const locale = useLocale();

  return useMemo(() => {
    const t = (key: EmployerMessageKey, vars?: EmployerVars) => translateEmployer(locale, key, vars);
    const tn = (key: string, count: number, vars?: EmployerVars) =>
      hasEmployerKey(key) ? t(key, { count, ...vars }) : String(count);
    const tv = (prefix: string, value: string | null | undefined) => {
      if (!value) return "";
      const key = `${prefix}.${value}`;
      if (hasEmployerKey(key)) return t(key);
      return value
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    };
    const ts = (text: string | null | undefined) => {
      if (!text) return "";
      const key = SERVER_COPY.get(text);
      return key ? t(key) : text;
    };
    const fmt = {
      date: (value: string | Date | null | undefined) =>
        value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value)) : "—",
      dateTime: (value: string | Date | null | undefined) =>
        value
          ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
          : "—",
      number: (value: number) => new Intl.NumberFormat(locale).format(value),
    };
    return { locale, t, tn, tv, ts, fmt };
  }, [locale]);
}
