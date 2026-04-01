import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatorResult } from "../types.js";
export declare class HimalayasSource extends BaseJobSource {
    constructor();
    fetchJobs(query: JobQuery): Promise<AggregatorResult>;
    private transformJob;
    private mapSeniority;
}
//# sourceMappingURL=himalayas.d.ts.map