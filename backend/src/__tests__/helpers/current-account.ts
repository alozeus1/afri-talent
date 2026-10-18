/**
 * Test helper: model the authoritative account behind every token a test mints.
 *
 * `authenticate`/`optionalAuth` rehydrate the account from the database on
 * every request (see lib/account-access.ts `loadCurrentAccount`). Route tests
 * that are not about authentication would otherwise have to teach their
 * `prisma.user.findUnique` mock to answer that lookup, which collides with
 * their own `mockResolvedValueOnce` queues. Instead, mint tokens through the
 * wrapped `signToken` and the mocked `loadCurrentAccount` returns an ACTIVE
 * account with the same id/email/role. Tokens never minted by the test resolve
 * to "no account" (401), exactly like a deleted user.
 *
 * Usage (both mocks are required, inside the test file):
 *
 *   vi.mock("../lib/jwt.js", async (importOriginal) =>
 *     (await import("./helpers/current-account.js")).mockJwtModule(importOriginal));
 *   vi.mock("../lib/account-access.js", async (importOriginal) =>
 *     (await import("./helpers/current-account.js")).mockAccountAccessModule(importOriginal));
 *
 * Suites that exercise the account gate itself (auth-middleware,
 * admin-console) must not use this helper.
 */
import type { Role } from "@prisma/client";

type Minted = { email: string; role: Role };

const minted = new Map<string, Minted>();

export async function mockJwtModule(importOriginal: () => Promise<unknown>) {
  const actual = (await importOriginal()) as typeof import("../../lib/jwt.js");
  return {
    ...actual,
    signToken: (payload: Parameters<typeof actual.signToken>[0]) => {
      minted.set(payload.userId, { email: payload.email, role: payload.role });
      return actual.signToken(payload);
    },
  };
}

export async function mockAccountAccessModule(importOriginal: () => Promise<unknown>) {
  const actual = (await importOriginal()) as typeof import("../../lib/account-access.js");
  return {
    ...actual,
    loadCurrentAccount: async (userId: string) => {
      const account = minted.get(userId);
      if (!account) return null;
      return {
        id: userId,
        email: account.email,
        role: account.role,
        deletedAt: null,
        accountRestrictionStatus: "ACTIVE" as const,
        accountRestrictionReason: null,
        accountRestrictedUntil: null,
        sessionsRevokedAt: null,
      };
    },
  };
}
