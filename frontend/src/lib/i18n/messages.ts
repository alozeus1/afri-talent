import { SUPPORTED_LOCALES, type SupportedLocale } from "./config";
import { SITE_NAMESPACES } from "./messages/registry";

// Site-wide dictionary used by useT(). The strings live in per-namespace,
// per-locale files under ./messages/<namespace>/<locale>.ts so area teams can
// edit translations in parallel without merge conflicts. See docs/i18n.md.

type SiteNamespace = (typeof SITE_NAMESPACES)[keyof typeof SITE_NAMESPACES];
type KeysOf<N> = N extends { en: infer E } ? keyof E & string : never;

export type MessageKey = KeysOf<SiteNamespace>;

type LocaleDictionary = Record<MessageKey, string>;

const namespaces = Object.values(SITE_NAMESPACES) as SiteNamespace[];

export const MESSAGES = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    Object.assign({}, ...namespaces.map((ns) => ns[locale])) as LocaleDictionary,
  ]),
) as Record<SupportedLocale, LocaleDictionary>;
