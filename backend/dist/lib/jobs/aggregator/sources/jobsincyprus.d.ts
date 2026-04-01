import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatorResult } from "../types.js";
export declare class RemotiveSource extends BaseJobSource {
    constructor();
    fetchJobs(query: JobQuery): Promise<AggregatorResult>;
    private transformJob;
    private parseSalary;
    private mapJobType;
}
//# sourceMappingURL=jobsincyprus.d.ts.map