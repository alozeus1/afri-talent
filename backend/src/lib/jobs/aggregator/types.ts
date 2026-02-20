// ─────────────────────────────────────────────────────────────────────────────
// Job Aggregator Types - Global job board integration
// ─────────────────────────────────────────────────────────────────────────────

export interface AggregatedJob {
  externalId: string;
  source: JobSource;
  sourceUrl: string;
  title: string;
  company: string;
  companyLogo?: string;
  location: string;
  locationType: "remote" | "hybrid" | "onsite";
  country: string;
  region: JobRegion;
  description: string;
  requirements: string[];
  salary?: {
    min?: number;
    max?: number;
    currency: string;
    period: "yearly" | "monthly" | "hourly";
  };
  visaSponsorship: "YES" | "NO" | "UNKNOWN";
  relocationAssistance: boolean;
  eligibleCountries: string[];
  skills: string[];
  seniority: "Junior" | "Mid-level" | "Senior" | "Lead" | "Executive" | null;
  jobType: "Full-time" | "Part-time" | "Contract" | "Freelance" | "Internship";
  postedAt: Date;
  expiresAt?: Date;
  applicationUrl: string;
  rawData?: Record<string, unknown>;
}

export type JobSource =
  // African Job Boards
  | "JOBBERMAN"
  | "BRIGHTERMONDAY"
  | "MYJOBMAG"
  | "CAREERS24"
  | "NGCAREERS"
  // European Job Boards
  | "LINKEDIN"
  | "INDEED_EU"
  | "GLASSDOOR"
  | "TOTALJOBS"
  | "REED"
  | "STEPSTONE"
  | "XING"
  | "MONSTER_EU"
  // North American Job Boards
  | "INDEED_US"
  | "INDEED_CA"
  | "LINKEDIN_US"
  | "GLASSDOOR_US"
  | "ZIPRECRUITER"
  | "MONSTER_US"
  | "DICE"
  | "ANGELLIST"
  // Remote-First Platforms
  | "REMOTEOK"
  | "WEWORKREMOTELY"
  | "FLEXJOBS"
  | "REMOTECO"
  | "TURING"
  | "TOPTAL"
  | "ANDELA"
  // Direct Company Feeds
  | "COMPANY_RSS"
  | "COMPANY_API"
  // Manual Entry
  | "EMPLOYER_POSTED";

export type JobRegion = "AFRICA" | "EUROPE" | "NORTH_AMERICA" | "REMOTE_GLOBAL" | "OTHER";

export interface JobSourceConfig {
  source: JobSource;
  name: string;
  region: JobRegion;
  baseUrl: string;
  apiKey?: string;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  enabled: boolean;
  supportsAfricanCandidates: boolean;
  visaSponsorshipCommon: boolean;
}

export interface AggregatorResult {
  source: JobSource;
  jobs: AggregatedJob[];
  totalFound: number;
  fetchedAt: Date;
  nextCursor?: string;
  errors?: string[];
}

export interface AggregatorConfig {
  sources: JobSourceConfig[];
  searchTerms: string[];
  africanCountries: string[];
  targetSkills: string[];
  maxJobsPerSource: number;
  deduplicationEnabled: boolean;
}

// Default African countries ISO codes
export const AFRICAN_COUNTRIES = [
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD",
  "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE",
  "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG",
  "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG",
  "ZM", "ZW"
];

// Tech hubs in Africa
export const AFRICAN_TECH_HUBS = [
  "Lagos", "Nairobi", "Cape Town", "Johannesburg", "Accra", "Cairo", "Kigali",
  "Addis Ababa", "Casablanca", "Tunis", "Dakar", "Kampala", "Dar es Salaam"
];

// Keywords indicating Africa-friendly positions
export const AFRICA_FRIENDLY_KEYWORDS = [
  "africa", "african", "remote worldwide", "remote global", "remote anywhere",
  "work from anywhere", "distributed team", "global team", "visa sponsorship",
  "relocation assistance", "relocation support", "willing to relocate",
  "emerging markets", "emea", "sub-saharan", "middle east and africa"
];
