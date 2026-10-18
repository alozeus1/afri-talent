"use client";

// Translates the English labels produced by shared helpers (lib/job-trust-labels,
// lib/posted-age, lib/salary, lib/job-options) and by the API (enum values,
// employer trust badges) at render time. The helpers stay English and
// unchanged; unknown text is returned as-is, so new backend values degrade to
// English instead of breaking.
import { useCallback } from "react";
import { useLocale } from "./client";
import { usePublicT, type PublicMessageKey, type PublicT, type PublicVars } from "./public-messages";
import { tidyLocation, type TidyLocationOptions } from "../location-display";

const EXACT: Record<string, PublicMessageKey> = {
  // job types (filter values and API values)
  "Full-time": "discover.enum.fullTime",
  FULL_TIME: "discover.enum.fullTime",
  "Part-time": "discover.enum.partTime",
  PART_TIME: "discover.enum.partTime",
  Contract: "discover.enum.contract",
  CONTRACT: "discover.enum.contract",
  Freelance: "discover.enum.freelance",
  FREELANCE: "discover.enum.freelance",
  Internship: "discover.enum.internship",
  INTERNSHIP: "discover.enum.internship",
  Temporary: "discover.enum.temporary",
  TEMPORARY: "discover.enum.temporary",
  // seniority
  Junior: "discover.enum.junior",
  JUNIOR: "discover.enum.junior",
  Entry: "discover.enum.entry",
  ENTRY: "discover.enum.entry",
  "Entry-level": "discover.enum.entry",
  "Mid-level": "discover.enum.mid",
  Mid: "discover.enum.mid",
  MID: "discover.enum.mid",
  Senior: "discover.enum.senior",
  SENIOR: "discover.enum.senior",
  Lead: "discover.enum.lead",
  LEAD: "discover.enum.lead",
  Executive: "discover.enum.executive",
  EXECUTIVE: "discover.enum.executive",
  // workplace
  Remote: "discover.enum.remote",
  REMOTE: "discover.enum.remote",
  remote: "discover.enum.remote",
  Hybrid: "discover.enum.hybrid",
  HYBRID: "discover.enum.hybrid",
  hybrid: "discover.enum.hybrid",
  Onsite: "discover.enum.onsite",
  ONSITE: "discover.enum.onsite",
  onsite: "discover.enum.onsite",
  // salary-page countries
  USA: "discover.country.usa",
  UK: "discover.country.uk",
  Germany: "discover.country.germany",
  Canada: "discover.country.canada",
  Australia: "discover.country.australia",
  Netherlands: "discover.country.netherlands",
  Nigeria: "discover.country.nigeria",
  Kenya: "discover.country.kenya",
  "South Africa": "discover.country.southAfrica",
  // job fields (lib/job-options JOB_FIELDS)
  Technology: "discover.field.technology",
  Healthcare: "discover.field.healthcare",
  Finance: "discover.field.finance",
  Accounting: "discover.field.accounting",
  Sales: "discover.field.sales",
  Marketing: "discover.field.marketing",
  "Customer Support": "discover.field.customerSupport",
  Operations: "discover.field.operations",
  "Human Resources": "discover.field.hr",
  Legal: "discover.field.legal",
  Education: "discover.field.education",
  Design: "discover.field.design",
  Product: "discover.field.product",
  Data: "discover.field.data",
  Cybersecurity: "discover.field.cybersecurity",
  "Engineering Non-Software": "discover.field.engineering",
  "Skilled Trades": "discover.field.trades",
  Logistics: "discover.field.logistics",
  Hospitality: "discover.field.hospitality",
  Nonprofit: "discover.field.nonprofit",
  // discovery freshness / quality enums
  FRESH: "discover.freshness.fresh",
  RECENT: "discover.freshness.recent",
  ACTIVE: "discover.freshness.active",
  AGING: "discover.freshness.aging",
  STALE: "discover.freshness.stale",
  EXPIRED: "discover.freshness.expired",
  fresh: "discover.freshness.fresh",
  recent: "discover.freshness.recent",
  active: "discover.freshness.active",
  aging: "discover.freshness.aging",
  stale: "discover.freshness.stale",
  expired: "discover.freshness.expired",
  TRUSTED: "discover.quality.trusted",
  SOLID: "discover.quality.solid",
  REVIEW: "discover.quality.review",
  THIN: "discover.quality.thin",
  // employer trust badges (backend lib/trust/risk.ts)
  "Domain verified employer": "discover.badge.domainVerified",
  "Business-doc verified employer": "discover.badge.docVerified",
  "Manually reviewed employer": "discover.badge.manualReview",
  "Premium trusted employer": "discover.badge.premiumTrusted",
  "Unverified employer": "discover.badge.unverified",
  // job card / detail badges (components/jobs)
  "Hires from Africa": "discover.badge.hiresFromAfrica",
  "This role is verified as open to applicants based in Africa — located in Africa, remote-worldwide, or offering visa sponsorship.": "discover.badge.hiresFromAfricaHelp",
  "Verified Trust Standard": "discover.badge.trustStandard",
  "This employer has passed strict vetting criteria to ensure a transparent and credible hiring process for global talent.": "discover.badge.trustStandardHelp",
  "Trusted job": "discover.badge.trustedJob",
  "Company reviewed": "discover.badge.companyReviewed",
  "Job quality checked": "discover.badge.qualityChecked",
  "Direct employer source": "discover.badge.directSource",
  "Verified ATS path": "discover.badge.atsPath",
  Expired: "discover.badge.expired",
  "New employer review": "discover.badge.newEmployer",
  // lib/job-trust-labels
  "Salary available": "discover.label.salaryAvailable",
  "Visa status confirmed": "discover.label.visaConfirmed",
  "Recently refreshed": "discover.label.recentlyRefreshed",
  "Recently published": "discover.label.recentlyPublished",
  "External source": "discover.label.externalSource",
  "Apply on AfriTalent": "discover.label.applyOnAfriTalent",
  "Source not confirmed": "discover.label.sourceNotConfirmed",
  "Open to Africa": "discover.label.openToAfrica",
  "Possibly open to Africa": "discover.label.possiblyOpen",
  "Region-restricted": "discover.label.regionRestricted",
  "Confirmed open to African applicants": "discover.verdict.confirmed",
  "Restricted to specific countries or regions": "discover.verdict.restricted",
  "Possibly open to African applicants": "discover.verdict.possible",
  "Not confirmed": "discover.verdict.notConfirmed",
  "The listing names African countries as eligible.": "discover.reason.namesAfrica",
  "The listing is open to applicants worldwide.": "discover.reason.worldwide",
  "The employer sponsors visas.": "discover.reason.sponsors",
  "The listing signals openness to applicants based in Africa.": "discover.reason.signalsOpen",
  "The role is remote, but the listing does not state where applicants must be based.": "discover.reason.remoteUnstated",
  "Check the description or ask the employer before investing time in a long application.": "discover.reason.checkFirst",
  "The listing does not state its hiring regions.": "discover.reason.noRegions",
  "Treat location eligibility as unverified until the employer confirms it.": "discover.reason.unverified",
  // pricing plans and comparison (components/pricing/pricing-data)
  Free: "discover.plan.free",
  Basic: "discover.plan.basic",
  Professional: "discover.plan.professional",
  "Employer Free": "discover.plan.employerFree",
  "Employer Basic": "discover.plan.employerBasic",
  "Employer Premium": "discover.plan.employerPremium",
  "Start your job search": "discover.plan.freeDesc",
  "Supercharge your search": "discover.plan.basicDesc",
  "Let AI work for you": "discover.plan.proDesc",
  "Try hiring on AfriTalent": "discover.plan.employerFreeDesc",
  "Scale your hiring": "discover.plan.employerBasicDesc",
  "Full-power recruiting": "discover.plan.employerPremiumDesc",
  "Browse all jobs": "discover.feat.browseAll",
  Applications: "discover.feat.applications",
  "Basic profile": "discover.feat.basicProfile",
  "Saved searches": "discover.feat.savedSearches",
  "Job alerts": "discover.feat.jobAlerts",
  "AI resume review": "discover.feat.aiResumeReview",
  "AI auto-apply": "discover.feat.autoApply",
  "AI chatbot": "discover.feat.chatbot",
  "Priority matching": "discover.feat.priorityMatching",
  "Resume tailoring": "discover.feat.tailoring",
  "Skills assessments": "discover.feat.assessments",
  "Unlimited applications": "discover.feat.unlimitedApplications",
  "Enhanced profile": "discover.feat.enhancedProfile",
  "Unlimited saved searches": "discover.feat.unlimitedSearches",
  "Salary reports": "discover.feat.salaryReports",
  "Everything in Basic": "discover.feat.everythingBasic",
  "Unlimited AI resume reviews": "discover.feat.unlimitedReviews",
  "AI job matching": "discover.feat.aiMatching",
  "AI apply packs": "discover.feat.applyPacks",
  "AI auto-apply (Autopilot)": "discover.feat.autopilot",
  "AI chatbot (advanced)": "discover.feat.chatbotAdvanced",
  "Priority support": "discover.feat.prioritySupport",
  "Unlimited job postings": "discover.feat.unlimitedPosts",
  "Applicant management": "discover.feat.applicantMgmt",
  "Company profile": "discover.feat.companyProfile",
  "Candidate search": "discover.feat.candidateSearch",
  "Analytics dashboard": "discover.feat.analytics",
  "AI candidate ranking": "discover.feat.aiRanking",
  "ATS integration": "discover.feat.ats",
  "API access": "discover.feat.api",
  "Verified company profile": "discover.feat.verifiedProfile",
  "Advanced analytics": "discover.feat.advancedAnalytics",
  "Job browsing": "discover.feat.jobBrowsing",
  "Applications per month": "discover.feat.applicationsPerMonth",
  "Salary reports access": "discover.feat.salaryAccess",
  "Job postings per month": "discover.feat.postsPerMonth",
  "Verified badge": "discover.feat.verifiedBadge",
  "Personal AI assistant for job search guidance": "discover.feat.tipChatbot",
  "AI finds and scores jobs for you": "discover.feat.tipMatching",
  "AI generates tailored resumes and cover letters": "discover.feat.tipPacks",
  "AI applies to jobs while you sleep": "discover.feat.tipAutopilot",
  "Your profile is boosted in employer searches": "discover.feat.tipPriority",
  "Search and filter talent pool": "discover.feat.tipSearch",
  "AI scores applicants against your requirements": "discover.feat.tipRanking",
  Unlimited: "discover.feat.unlimited",
  // lib/friendly-error (shared API error copy)
  "One more step": "discover.err.consentTitle",
  "Please confirm you have reviewed this AI-assembled application before we submit it.": "discover.err.consentBody",
  "Not eligible to apply yet": "discover.err.notEligibleTitle",
  "Complete your profile and upload an active resume before applying through AfriTalent.": "discover.err.notEligibleBody",
  "Daily limit reached": "discover.err.dailyLimitTitle",
  "Your allowance resets at 00:00 UTC.": "discover.err.dailyLimitBody",
  "You have hit your plan limit": "discover.err.planLimitTitle",
  "Upgrade your plan or wait until tomorrow — your daily allowance resets at 00:00 UTC.": "discover.err.planLimitBody",
  "Already applied": "discover.err.alreadyTitle",
  "You have already submitted an application to this role.": "discover.err.alreadyBody",
  "Account suspended": "discover.err.suspendedTitle",
  "Your account is temporarily suspended. Contact support if you need help.": "discover.err.suspendedBody",
  "Account deactivated": "discover.err.bannedTitle",
  "This account has been deactivated. Contact support if you believe this is a mistake.": "discover.err.bannedBody",
  "Session ended": "discover.err.sessionTitle",
  "For your security, please sign in again.": "discover.err.sessionBody",
  "You are moving fast": "discover.err.rateTitle",
  "Please wait a minute before trying again. AfriTalent limits bursts to keep responses fast for everyone.": "discover.err.rateBody",
  "Please sign in again": "discover.err.authTitle",
  "Your session has expired. Sign in to continue where you left off.": "discover.err.authBody",
  "You do not have access": "discover.err.forbiddenTitle",
  "Your account does not have permission for this action. If this is unexpected, contact support.": "discover.err.forbiddenBody",
  "We could not process that": "discover.err.badRequestTitle",
  "Please review the inputs and try again.": "discover.err.badRequestBody",
  "Not found": "discover.err.notFoundTitle",
  "The item you are looking for is no longer available. Refresh the list or try another search.": "discover.err.notFoundBody",
  "Something went wrong on our side": "discover.err.serverTitle",
  "This is a temporary issue. Please try again in a moment — if it keeps happening, contact support.": "discover.err.serverBody",
  "No internet connection": "discover.err.networkTitle",
  "Check your network and try again. Your drafts are saved locally until the connection returns.": "discover.err.networkBody",
  "Something went wrong": "discover.err.genericTitle",
  "Please try again. If the issue persists, contact support.": "discover.err.genericBody",
  // lib/posted-age
  "Posted today": "discover.posted.today",
  "Posted 1 day ago": "discover.posted.oneDay",
};

