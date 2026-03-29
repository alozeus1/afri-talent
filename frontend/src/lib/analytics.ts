import { analyticsEventsApi } from "./api";

type EventProperties = Record<string, string | number | boolean | null>;

type AnalyticsCategory =
  | "ACQUISITION"
  | "ACTIVATION"
  | "ENGAGEMENT"
  | "CONVERSION"
  | "RETENTION"
  | "MONETIZATION"
  | "EMPLOYER_PIPELINE"
  | "SYSTEM";

function classifyEvent(name: string): AnalyticsCategory {
  if (name.startsWith("pricing_") || name.includes("checkout") || name.includes("upgrade")) {
    return "MONETIZATION";
  }
  if (name.includes("oauth") || name.includes("signup") || name.includes("landing")) {
    return "ACQUISITION";
  }
  if (name.includes("profile") || name.includes("first_") || name.includes("onboarding")) {
    return "ACTIVATION";
  }
  if (
    name.includes("pipeline") ||
    name.includes("application_status") ||
    name.includes("candidate_list") ||
    name.includes("talent_results")
  ) {
    return "EMPLOYER_PIPELINE";
  }
  if (
    name.includes("retention") ||
    name.includes("digest") ||
    name.includes("saved_search") ||
    name.includes("interview_prep") ||
    name.includes("journey_cta") ||
    name.includes("recommendation_clicked")
  ) {
    return "RETENTION";
  }
  return "ENGAGEMENT";
}

function getSessionId(): string {
  if (typeof window === "undefined") return "server-session";
  const key = "afritalent_analytics_session";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  window.sessionStorage.setItem(key, next);
  return next;
}

/**
 * Lightweight analytics abstraction.
 * Dispatches to window.gtag / window.plausible / custom backend.
 * Replace with your actual analytics provider.
 */
export function trackEvent(name: string, properties?: EventProperties): void {
  try {
    // Google Analytics 4
    if (typeof window !== "undefined" && "gtag" in window) {
      (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
        "event",
        name,
        properties,
      );
    }

    // Plausible
    if (typeof window !== "undefined" && "plausible" in window) {
      (window as unknown as { plausible: (name: string, opts?: { props: EventProperties }) => void }).plausible(
        name,
        properties ? { props: properties } : undefined,
      );
    }

    // Dev logging
    if (process.env.NODE_ENV === "development") {
      console.debug(`[analytics] ${name}`, properties);
    }

    void analyticsEventsApi.ingest([
      {
        category: classifyEvent(name),
        eventName: name,
        sessionId: getSessionId(),
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
        referrer: typeof document !== "undefined" ? document.referrer : undefined,
        properties: properties || undefined,
        occurredAt: new Date().toISOString(),
      },
    ]);
  } catch {
    // Silently fail — analytics should never break the app
  }
}

// Pricing-specific events
export const pricingEvents = {
  pageView: (region: string, currency: string) =>
    trackEvent("pricing_page_view", { region, currency }),

  regionChange: (from: string, to: string) =>
    trackEvent("pricing_region_change", { from_region: from, to_region: to }),

  intervalToggle: (interval: "MONTHLY" | "YEARLY") =>
    trackEvent("pricing_interval_toggle", { interval }),

  planTabSwitch: (tab: "candidate" | "employer") =>
    trackEvent("pricing_tab_switch", { tab }),

  planSelect: (plan: string, region: string, interval: string, amount: number) =>
    trackEvent("pricing_plan_select", { plan, region, interval, amount }),

  checkoutClick: (plan: string, region: string, interval: string) =>
    trackEvent("pricing_checkout_click", { plan, region, interval }),

  comparisonExpand: (table: "candidate" | "employer") =>
    trackEvent("pricing_comparison_expand", { table }),

  faqExpand: (question: string) =>
    trackEvent("pricing_faq_expand", { question }),

  upgradeCtaClick: (feature: string, currentPlan: string) =>
    trackEvent("upgrade_cta_click", { feature, current_plan: currentPlan }),
};

export const jobDiscoveryEvents = {
  resultsLoaded: (properties: EventProperties) =>
    trackEvent("job_search_results_loaded", properties),

  resultClicked: (properties: EventProperties) =>
    trackEvent("job_search_result_clicked", properties),

  explanationViewed: (properties: EventProperties) =>
    trackEvent("job_ranking_explanation_viewed", properties),
};

export const employerOnboardingEvents = {
  onboardingViewed: (properties: EventProperties) =>
    trackEvent("employer_onboarding_viewed", properties),

  stepCompleted: (properties: EventProperties) =>
    trackEvent("employer_onboarding_step_completed", properties),

  candidateFiltersSaved: (properties: EventProperties) =>
    trackEvent("employer_candidate_filters_saved", properties),

  upgradeCtaClicked: (properties: EventProperties) =>
    trackEvent("employer_upgrade_cta_clicked", properties),

  jobQualityPreviewViewed: (properties: EventProperties) =>
    trackEvent("employer_job_quality_preview_viewed", properties),

  candidateListViewed: (properties: EventProperties) =>
    trackEvent("employer_candidate_list_viewed", properties),

  talentResultsLoaded: (properties: EventProperties) =>
    trackEvent("employer_talent_results_loaded", properties),
};

export const candidateRetentionEvents = {
  summaryViewed: (properties: EventProperties) =>
    trackEvent("candidate_retention_summary_viewed", properties),

  journeyCtaClicked: (properties: EventProperties) =>
    trackEvent("candidate_journey_cta_clicked", properties),

  preferencesUpdated: (properties: EventProperties) =>
    trackEvent("candidate_preferences_updated", properties),

  weeklyDigestViewed: (properties: EventProperties) =>
    trackEvent("candidate_weekly_digest_viewed", properties),

  recommendationClicked: (properties: EventProperties) =>
    trackEvent("candidate_recommendation_clicked", properties),

  experimentExposed: (properties: EventProperties) =>
    trackEvent("candidate_experiment_exposed", properties),
};
