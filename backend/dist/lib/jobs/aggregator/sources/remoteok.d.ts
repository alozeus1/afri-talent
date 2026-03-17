import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatorResult, JobSourceConfig } from "../types.js";
export declare class RemoteOKSource extends BaseJobSource {
    constructor(apiKey?: string);
    fetchJobs(query: JobQuery): Promise<AggregatorResult>;
    private filterJobs;
    private transformJob;
}
export declare const remoteOKConfig: JobSourceConfig;
//# sourceMappingURL=remoteok.d.ts.map