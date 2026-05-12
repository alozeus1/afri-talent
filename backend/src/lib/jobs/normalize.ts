// §4.5 — Normalisation at ingest.
//
// Three pure helpers shared by the ingest write-path, the dedup key builder
// (PR K, Wave 3 §4.2), and the search facets. Stored values stay raw; these
// produce the canonical form used for matching and display.
//
// Rules:
//   * normalizeCompany — title-case-then-known-overrides. Brand spellings
//     (Fivetran, Reddit, eBay…) win over the title-case default.
//   * normalizeTitle   — strip seniority prefixes/suffixes for dedup only.
//     The original title stays in Job.title for display; this output is only
//     used to compute dedupKeyV2.
//   * normalizeLocation — strip "Remote", normalise commas + casing, map the
//     work-arrangement hint (remote/hybrid/onsite) when present.
//
// Keep this module free of i/o and free of Prisma so it can be exercised from
// scripts, tests, and request handlers without bootstrapping the DB layer.

export interface NormalizedLocation {
  city: string | null;
  region: string | null;
  country: string | null;
  workArrangement: "REMOTE" | "HYBRID" | "ONSITE" | null;
  display: string;
}

// Hand-curated overrides for brand casing that title-case would mangle.
// Add entries here when a real source surfaces a mis-cased company. Each key
// is the lower-case raw input.
const COMPANY_OVERRIDES: Readonly<Record<string, string>> = {
  fivetran: "Fivetran",
  reddit: "Reddit",
  ebay: "eBay",
  paypal: "PayPal",
  airbnb: "Airbnb",
  github: "GitHub",
  gitlab: "GitLab",
  shopify: "Shopify",
  cloudflare: "Cloudflare",
  databricks: "Databricks",
  doordash: "DoorDash",
  hubspot: "HubSpot",
  iheartmedia: "iHeartMedia",
  linkedin: "LinkedIn",
  mongodb: "MongoDB",
  myspace: "Myspace",
  netflix: "Netflix",
  nvidia: "NVIDIA",
  openai: "OpenAI",
  paystack: "Paystack",
  flutterwave: "Flutterwave",
  pinterest: "Pinterest",
  postgresql: "PostgreSQL",
  postman: "Postman",
  quora: "Quora",
  salesforce: "Salesforce",
  servicenow: "ServiceNow",
  snowflake: "Snowflake",
  spotify: "Spotify",
  squarespace: "Squarespace",
  stripe: "Stripe",
  twilio: "Twilio",
  uber: "Uber",
  vercel: "Vercel",
  webflow: "Webflow",
  wikipedia: "Wikipedia",
  workday: "Workday",
  youtube: "YouTube",
  zapier: "Zapier",
  zendesk: "Zendesk",
  zoom: "Zoom",
  aws: "AWS",
  ibm: "IBM",
  sap: "SAP",
  hsbc: "HSBC",
  kpmg: "KPMG",
  pwc: "PwC",
  jpmorgan: "JPMorgan",
  morganstanley: "Morgan Stanley",
  goldmansachs: "Goldman Sachs",
  mtn: "MTN",
  unicef: "UNICEF",
  who: "WHO",
  un: "UN",
  nasa: "NASA",
  bbc: "BBC",
};

// Seniority/level tokens stripped from titles when computing the dedup form.
const SENIORITY_TOKENS: ReadonlyArray<RegExp> = [
  /^staff\s+/i,
  /^principal\s+/i,
  /^lead\s+/i,
  /^head\s+of\s+/i,
  /^senior\s+/i,
  /^sr\.?\s+/i,
  /^junior\s+/i,
  /^jr\.?\s+/i,
  /^associate\s+/i,
  /^entry[\s-]level\s+/i,
  /^mid[\s-]level\s+/i,
  /^graduate\s+/i,
  /^intern(?:ship)?\s+/i,
  /\s+i{1,3}$/i, // trailing Roman numerals: "Engineer II", "Designer III"
  /\s+\d+$/, // trailing arabic numerals: "Engineer 2"
  /,\s*(?:senior|junior|lead|principal|staff)$/i,
];

const TITLE_QUALIFIER_SPLIT = /\s+[-–—|·•]\s+/; // em-dash, en-dash, hyphen, pipe, bullets — surrounded by whitespace
const NOISE_PUNCTUATION = /[·•]/g; // remaining decorative bullets
const MULTI_WS = /\s+/g;
const TRAILING_PARENS = /\s*\([^)]*\)\s*$/g;

const REMOTE_HINT = /\b(remote|work from home|wfh)\b/i;
const HYBRID_HINT = /\b(hybrid)\b/i;
const ONSITE_HINT = /\b(on[-\s]?site|in[-\s]?office)\b/i;

const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  usa: "United States",
  us: "United States",
  uk: "United Kingdom",
  uae: "United Arab Emirates",
  drc: "Democratic Republic of the Congo",
  ksa: "Saudi Arabia",
};

