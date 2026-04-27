export const KEYWORD_CATEGORIES = {
  tech: [
    "software engineer",
    "frontend engineer",
    "backend engineer",
    "full stack engineer",
    "qa engineer",
    "mobile developer",
    "systems engineer",
    "network engineer",
  ],
  ai: [
    "machine learning engineer",
    "mlops engineer",
    "ai architect",
    "ai solutions architect",
    "prompt engineer",
    "ai researcher",
    "ai product manager",
    "ai ethicist",
    "ai trainer",
    "agentic ai engineer",
    "ai orchestrator",
    "multi-agent systems engineer",
    "autonomous systems engineer",
    "ai workflow engineer",
    "robotics engineer",
    "computer vision engineer",
    "nlp engineer",
  ],
  security: [
    "cybersecurity engineer",
    "security engineer",
    "security analyst",
    "cloud security engineer",
    "penetration tester",
    "soc analyst",
    "grc analyst",
    "security architect",
    "devsecops engineer",
    "ai compliance officer",
    "data privacy engineer",
    "risk analyst",
  ],
  cloud: [
    "devops engineer",
    "platform engineer",
    "site reliability engineer",
    "sre",
    "cloud engineer",
    "cloud architect",
    "solutions architect",
    "infrastructure engineer",
    "kubernetes engineer",
    "ci/cd engineer",
  ],
  data: [
    "data scientist",
    "data analyst",
    "data engineer",
    "analytics engineer",
    "data architect",
    "business intelligence engineer",
  ],
  healthcare: [
    "nurse",
    "nurse practitioner",
    "doctor",
    "physician",
    "pharmacist",
    "physical therapist",
    "occupational therapist",
    "speech therapist",
    "mental health therapist",
    "caregiver",
  ],
  business: [
    "business analyst",
    "strategy analyst",
    "operations analyst",
    "product owner",
    "scrum master",
    "program director",
    "product manager",
    "project manager",
    "operations manager",
  ],
  marketing: [
    "performance marketer",
    "growth hacker",
    "email marketing specialist",
    "crm specialist",
    "product marketing manager",
    "content creator",
    "community manager",
    "social media strategist",
  ],
  trades: [
    "hvac technician",
    "plumber",
    "electrician",
    "welder",
    "construction manager",
    "maintenance technician",
    "mechanic",
  ],
  emerging: [
    "renewable energy engineer",
    "solar engineer",
    "sustainability analyst",
  ],
} as const;

export const INTENT_EXPANSIONS: Readonly<Record<string, readonly string[]>> = {
  "devops": [
    "devops engineer",
    "platform engineer",
    "site reliability engineer",
    "sre",
    "cloud engineer",
    "infrastructure engineer",
    "kubernetes engineer",
    "devsecops engineer",
    "ci/cd engineer",
  ],
  "devops engineer": [
    "platform engineer",
    "sre",
    "site reliability engineer",
    "cloud engineer",
    "infrastructure engineer",
    "kubernetes engineer",
    "devsecops engineer",
    "ci/cd engineer",
  ],
  "cybersecurity": KEYWORD_CATEGORIES.security,
  "security engineer": [
    "cybersecurity engineer",
    "cloud security engineer",
    "application security engineer",
    "devsecops engineer",
    "security architect",
  ],
  "data analyst": [
    "analytics engineer",
    "business intelligence engineer",
    "data analyst",
    "bi analyst",
  ],
  "machine learning engineer": [
    "ml engineer",
    "mlops engineer",
    "ai engineer",
    "ai researcher",
    "computer vision engineer",
    "nlp engineer",
  ],
  "product manager": [
    "product owner",
    "ai product manager",
    "program manager",
    "scrum master",
  ],
  "nurse": [
    "registered nurse",
    "nurse practitioner",
    "clinical nurse",
    "caregiver",
  ],
};

const MAX_EXPANDED_KEYWORDS = 24;

export function smartKeywordExpansionEnabled(): boolean {
  return process.env.SMART_SEARCH_KEYWORD_EXPANSION_ENABLED === "1";
}

export function normalizeKeyword(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}+#/. -]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function getDefaultSmartKeywords(): string[] {
  return Object.values(KEYWORD_CATEGORIES).flatMap((keywords) => [...keywords]);
}

export function expandSearchKeywords(input: {
  query?: string | null;
  includeExpandedKeywords?: boolean;
  forceEnable?: boolean;
}): {
  original: string[];
  expanded: string[];
  all: string[];
  enabled: boolean;
} {
  const normalized = normalizeKeyword(input.query ?? "");
  const original = normalized ? [normalized] : [];
  const enabled = Boolean(input.includeExpandedKeywords && (input.forceEnable || smartKeywordExpansionEnabled()));
  if (!enabled || original.length === 0) {
    return { original, expanded: [], all: original, enabled };
  }

  const expanded = new Set<string>();
  for (const [intent, keywords] of Object.entries(INTENT_EXPANSIONS)) {
    if (normalized === intent || normalized.includes(intent) || intent.includes(normalized)) {
      keywords.map(normalizeKeyword).filter(Boolean).forEach((keyword) => expanded.add(keyword));
    }
  }

  for (const keywords of Object.values(KEYWORD_CATEGORIES)) {
    const categoryMatch = keywords.some((keyword) => normalizeKeyword(keyword).includes(normalized));
    if (categoryMatch) {
      keywords.map(normalizeKeyword).forEach((keyword) => expanded.add(keyword));
    }
  }

  expanded.delete(normalized);
  const expandedList = Array.from(expanded).slice(0, MAX_EXPANDED_KEYWORDS);
  return {
    original,
    expanded: expandedList,
    all: Array.from(new Set([...original, ...expandedList])),
    enabled,
  };
}