const PATTERNS: Array<[RegExp, PublicMessageKey, (m: RegExpMatchArray) => PublicVars]> = [
  [/^(\d+)\/month$/, "discover.feat.perMonth", (m) => ({ count: m[1] })],
  [/^(\d+)\/mo$/, "discover.feat.perMonthShort", (m) => ({ count: m[1] })],
  [/^Cross-checked x(\d+)$/, "discover.badge.crossChecked", (m) => ({ count: m[1] })],
  [/^Posted (\d+)d ago$/, "discover.posted.daysShort", (m) => ({ count: m[1] })],
  [/^Posted (\d+)w ago$/, "discover.posted.weeksShort", (m) => ({ count: m[1] })],
  [/^Posted (\d+)mo ago$/, "discover.posted.monthsShort", (m) => ({ count: m[1] })],
  [/^Posted (\d+) days ago$/, "discover.posted.days", (m) => ({ count: m[1] })],
  [/^Eligibility is listed as: (.+)\.$/, "discover.reason.listedAs", (m) => ({ list: m[1] })],
];

const SALARY_PERIOD: Record<string, PublicMessageKey> = {
  year: "discover.salary.perYear",
  month: "discover.salary.perMonth",
  week: "discover.salary.perWeek",
  day: "discover.salary.perDay",
  hour: "discover.salary.perHour",
};

