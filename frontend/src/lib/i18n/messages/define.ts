import type { SupportedLocale } from "../config";

export type Dictionary<K extends string = string> = Record<K, string>;

export type Namespace<E extends Dictionary> = { en: E } & Record<
  Exclude<SupportedLocale, "en">,
  Record<keyof E, string>
>;

/**
 * Bundles one namespace's per-locale dictionaries. The type requires every
 * supported locale and every key of `en` in each of them, so a missing
 * translation is a compile error (and a failing unit test).
 */
export function defineNamespace<E extends Dictionary>(dicts: Namespace<E>): Namespace<E> {
  return dicts;
}
