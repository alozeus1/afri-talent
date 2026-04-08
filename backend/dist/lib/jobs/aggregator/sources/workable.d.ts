import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatorResult } from "../types.js";
interface WorkableAccountConfig {
    account: string;
    token?: string;
}
export declare class WorkableSource extends BaseJobSource {
    private readonly accounts;
    constructor(accounts: WorkableAccountConfig[]);
    fetchJobs(query: JobQuery): Promise<AggregatorResult>;
    private matchesQuery;
    private transformJob;
}
export {};
//# sourceMappingURL=workable.d.ts.map