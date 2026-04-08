import { redisClient } from "../redis.js";
import logger from "../logger.js";
import { recordOpsEvent } from "./events.js";
const DEAD_LETTER_PREFIX = "ops:dead-letter:";
const WORKER_STATE_PREFIX = "ops:worker-state:";
const DEAD_LETTER_RETENTION_SECONDS = 14 * 24 * 60 * 60;
const WORKER_STATE_RETENTION_SECONDS = 14 * 24 * 60 * 60;
const MAX_DEAD_LETTERS_PER_SOURCE = 100;
function serializeError(error) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }
    return {
        message: typeof error === "string" ? error : JSON.stringify(error),
    };
}
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
export async function withRetry(operation, options) {
    const attempts = Math.max(1, options.attempts ?? 3);
    const factor = options.factor ?? 2;
    const maxDelayMs = options.maxDelayMs ?? 5_000;
    let delayMs = Math.max(100, options.initialDelayMs ?? 500);
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation();
        }
        catch (error) {
            const shouldRetry = attempt < attempts && (options.shouldRetry ? options.shouldRetry(error, attempt) : true);
            if (!shouldRetry) {
                throw error;
            }
            recordOpsEvent({
                metricName: `${options.operationName}_retry`,
                category: "retries",
                outcome: "retrying",
                severity: "warning",
                details: {
                    attempt,
                    next_delay_ms: delayMs,
                },
            });
            await sleep(delayMs);
            delayMs = Math.min(Math.round(delayMs * factor), maxDelayMs);
        }
    }
    throw new Error(`[ops] retry loop exhausted for ${options.operationName}`);
}
export async function pushDeadLetter(input) {
    const serializedError = serializeError(input.error);
    const entry = {
        category: input.category,
        source: input.source,
        reasonCode: input.reasonCode,
        retryable: input.retryable ?? true,
        error: serializedError,
        payload: input.payload,
        createdAt: new Date().toISOString(),
    };
    if (redisClient) {
        try {
            const key = `${DEAD_LETTER_PREFIX}${input.source}`;
            await redisClient.lpush(key, JSON.stringify(entry));
            await redisClient.ltrim(key, 0, MAX_DEAD_LETTERS_PER_SOURCE - 1);
            await redisClient.expire(key, DEAD_LETTER_RETENTION_SECONDS);
        }
        catch (redisError) {
            logger.warn({ redisError, source: input.source }, "[ops] failed to persist dead letter in Redis");
        }
    }
    logger.error({
        event_type: "ops_dead_letter",
        source: input.source,
        category: input.category,
        reason_code: input.reasonCode,
        retryable: input.retryable ?? true,
        payload: input.payload,
        error: serializedError,
    }, `[ops] dead letter recorded for ${input.source}`);
}
export async function listDeadLetters(limitPerSource = 20) {
    if (!redisClient) {
        return [];
    }
    const client = redisClient;
    try {
        const keys = (await client.keys(`${DEAD_LETTER_PREFIX}*`)).sort();
        const records = await Promise.all(keys.map(async (key) => {
            const entries = await client.lrange(key, 0, limitPerSource - 1);
            return entries.map((entry) => {
                const parsed = JSON.parse(entry);
                return {
                    source: key.replace(DEAD_LETTER_PREFIX, ""),
                    ...parsed,
                };
            });
        }));
        return records.flat();
    }
    catch (error) {
        logger.warn({ error }, "[ops] failed to list dead letters");
        return [];
    }
}
export async function summarizeDeadLetters() {
    if (!redisClient) {
        return {};
    }
    const client = redisClient;
    try {
        const keys = await client.keys(`${DEAD_LETTER_PREFIX}*`);
        const counts = await Promise.all(keys.map(async (key) => {
            const count = await client.llen(key);
            return [key.replace(DEAD_LETTER_PREFIX, ""), count];
        }));
        return Object.fromEntries(counts);
    }
    catch (error) {
        logger.warn({ error }, "[ops] failed to summarize dead letters");
        return {};
    }
}
export async function recordWorkerState(workerName, input) {
    if (!redisClient) {
        return;
    }
    try {
        await redisClient.set(`${WORKER_STATE_PREFIX}${workerName}`, JSON.stringify({
            workerName,
            ...input,
        }), "EX", WORKER_STATE_RETENTION_SECONDS);
    }
    catch (error) {
        logger.warn({ error, workerName }, "[ops] failed to record worker state");
    }
}
export async function getWorkerStates() {
    if (!redisClient) {
        return [];
    }
    const client = redisClient;
    try {
        const keys = (await client.keys(`${WORKER_STATE_PREFIX}*`)).sort();
        const records = await Promise.all(keys.map(async (key) => {
            const raw = await client.get(key);
            return raw ? JSON.parse(raw) : null;
        }));
        return records.filter((record) => Boolean(record));
    }
    catch (error) {
        logger.warn({ error }, "[ops] failed to list worker states");
        return [];
    }
}
//# sourceMappingURL=resilience.js.map