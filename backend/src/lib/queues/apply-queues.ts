// §5.8 — BullMQ queues for the apply pathway.
//
// Four queues:
//   apply-batch-queue     — autopilot fan-out (one task per (batchId, jobId))
//   apply-email-queue     — Track B (EMAIL_DRAFT) sender; consumed by PR Q
//   apply-ats-queue       — Track A (ATS_API_*) adapters;  consumed by PR S
//   apply-operator-queue  — Track C (OPERATOR_HANDOFF);    consumed by PR T
//
// Feature-gated by APPLY_QUEUES_ENABLED. When unset / Redis URL missing, the
// `getApplyQueue(name)` helpers return null and callers fall through to the
// existing inline path. That keeps dev + CI green without Redis.

import { Queue } from "bullmq";
import { Redis } from "ioredis";
import logger from "../logger.js";

export type ApplyQueueName =
  | "apply-batch-queue"
  | "apply-email-queue"
  | "apply-ats-queue"
  | "apply-operator-queue";

export const APPLY_QUEUE_NAMES: ReadonlyArray<ApplyQueueName> = [
  "apply-batch-queue",
  "apply-email-queue",
  "apply-ats-queue",
  "apply-operator-queue",
];

const REDIS_URL = process.env.APPLY_QUEUES_REDIS_URL || process.env.REDIS_URL;
const ENABLED = (process.env.APPLY_QUEUES_ENABLED === "1" || process.env.APPLY_QUEUES_ENABLED === "true") && Boolean(REDIS_URL);

// Shared connection. BullMQ requires { maxRetriesPerRequest: null } on the
// Redis client so blocking commands (BRPOPLPUSH) don't error.
let sharedConnection: Redis | null = null;
const queues = new Map<ApplyQueueName, Queue>();

function getConnection(): Redis | null {
  if (!ENABLED || !REDIS_URL) return null;
  if (sharedConnection) return sharedConnection;
  try {
    sharedConnection = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    sharedConnection.on("error", (err: Error) => {
      logger.warn({ err: err.message }, "[apply-queues] Redis connection error");
    });
    return sharedConnection;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[apply-queues] failed to create Redis connection");
    return null;
  }
}

export function isApplyQueuesEnabled(): boolean {
  return ENABLED && Boolean(REDIS_URL);
}

export function getApplyQueue(name: ApplyQueueName): Queue | null {
  const connection = getConnection();
  if (!connection) return null;
  const existing = queues.get(name);
  if (existing) return existing;
  const q = new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail:     { age: 7 * 24 * 3600 },
    },
  });
  queues.set(name, q);
  return q;
}

// Used in tests / shutdown to release the BullMQ + Redis handles.
export async function closeApplyQueues(): Promise<void> {
  for (const q of queues.values()) {
    await q.close().catch(() => undefined);
  }
  queues.clear();
  if (sharedConnection) {
    await sharedConnection.quit().catch(() => undefined);
    sharedConnection = null;
  }
}

// Strongly-typed payloads each queue accepts.
export interface ApplyBatchJobData {
  batchId: string;
  candidateId: string;
  jobId: string;
  customMessage?: string;
}

// PR S — apply-ats-queue payload (strategy selects the vendor adapter).
export interface ApplyAtsJobData {
  applicationId: string;
  strategy: "ATS_API_GREENHOUSE" | "ATS_API_LEVER" | "ATS_API_WORKABLE";
}
