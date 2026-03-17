import type { AggregatorResult, JobSource, JobSourceConfig } from "../types.js";
export declare abstract class BaseJobSource {
    protected config: JobSourceConfig;
    protected requestCount: number;
    protected lastRequestTime: number;
    constructor(config: JobSourceConfig);
    get source(): JobSource;
    get isEnabled(): boolean;
    abstract fetchJobs(query: JobQuery): Promise<AggregatorResult>;
    protected rateLimit(): Promise<void>;
    protected log(message: string, meta?: Record<string, unknown>): void;
    protected logError(message: string, error: unknown): void;
    protected normalizeLocation(location: string): {
        city: string;
        country: string;
        locationType: "remote" | "hybrid" | "onsite";
    };
    protected extractSkills(text: string): string[];
    protected detectVisaSponsorship(text: string): "YES" | "NO" | "UNKNOWN";
    protected detectSeniority(title: string, description: string): "Junior" | "Mid-level" | "Senior" | "Lead" | "Executive" | null;
}
export interface JobQuery {
    keywords: string[];
    location?: string;
    remote?: boolean;
    visaSponsorship?: boolean;
    postedWithinDays?: number;
    limit?: number;
    cursor?: string;
}
//# sourceMappingURL=base.d.ts.map