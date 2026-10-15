import { AccountRestrictionStatus } from "@prisma/client";
import prisma from "./prisma.js";
import logger from "./logger.js";

// Admin console — account access gate.
//
// One decision function shared by login, OAuth sign-in and the `authenticate`
// middleware so a suspended/banned account is blocked everywhere with the same
// message, and an admin "revoke sessions" invalidates every JWT issued before
// the revocation instant.
//
// LIMITED accounts keep access (sensitive actions are gated separately by
// requireAccountStanding); only SUSPENDED (unexpired) and BANNED are blocked.

export type AccountAccessCode = "ACCOUNT_SUSPENDED" | "ACCOUNT_BANNED" | "SESSION_REVOKED";

export interface AccountAccessRecord {
  accountRestrictionStatus: AccountRestrictionStatus;
  accountRestrictionReason: string | null;
  accountRestrictedUntil: Date | null;
  sessionsRevokedAt: Date | null;
  deletedAt?: Date | null;
}

export type AccountAccessDecision =
  | { allowed: true; suspensionExpired: boolean }
  | {
      allowed: false;
      status: 403 | 401;
      code: AccountAccessCode;
      error: string;
      until?: string | null;
    };

export function evaluateAccountAccess(
  record: AccountAccessRecord,
  opts: { tokenIssuedAtSeconds?: number; now?: Date } = {},
): AccountAccessDecision {
  const now = opts.now ?? new Date();

  if (record.accountRestrictionStatus === AccountRestrictionStatus.BANNED) {
    return {
      allowed: false,
      status: 403,
      code: "ACCOUNT_BANNED",
      error:
        "This account has been deactivated by AfriTalent. If you believe this is a mistake, contact support.",
    };
  }

  let suspensionExpired = false;
  if (record.accountRestrictionStatus === AccountRestrictionStatus.SUSPENDED) {
    const until = record.accountRestrictedUntil;
    if (until && until.getTime() <= now.getTime()) {
      suspensionExpired = true;
    } else {
      return {
        allowed: false,
        status: 403,
        code: "ACCOUNT_SUSPENDED",
        error: until
          ? `This account is suspended until ${until.toISOString().slice(0, 10)}. Contact support if you need help.`
          : "This account is suspended. Contact support if you need help.",
        until: until ? until.toISOString() : null,
      };
    }
  }

  if (
    opts.tokenIssuedAtSeconds !== undefined
    && record.sessionsRevokedAt
    && opts.tokenIssuedAtSeconds < Math.floor(record.sessionsRevokedAt.getTime() / 1000)
  ) {
    return {
      allowed: false,
      status: 401,
      code: "SESSION_REVOKED",
      error: "Your session has ended. Please sign in again.",
    };
  }

  return { allowed: true, suspensionExpired };
}

// ── Per-request lookup with a short in-process cache ─────────────────────────
//
// Authenticated requests would otherwise pay one extra PK lookup each. The
// cache TTL bounds how long a suspension takes to reach *other* API tasks;
// the task that performed the admin action invalidates its entry immediately.
// Disabled under NODE_ENV=test so mocked-prisma tests stay deterministic.

const CACHE_TTL_MS = Number(process.env.ACCOUNT_ACCESS_CACHE_TTL_MS ?? 15_000);
const CACHE_MAX_ENTRIES = 5_000;
const cache = new Map<string, { record: AccountAccessRecord | null; expiresAt: number }>();

function cacheEnabled(): boolean {
  return process.env.NODE_ENV !== "test" && CACHE_TTL_MS > 0;
}

export function invalidateAccountAccess(userId: string): void {
  cache.delete(userId);
}

export function __resetAccountAccessCache(): void {
  cache.clear();
}

const ACCESS_SELECT = {
  accountRestrictionStatus: true,
  accountRestrictionReason: true,
  accountRestrictedUntil: true,
  sessionsRevokedAt: true,
  deletedAt: true,
} as const;

/**
 * Loads the access record for a user. Returns `undefined` when the lookup
 * could not be performed (DB error) — callers fail open in that case, since
 * the downstream route needs the same database and will fail on its own.
 */
export async function loadAccountAccessRecord(
  userId: string,
): Promise<AccountAccessRecord | null | undefined> {
  if (cacheEnabled()) {
    const hit = cache.get(userId);
    if (hit && hit.expiresAt > Date.now()) return hit.record;
  }

  try {
    const record = (await prisma.user.findFirst({
      where: { id: userId },
      select: ACCESS_SELECT,
    })) as AccountAccessRecord | null | undefined;

    if (record === undefined) return undefined;

    if (cacheEnabled()) {
      if (cache.size >= CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(userId, { record, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return record;
  } catch (error) {
    logger.warn(
      { userId: userId.slice(0, 8), err: error instanceof Error ? error.message : "unknown" },
      "[account-access] lookup failed; failing open",
    );
    return undefined;
  }
}

/**
 * Clears an expired temporary suspension. Best-effort and fire-and-forget.
 */
export function clearExpiredSuspension(userId: string): void {
  const onError = (error: unknown) => {
    logger.warn(
      { userId: userId.slice(0, 8), err: error instanceof Error ? error.message : "unknown" },
      "[account-access] clearing expired suspension failed",
    );
  };
  try {
    void Promise.resolve(prisma.user.updateMany({
      where: {
        id: userId,
        accountRestrictionStatus: AccountRestrictionStatus.SUSPENDED,
        accountRestrictedUntil: { lte: new Date() },
      },
      data: {
        accountRestrictionStatus: AccountRestrictionStatus.ACTIVE,
        accountRestrictionReason: null,
        accountRestrictedAt: null,
        accountRestrictedUntil: null,
      },
    }))
      .then(() => invalidateAccountAccess(userId))
      .catch(onError);
  } catch (error) {
    onError(error);
  }
}
