import { SUPPORTED_LOCALES, type SupportedLocale } from "./config";

/**
 * A `Record<SupportedLocale, D>` whose per-locale values are built on first
 * access and then memoized. Merging every namespace for every locale up front
 * costs tens of milliseconds of main-thread time on a throttled phone, on
 * every page load, although a visitor only ever reads one or two locales
 * (theirs plus the English fallback).
 */
export function lazyLocaleRecord<D>(build: (locale: SupportedLocale) => D): Record<SupportedLocale, D> {
  const record = {} as Record<SupportedLocale, D>;
  for (const locale of SUPPORTED_LOCALES) {
    Object.defineProperty(record, locale, {
      enumerable: true,
      configurable: true,
      get() {
        const value = build(locale);
        Object.defineProperty(record, locale, { value, enumerable: true, writable: false, configurable: false });
        return value;
      },
    });
  }
  return record;
}
