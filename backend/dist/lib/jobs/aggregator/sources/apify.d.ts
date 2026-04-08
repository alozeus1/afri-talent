import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatorResult, JobRegion } from "../types.js";
type LocationType = "remote" | "hybrid" | "onsite";
interface ApifyTaskConfig {
    taskId: string;
    label?: string;
    defaultInput?: Record<string, unknown>;
    maxItems?: number;
    countryHint?: string;
    regionHint?: JobRegion;
    locationTypeHint?: LocationType;
    companyFallback?: string;
    overrideKeywordsField?: string;
    overrideLocationField?: string;
    overrideLimitField?: string;
}
export declare function parseApifyTaskConfigs(raw: string | undefined): ApifyTaskConfig[];
export declare class ApifySource extends BaseJobSource {
    private readonly token;
    private readonly taskConfigs;
    constructor(token: string, taskConfigs: ApifyTaskConfig[]);
    fetchJobs(query: JobQuery): Promise<AggregatorResult>;
    private runTask;
    private transformJob;
    private matchesQuery;
}
export {};
//# sourceMappingURL=apify.d.ts.map