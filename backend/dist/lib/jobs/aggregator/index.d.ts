import { PrismaClient } from "@prisma/client";
import type { AggregatedJob, AggregatorResult, JobSource, JobRegion } from "./types.js";
import type { JobQuery } from "./sources/base.js";
export declare class JobAggregator {
    private sources;
    private prisma;
    constructor(prisma: PrismaClient);
    private initializeSources;
    aggregateJobs(query: JobQuery): Promise<AggregatorResult[]>;
    syncJobsToDatabase(query: JobQuery): Promise<{
        total: number;
        inserted: number;
        updated: number;
        skipped: number;
        byRegion: Record<JobRegion, number>;
        bySource: Record<JobSource, number>;
    }>;
    private deduplicateJobs;
    private jobCompleteness;
    private upsertJob;
    private generateSlug;
    private ensureUniqueSlug;
    filterAfricaFriendly(jobs: AggregatedJob[]): AggregatedJob[];
    getEnabledSources(): JobSource[];
}
export declare function getJobAggregator(prisma: PrismaClient): JobAggregator;
export type { AggregatedJob, AggregatorResult, JobSource, JobRegion, JobQuery };
//# sourceMappingURL=index.d.ts.map