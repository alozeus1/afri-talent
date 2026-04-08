import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatorResult } from "../types.js";
export declare class GreenhouseSource extends BaseJobSource {
    private readonly boardTokens;
    constructor(boardTokens: string[]);
    fetchJobs(query: JobQuery): Promise<AggregatorResult>;
    private matchesQuery;
    private transformJob;
}
//# sourceMappingURL=greenhouse.d.ts.map