export function translateLabel(tp: PublicT, text: string | null | undefined): string {
  if (!text) return "";
  const exact = EXACT[text];
  if (exact) return tp(exact);
  for (const [pattern, key, vars] of PATTERNS) {
    const match = text.match(pattern);
    if (match) return tp(key, vars(match));
  }
  const salary = text.match(/^(.+)\/(year|month|week|day|hour)$/);
  if (salary) return tp(SALARY_PERIOD[salary[2]], { amount: salary[1] });
  return text;
}

/** `label("Full-time")` -> "Temps plein" in French; unknown text passes through. */
export function usePublicLabel() {
  const tp = usePublicT();
  return useCallback((text: string | null | undefined) => translateLabel(tp, text), [tp]);
}

// ------------------------------------------------------------- locations ---
// Job locations are free text ("Remote", "Lagos, Nigeria", "Remote (Africa)").
// Known region words are translated through the dictionary, country names
// through Intl.DisplayNames, and everything else (cities) is kept as-is.

const LOCATION_WORDS: Record<string, PublicMessageKey> = {
  remote: "discover.enum.remote",
  "fully remote": "discover.enum.remote",
  "remote-first": "discover.enum.remote",
  hybrid: "discover.enum.hybrid",
  onsite: "discover.enum.onsite",
  "on-site": "discover.enum.onsite",
  "on site": "discover.enum.onsite",
  "in office": "discover.enum.onsite",
  worldwide: "discover.loc.worldwide",
  global: "discover.loc.worldwide",
  "remote worldwide": "discover.loc.worldwide",
  anywhere: "discover.loc.anywhere",
  africa: "discover.loc.africa",
  "sub-saharan africa": "discover.loc.subSaharanAfrica",
  "west africa": "discover.loc.westAfrica",
  "east africa": "discover.loc.eastAfrica",
  europe: "discover.loc.europe",
  emea: "discover.loc.emea",
  americas: "discover.loc.americas",
  asia: "discover.loc.asia",
  "middle east": "discover.loc.middleEast",
  "multiple locations": "discover.loc.multiple",
};

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "US",
  "u.s.": "US",
  us: "US",
  "united states of america": "US",
  uk: "GB",
  "u.k.": "GB",
  england: "GB",
  uae: "AE",
  "drc": "CD",
  "dr congo": "CD",
  "ivory coast": "CI",
  "cote d'ivoire": "CI",
};

