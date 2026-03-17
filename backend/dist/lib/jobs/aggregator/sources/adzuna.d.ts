import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatorResult, JobSourceConfig } from "../types.js";
export declare class AdzunaSource extends BaseJobSource {
    private appId;
    private apiKey;
    constructor(appId: string, apiKey: string);
    fetchJobs(query: JobQuery): Promise<AggregatorResult>;
    private fetchCountry;
    private isAfricaFriendly;
    private transformJob;
    private mapContractType;
}
export declare const adzunaConfig: JobSourceConfig;
//# sourceMappingURL=adzuna.d.ts.map