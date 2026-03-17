import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatorResult, JobSourceConfig } from "../types.js";
export declare class WeWorkRemotelySource extends BaseJobSource {
    constructor();
    fetchJobs(query: JobQuery): Promise<AggregatorResult>;
    private fetchCategory;
    private filterJobs;
    private transformItem;
    private stripHtml;
}
export declare const weWorkRemotelyConfig: JobSourceConfig;
//# sourceMappingURL=weworkremotely.d.ts.map