let countryIndex: Map<string, string> | null = null;
function countryCode(name: string): string | undefined {
  const key = name.toLowerCase();
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key];
  if (!countryIndex) {
    countryIndex = new Map();
    try {
      const english = new Intl.DisplayNames(["en"], { type: "region" });
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      for (const a of letters) {
        for (const b of letters) {
          const code = a + b;
          const label = english.of(code);
          if (label && label !== code) countryIndex.set(label.toLowerCase(), code);
        }
      }
    } catch {
      // Intl.DisplayNames unavailable: countries stay in English.
    }
  }
  return countryIndex.get(key);
}

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();
function countryName(locale: string, code: string): string | undefined {
  if (!displayNamesCache.has(locale)) {
    try {
      displayNamesCache.set(locale, new Intl.DisplayNames([locale], { type: "region" }));
    } catch {
      displayNamesCache.set(locale, null);
    }
  }
  return displayNamesCache.get(locale)?.of(code);
}

function translateLocationPart(tp: PublicT, locale: string, part: string): string {
  const trimmed = part.trim();
  if (!trimmed) return part;
  const word = LOCATION_WORDS[trimmed.toLowerCase()];
  if (word) return part.replace(trimmed, tp(word));
  const code = countryCode(trimmed);
  const localized = code && locale !== "en" ? countryName(locale, code) : undefined;
  return localized ? part.replace(trimmed, localized) : part;
}

