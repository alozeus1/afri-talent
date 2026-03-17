import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatorResult, JobSourceConfig } from "../types.js";
export declare class JobbermanSource extends BaseJobSource {
    constructor();
    fetchJobs(query: JobQuery): Promise<AggregatorResult>;
    private fetchCountry;
    private parseJobListings;
    private parseJobCard;
    private parseSalary;
}
export declare const jobbermanConfig: JobSourceConfig;
//# sourceMappingURL=jobberman.d.ts.map