// Every translation namespace, keyed by name. Used by the i18n parity test and
// `npm run i18n:check`. Register new namespaces here (see docs/i18n.md).
import type { SupportedLocale } from "../config";
import admin from "./admin";
import auth from "./auth";
import candidate from "./candidate";
import candidateAi from "./candidateAi";
import candidateHome from "./candidateHome";
import candidateProfile from "./candidateProfile";
import common from "./common";
import companies from "./companies";
import discover from "./discover";
import employer from "./employer";
import employerInsights from "./employerInsights";
import employerJobs from "./employerJobs";
import employerSetup from "./employerSetup";
import employerTalent from "./employerTalent";
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
 * Area namespaces with their own hooks: useAdminT, useSupportT,
 * usePublicT (site, discover, guides, legal; see public-messages.ts),
 * useCandidateT (candidateHome, candidateProfile, candidateAi) and
 * useEmployerI18n (employer, employerJobs, employerTalent, employerSetup,
 * employerInsights).
 */
export const AREA_NAMESPACES = {
  admin,
  support,
  site,
  discover,
  guides,
  legal,
  candidateHome,
  candidateProfile,
  candidateAi,
  employer,
  employerJobs,
  employerTalent,
  employerSetup,
  employerInsights,
} as const;

export const ALL_NAMESPACES: Record<string, Record<SupportedLocale, Record<string, string>>> = {
  ...SITE_NAMESPACES,
  ...AREA_NAMESPACES,
};