function translateLocationText(tp: PublicT, locale: string, text: string): string {
  if (!text) return "";
  const whole = translateLocationPart(tp, locale, text);
  if (whole !== text) return whole;
  return text
    .split(/(\s*[,·/|()]\s*|\s+[-–]\s+)/)
    .map((part, i) => (i % 2 === 1 ? part : translateLocationPart(tp, locale, part)))
    .join("");
}

/**
 * "Remote (Africa)" -> "À distance (Afrique)" in French; cities pass through.
 * Raw feed strings are tidied first (lib/location-display): "Paris, Paris" ->
 * "Paris", "CET +/- 3 hours" -> "Remote (CET ±3h)", and with `compact` a long
 * country list -> "South Africa + 20 more".
 */
export function translateLocation(
  tp: PublicT,
  locale: string,
  text: string | null | undefined,
  options: TidyLocationOptions = {},
): string {
  if (!text) return "";
  const tidy = tidyLocation(text, options);
  if (tidy.kind === "timezone") return tp("discover.loc.remoteTimezone", { zone: tidy.zone });
  if (tidy.kind === "list") {
    return tp("discover.loc.plusMore", { place: translateLocationText(tp, locale, tidy.first), count: tidy.more });
  }
  return translateLocationText(tp, locale, tidy.text);
}

/** `location("Remote, Nigeria")` -> "Remoto, Nigéria" in Portuguese. */
export function useLocationLabel() {
  const tp = usePublicT();
  const locale = useLocale();
  return useCallback(
    (text: string | null | undefined, options?: TidyLocationOptions) => translateLocation(tp, locale, text, options),
    [tp, locale],
  );
}
