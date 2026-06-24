// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — idempotency ledger
//
// Generic once-only guard for external side effects (SES sends, ATS submissions,
// notifications, moderation actions, job/blog publication). Backed by the
// IdempotencyKey table (unique [scope, key]).
//
// Semantics:
//   - First call reserves the key, runs fn, records COMPLETED with a result ref.
//   - A duplicate call whose key is COMPLETED returns the cached ref WITHOUT
//     re-running fn (prevents double side effects).
//   - A concurrent RESERVED key throws IdempotencyInProgressError (caller skips).
//   - A FAILED key is retryable.
//   - Stale RESERVED keys (older than staleMs) can be taken over (crash recovery).
//   - If the ledger itself is unavailable (infra error, not a duplicate), we FAIL
//     OPEN and run fn — matching the codebase's fail-open philosophy so a ledger
//     outage never blocks a legitimate action. Dedup is best-effort then.
//
// The storage is behind a small Ledger seam so the logic is unit-testable without
// a database (see _setIdempotencyLedger).
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import prisma from "../../../prisma.js";
import logger from "../../../logger.js";

export class IdempotencyInProgressError extends Error {
  constructor(scope: string, key: string) {
    super(`Side effect ${scope}:${key} is already in progress`);
    this.name = "IdempotencyInProgressError";
  }
}

/** Thrown by Ledger.create when a row already exists for (scope, key). */
export class LedgerDuplicateError extends Error {
  constructor() {
    super("idempotency key already exists");
    this.name = "LedgerDuplicateError";
  }
}

export interface LedgerRow {
  status: string;
  resultRef: string | null;
  createdAt: Date;
}

export interface IdempotencyLedger {
  create(scope: string, key: string, expiresAt: Date): Promise<void>;
  find(scope: string, key: string): Promise<LedgerRow | null>;
  update(scope: string, key: string, data: { status: string; resultRef?: string }): Promise<void>;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

const prismaLedger: IdempotencyLedger = {
  async create(scope, key, expiresAt) {
    try {
      await prisma.idempotencyKey.create({ data: { scope, key, status: "RESERVED", expiresAt } });
    } catch (err) {
      if (isUniqueViolation(err)) throw new LedgerDuplicateError();
      throw err;
    }
  },
  async find(scope, key) {
    const r = await prisma.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
    return r ? { status: r.status, resultRef: r.resultRef, createdAt: r.createdAt } : null;
  },
  async update(scope, key, data) {
    await prisma.idempotencyKey.update({ where: { scope_key: { scope, key } }, data });
  },
};

let ledger: IdempotencyLedger = prismaLedger;
/** For tests: swap the storage backend. */
export function _setIdempotencyLedger(l: IdempotencyLedger): void {
  ledger = l;
}
export function _resetIdempotencyLedger(): void {
  ledger = prismaLedger;
}

export interface RunOnceResult {
  ref: string;
  /** true when a prior COMPLETED record was reused (fn was NOT executed). */
  deduped: boolean;
}

export interface RunOnceOptions {
  /** Reservation TTL (also used to consider a RESERVED row stale). Default 10m. */
  staleMs?: number;
}

const DEFAULT_STALE_MS = 10 * 60_000;

async function safeUpdate(scope: string, key: string, data: { status: string; resultRef?: string }): Promise<void> {
  try {
    await ledger.update(scope, key, data);
  } catch (err) {
    logger.warn({ err: String(err), scope, key }, "[idempotency] status update failed (non-fatal)");
  }
}

/**
 * Run `fn` at most once for a given (scope, key). Returns the side effect's
 * result ref (e.g. an SES MessageId) — fresh or cached.
 */
export async function runOnce(
  scope: string,
  key: string,
  fn: () => Promise<string>,
  opts: RunOnceOptions = {},
): Promise<RunOnceResult> {
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;

  try {
    await ledger.create(scope, key, new Date(Date.now() + staleMs));
  } catch (err) {
    if (err instanceof LedgerDuplicateError) {
      const existing = await ledger.find(scope, key);
      if (existing?.status === "COMPLETED" && existing.resultRef) {
        return { ref: existing.resultRef, deduped: true };
      }
      const isStale =
        existing != null &&
        existing.status === "RESERVED" &&
        Date.now() - new Date(existing.createdAt).getTime() > staleMs;
      if (existing?.status === "RESERVED" && !isStale) {
        throw new IdempotencyInProgressError(scope, key);
      }
      // FAILED, or a stale RESERVED we are taking over → reset and run.
      await safeUpdate(scope, key, { status: "RESERVED" });
    } else {
      // Ledger infra error → fail open (preserve availability; dedup best-effort).
      logger.warn({ err: String(err), scope, key }, "[idempotency] ledger unavailable — failing open");
      const ref = await fn();
      return { ref, deduped: false };
    }
  }

  try {
    const ref = await fn();
    await safeUpdate(scope, key, { status: "COMPLETED", resultRef: ref });
    return { ref, deduped: false };
  } catch (err) {
    await safeUpdate(scope, key, { status: "FAILED" });
    throw err;
  }
}
