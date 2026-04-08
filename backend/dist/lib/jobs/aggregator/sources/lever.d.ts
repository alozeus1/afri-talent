import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatorResult } from "../types.js";
export declare class LeverSource extends BaseJobSource {
    private readonly siteTokens;
    constructor(siteTokens: string[]);
    fetchJobs(query: JobQuery): Promise<AggregatorResult>;
    private matchesQuery;
    private transformJob;
}
//# sourceMappingURL=lever.d.ts.map