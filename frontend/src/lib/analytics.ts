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
  if (name.includes("profile") || name.includes("first_")) {
    return "ACTIVATION";
  }
  if (name.includes("pipeline") || name.includes("application_status")) {
    return "EMPLOYER_PIPELINE";
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
