import { AccountRestrictionStatus, Role } from "@prisma/client";
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
// A soft-deleted (anonymized) account is always rejected: a JWT issued before
// the anonymization must not keep working on authenticate/optionalAuth/OAuth.

export type AccountAccessCode =
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_BANNED"
  | "SESSION_REVOKED"
  | "ACCOUNT_DELETED";

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

  if (record.deletedAt) {
    return {
      allowed: false,
      status: 401,
      code: "ACCOUNT_DELETED",
      error: "This account has been closed.",
    };
  }

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

// ── Per-request current-account lookup ──────────────────────────────────────
//
// Deliberately uncached: JWT claims are a session snapshot, so `authenticate`
// rehydrates role/email and re-evaluates access on every request. A role
// downgrade, deletion, suspension, ban or session revocation therefore takes
// effect on the very next request on every API task. Lookup errors propagate
// so the middleware fails closed.

const CURRENT_ACCOUNT_SELECT = {
  id: true,
  email: true,
  role: true,
  deletedAt: true,
  accountRestrictionStatus: true,
  accountRestrictionReason: true,
  accountRestrictedUntil: true,
  sessionsRevokedAt: true,
} as const;

export interface CurrentAccount extends AccountAccessRecord {
  id: string;
  email: string;
  role: Role;
}

export async function loadCurrentAccount(userId: string): Promise<CurrentAccount | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: CURRENT_ACCOUNT_SELECT,
  });
  return (user as CurrentAccount | null | undefined) ?? null;
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
      .catch(onError);
  } catch (error) {
    onError(error);
  }
}
