import { JobStatus } from "@prisma/client";
import logger from "../lib/logger.js";
import { recordOpsEvent } from "../lib/ops/events.js";
import prisma from "../lib/prisma.js";
import { getSemanticConfig } from "../lib/rag/embedding.js";
import { indexOpenCandidates, indexPublishedJobs } from "../lib/rag/store.js";
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_BATCHES = 10;
function clampPositiveInt(raw, fallback, max) {
    const parsed = Number.parseInt(raw || "", 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return fallback;
    }
    return Math.min(max, Math.max(1, Math.round(parsed)));
}
export function resolveSemanticIndexWorkerConfig(env = process.env) {
    return {
        enabled: env.SEMANTIC_INDEX_ENABLED !== "0",
        batchSize: clampPositiveInt(env.SEMANTIC_INDEX_BATCH_SIZE, DEFAULT_BATCH_SIZE, 500),
        maxBatches: clampPositiveInt(env.SEMANTIC_INDEX_MAX_BATCHES, DEFAULT_MAX_BATCHES, 100),
    };
}
export async function runSemanticIndexWorker() {
    const config = resolveSemanticIndexWorkerConfig();
    const semantic = getSemanticConfig();
    if (!config.enabled || !semantic.enabled) {
        logger.info({
            semanticIndexEnabled: config.enabled,
            embeddingEnabled: semantic.enabled,
            provider: semantic.provider,
        }, "[semantic-indexer] skipped");
        return;
    }
    const totalPublishedJobs = await prisma.job.count({
        where: {
            status: JobStatus.PUBLISHED,
            isExpired: false,
        },
    });
    const totalOpenCandidates = await prisma.candidateProfile.count({
        where: {
            openToWork: true,
            user: {
                accountRestrictionStatus: {
                    not: "SUSPENDED",
                },
            },
        },
    });
    let scanned = 0;
    let indexed = 0;
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let candidateScanned = 0;
    let candidateIndexed = 0;
    let candidateCreated = 0;
    let candidateUpdated = 0;
    let candidateUnchanged = 0;
    let batches = 0;
    for (let batchIndex = 0; batchIndex < config.maxBatches; batchIndex += 1) {
        const offset = batchIndex * config.batchSize;
        const result = await indexPublishedJobs(config.batchSize, offset);
        const candidateResult = await indexOpenCandidates(config.batchSize, offset);
        batches += 1;
        scanned += result.scanned;
        indexed += result.indexed;
        created += result.created;
        updated += result.updated;
        unchanged += result.unchanged;
        candidateScanned += candidateResult.scanned;
        candidateIndexed += candidateResult.indexed;
        candidateCreated += candidateResult.created;
        candidateUpdated += candidateResult.updated;
        candidateUnchanged += candidateResult.unchanged;
        if (result.scanned < config.batchSize && candidateResult.scanned < config.batchSize) {
            break;
        }
    }
    const fullyCovered = scanned >= totalPublishedJobs && candidateScanned >= totalOpenCandidates;
    recordOpsEvent({
        metricName: fullyCovered ? "semantic_index_cycle_success" : "semantic_index_cycle_partial",
        category: "semantic",
        outcome: fullyCovered ? "success" : "degraded",
        severity: fullyCovered ? "info" : "warning",
        details: {
            provider: semantic.provider,
            model: semantic.model,
            dimensions: semantic.dimensions,
            total_published_jobs: totalPublishedJobs,
            total_open_candidates: totalOpenCandidates,
            scanned,
            indexed,
            created,
            updated,
            unchanged,
            candidate_scanned: candidateScanned,
            candidate_indexed: candidateIndexed,
            candidate_created: candidateCreated,
            candidate_updated: candidateUpdated,
            candidate_unchanged: candidateUnchanged,
            batches,
            batch_size: config.batchSize,
            max_batches: config.maxBatches,
        },
    });
    logger.info({
        provider: semantic.provider,
        model: semantic.model,
        dimensions: semantic.dimensions,
        totalPublishedJobs,
        totalOpenCandidates,
        scanned,
        indexed,
        created,
        updated,
        unchanged,
        candidateScanned,
        candidateIndexed,
        candidateCreated,
        candidateUpdated,
        candidateUnchanged,
        batches,
        batchSize: config.batchSize,
        maxBatches: config.maxBatches,
        fullyCovered,
    }, "[semantic-indexer] cycle complete");
}
//# sourceMappingURL=semantic-indexer.js.map