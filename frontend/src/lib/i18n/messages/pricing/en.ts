// Source of truth for the "pricing" namespace. Add keys here first; every
// other locale file must then define the same keys (enforced by tsc and
// src/lib/i18n/__tests__/namespaces.test.ts).
export default {
  "pricing.title": "Plans & Pricing",
  "pricing.subtitle": "Choose the right plan for your career growth",
  "pricing.free": "Free",
  "pricing.monthly": "Monthly",
  "pricing.yearly": "Yearly",
  "pricing.savePercent": "Save ~17%",
  "pricing.forCandidates": "For Candidates",
  "pricing.forEmployers": "For Employers",
} satisfies Record<string, string>;
