export type CareerProvider =
  | "GREENHOUSE"
  | "LEVER"
  | "ASHBY"
  | "SMARTRECRUITERS"
  | "RECRUITEE"
  | "GENERIC"
  | "WORKDAY"
  | "ICIMS"
  | "JOBVITE"
  | "BAMBOOHR"
  | "WORKABLE"
  | "PERSONIO"
  | "TEAMTAILOR"
  | "PINPOINT"
  | "SAP_SUCCESSFACTORS"
  | "ORACLE_TALEO"
  | "UKG"
  | "ADP";

export type RemoteType = "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN";
export type EmploymentType = "Full-time" | "Part-time" | "Contract" | "Freelance" | "Internship" | "Unknown";
export type VisaSponsorship = "YES" | "NO" | "UNKNOWN";

export interface ScoreBreakdown {
  score: number;
  signals: string[];
  components?: Record<string, number>;
}

export interface NormalizedJob {
  externalId: string;
  provider: CareerProvider | string;
  companyName: string;
  title: string;
  description: string;
  location: string;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  seniority: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  applyUrl: string | null;
  sourceUrl: string | null;
  postedAt: Date | null;
  discoveredAt: Date;
  skills: string[];
  countriesAllowed: string[];
  visaSponsorship: VisaSponsorship;
  hiringForeigners: boolean;
  scamRiskScore: number;
  qualityScore: number;
  relevanceScore: number;
  finalScore: number;
  scoreBreakdown?: {
    scamRisk?: ScoreBreakdown;
    quality?: ScoreBreakdown;
    relevance?: ScoreBreakdown;
    final?: ScoreBreakdown;
  };
  duplicateOfExternalId?: string;
}

export function normalizeRemoteType(value?: string | null): RemoteType {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("remote")) return "REMOTE";
  if (normalized.includes("hybrid")) return "HYBRID";
  if (normalized.includes("onsite") || normalized.includes("on-site") || normalized.includes("office")) return "ONSITE";
  return "UNKNOWN";
}

export function normalizeEmploymentType(value?: string | null): EmploymentType {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("part")) return "Part-time";
  if (normalized.includes("contract")) return "Contract";
  if (normalized.includes("freelance")) return "Freelance";
  if (normalized.includes("intern")) return "Internship";
  if (normalized.includes("full")) return "Full-time";
  return "Unknown";
}
