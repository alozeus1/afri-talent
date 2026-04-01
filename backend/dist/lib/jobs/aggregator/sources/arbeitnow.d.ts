import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatorResult } from "../types.js";
export declare class ArbeitnowSource extends BaseJobSource {
    constructor();
    fetchJobs(query: JobQuery): Promise<AggregatorResult>;
    private transformJob;
    private mapJobType;
}
//# sourceMappingURL=arbeitnow.d.ts.map