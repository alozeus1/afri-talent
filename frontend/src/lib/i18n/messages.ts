import type { SupportedLocale } from "./config";
import { lazyLocaleRecord } from "./lazy-dictionary";
// Import the site namespaces directly, NOT via ./messages/registry: the
// registry also pulls in every area namespace (admin, employer, candidate...),
// and because this module is reached from the root-layout header, importing
// the registry here shipped every dictionary in the JS loaded on every page.
import auth from "./messages/auth";
import candidate from "./messages/candidate";
import common from "./messages/common";
import companies from "./messages/companies";
import home from "./messages/home";
import interviews from "./messages/interviews";
import jobs from "./messages/jobs";
import learning from "./messages/learning";
import nav from "./messages/nav";
import pricing from "./messages/pricing";
import salaries from "./messages/salaries";

// Site-wide dictionary used by useT(). The strings live in per-namespace,
// per-locale files under ./messages/<namespace>/<locale>.ts so area teams can
// edit translations in parallel without merge conflicts. See docs/i18n.md.
// Keep this list in sync with SITE_NAMESPACES in ./messages/registry.ts; the
// i18n namespaces test checks MESSAGES covers exactly those keys.
const SITE_NAMESPACE_LIST = [
  nav,
  auth,
  common,
  candidate,
  pricing,
  jobs,
  home,
  learning,
  interviews,
  salaries,
  companies,
] as const;

type SiteNamespace = (typeof SITE_NAMESPACE_LIST)[number];
type KeysOf<N> = N extends { en: infer E } ? keyof E & string : never;

export type MessageKey = KeysOf<SiteNamespace>;

type LocaleDictionary = Record<MessageKey, string>;

const namespaces: readonly SiteNamespace[] = SITE_NAMESPACE_LIST;

export const MESSAGES: Record<SupportedLocale, LocaleDictionary> = lazyLocaleRecord(
  (locale) => Object.assign({}, ...namespaces.map((ns) => ns[locale])) as LocaleDictionary,
);
