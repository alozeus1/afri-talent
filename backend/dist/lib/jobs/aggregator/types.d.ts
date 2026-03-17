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
export type JobSource = "JOBBERMAN" | "BRIGHTERMONDAY" | "MYJOBMAG" | "CAREERS24" | "NGCAREERS" | "LINKEDIN" | "INDEED_EU" | "GLASSDOOR" | "TOTALJOBS" | "REED" | "STEPSTONE" | "XING" | "MONSTER_EU" | "INDEED_US" | "INDEED_CA" | "LINKEDIN_US" | "GLASSDOOR_US" | "ZIPRECRUITER" | "MONSTER_US" | "DICE" | "ANGELLIST" | "REMOTEOK" | "WEWORKREMOTELY" | "FLEXJOBS" | "REMOTECO" | "TURING" | "TOPTAL" | "ANDELA" | "COMPANY_RSS" | "COMPANY_API" | "EMPLOYER_POSTED";
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
export declare const AFRICAN_COUNTRIES: string[];
export declare const AFRICAN_TECH_HUBS: string[];
export declare const AFRICA_FRIENDLY_KEYWORDS: string[];
//# sourceMappingURL=types.d.ts.map