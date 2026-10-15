// Every translation namespace, keyed by name. Used by the i18n parity test and
// `npm run i18n:check`. Register new namespaces here (see docs/i18n.md).
import type { SupportedLocale } from "../config";
import admin from "./admin";
import auth from "./auth";
import candidate from "./candidate";
import common from "./common";
import companies from "./companies";
import discover from "./discover";
import guides from "./guides";
import home from "./home";
import interviews from "./interviews";
import jobs from "./jobs";
import learning from "./learning";
import legal from "./legal";
import nav from "./nav";
import pricing from "./pricing";
import salaries from "./salaries";
import site from "./site";
import support from "./support";

/** Namespaces merged into the site-wide `MESSAGES` dictionary (useT). */
export const SITE_NAMESPACES = {
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
} as const;

/**
 * Area namespaces with their own hooks: useAdminT, useSupportT, and
 * usePublicT (site, discover, guides, legal; see public-messages.ts).
 */
export const AREA_NAMESPACES = { admin, support, site, discover, guides, legal } as const;

export const ALL_NAMESPACES: Record<string, Record<SupportedLocale, Record<string, string>>> = {
  ...SITE_NAMESPACES,
  ...AREA_NAMESPACES,
};