const KNOWN_COUNTRIES: ReadonlyArray<string> = [
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Netherlands",
  "Ireland",
  "Sweden",
  "Norway",
  "Denmark",
  "Finland",
  "Switzerland",
  "Austria",
  "Belgium",
  "Portugal",
  "Poland",
  "Nigeria",
  "Kenya",
  "South Africa",
  "Ghana",
  "Egypt",
  "Morocco",
  "Tunisia",
  "Tanzania",
  "Uganda",
  "Rwanda",
  "Senegal",
  "Côte d'Ivoire",
  "Ivory Coast",
  "Ethiopia",
  "Zambia",
  "Zimbabwe",
  "Botswana",
  "Cameroon",
  "Angola",
  "Mozambique",
  "Algeria",
  "Sudan",
  "India",
  "Singapore",
  "Hong Kong",
  "Japan",
  "South Korea",
  "Brazil",
  "Mexico",
  "Argentina",
  "Chile",
  "Colombia",
  "United Arab Emirates",
  "Saudi Arabia",
  "Israel",
  "Turkey",
];

const COUNTRY_BY_LC = new Map<string, string>(
  KNOWN_COUNTRIES.map((c) => [c.toLowerCase(), c]),
);

function titleCaseWord(word: string): string {
  if (!word) return word;
  // Preserve tokens that already mix case (likely a brand: DoorDash, eBay,
  // PostgreSQL). Genuine acronyms (AWS, IBM, MTN, NASA…) live in
  // COMPANY_OVERRIDES and short-circuit before this is called.
  if (/[a-z]/.test(word) && /[A-Z]/.test(word)) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function normalizeCompany(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(MULTI_WS, " ");
  const overrideKey = compact.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (COMPANY_OVERRIDES[overrideKey]) return COMPANY_OVERRIDES[overrideKey];

  const words = compact.split(" ");
  const cased = words.map(titleCaseWord).join(" ");

  // Strip common corporate suffixes ", Inc.", ", LLC" when followed by EOL.
  return cased.replace(/,?\s+(inc|inc\.|llc|ltd|ltd\.|gmbh|s\.a\.|co\.|corp\.|corporation)$/i, "").trim();
}

export function normalizeTitle(raw: string | null | undefined): string {
  let title = (raw ?? "").trim();
  if (!title) return "";

  // Drop trailing department qualifiers after a dash, em-dash, or pipe BEFORE
  // collapsing punctuation so "Senior PM | Payments" becomes "PM" not
  // "PM Payments".
  title = title.split(TITLE_QUALIFIER_SPLIT)[0].trim();
  title = title.replace(TRAILING_PARENS, "");
  title = title.replace(NOISE_PUNCTUATION, " ");
  title = title.replace(MULTI_WS, " ").trim();

  for (const rx of SENIORITY_TOKENS) {
    title = title.replace(rx, " ").trim();
  }

  return title.toLowerCase();
}

export function normalizeLocation(
  raw: string | null | undefined,
  hint?: "remote" | "hybrid" | "onsite" | null,
): NormalizedLocation {
  const cleaned = (raw ?? "").replace(MULTI_WS, " ").trim();
  if (!cleaned) {
    return {
      city: null,
      region: null,
      country: null,
      workArrangement: hint ? hintToArrangement(hint) : null,
      display: "",
    };
  }

  const arrangement =
    hint ? hintToArrangement(hint)
    : REMOTE_HINT.test(cleaned) ? "REMOTE"
    : HYBRID_HINT.test(cleaned) ? "HYBRID"
    : ONSITE_HINT.test(cleaned) ? "ONSITE"
    : null;

  const stripped = cleaned
    .replace(REMOTE_HINT, "")
    .replace(HYBRID_HINT, "")
    .replace(ONSITE_HINT, "")
    .replace(/[()]/g, "")
    .replace(/^[,\s-]+|[,\s-]+$/g, "")
    .replace(MULTI_WS, " ")
    .trim();

  if (!stripped) {
    return {
      city: null,
      region: null,
      country: null,
      workArrangement: arrangement,
      display: "Remote",
    };
  }

  const parts = stripped.split(",").map((p) => p.trim()).filter(Boolean);

  let country: string | null = null;
  let region: string | null = null;
  let city: string | null = null;

  for (let i = parts.length - 1; i >= 0; i--) {
    const lc = parts[i].toLowerCase().replace(/\./g, "");
    if (COUNTRY_BY_LC.has(lc)) {
      country = COUNTRY_BY_LC.get(lc)!;
      parts.splice(i, 1);
      break;
    }
    if (COUNTRY_ALIASES[lc]) {
      country = COUNTRY_ALIASES[lc];
      parts.splice(i, 1);
      break;
    }
  }

  if (parts.length === 2) {
    [city, region] = parts;
  } else if (parts.length === 1) {
    city = parts[0];
  } else if (parts.length >= 3) {
    city = parts[0];
    region = parts[parts.length - 1];
  }

  const display = [city, region, country].filter(Boolean).join(", ") || cleaned;

  return {
    city: city ? city.split(" ").map(titleCaseWord).join(" ") : null,
    region: region ? normalizeRegion(region) : null,
    country,
    workArrangement: arrangement,
    display,
  };
}

// US/CA state-style abbreviations stay all-caps; longer region names are
// title-cased like cities.
function normalizeRegion(raw: string): string {
  const trimmed = raw.trim();
  if (/^[A-Z]{2,3}$/.test(trimmed)) return trimmed;
  return trimmed.split(" ").map(titleCaseWord).join(" ");
}

function hintToArrangement(hint: "remote" | "hybrid" | "onsite"): "REMOTE" | "HYBRID" | "ONSITE" {
  if (hint === "remote") return "REMOTE";
  if (hint === "hybrid") return "HYBRID";
  return "ONSITE";
}
