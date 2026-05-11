import crypto from "node:crypto";
import jwt from "jsonwebtoken";

// §2.2 — server-side OAuth state + PKCE.
//
// The browser never holds the state secret. Backend issues a signed JWT
// carrying the state value (and PKCE verifier for Google), stores it in an
// HttpOnly cookie scoped to /api/auth/oauth, and verifies on callback.
// Same JWT secret reused — already strict (§2.1) and equally well protected.

// JWT_SECRET is shared with jwt.ts (where it is also strict-required at module
// load once PR A lands). Duplicate the check here so this module fails clearly
// if it is imported in a misconfigured environment.
const RAW_JWT_SECRET = process.env.JWT_SECRET;
if (!RAW_JWT_SECRET) {
  throw new Error("oauth-state: JWT_SECRET is required (used to sign OAuth state cookies).");
}
const STATE_SECRET: string = RAW_JWT_SECRET;
const STATE_TTL_SECONDS = 10 * 60; // 10 minutes — generous for Google interstitials
const STATE_ISSUER = "afritalent-oauth-state";

export const OAUTH_STATE_COOKIE = "oauth_state";

type Provider = "google" | "github";

interface StatePayload {
  state: string;
  provider: Provider;
  codeVerifier?: string;
}

export interface GeneratedState {
  state: string;
  codeVerifier?: string;
  codeChallenge?: string;
  cookieValue: string;
}

export function generateOAuthState(provider: Provider): GeneratedState {
  const state = crypto.randomBytes(32).toString("base64url");
  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;

  if (provider === "google") {
    // RFC 7636: code_verifier 43–128 chars; 48 random bytes → 64 base64url chars.
    codeVerifier = crypto.randomBytes(48).toString("base64url");
    codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  }

  const payload: StatePayload = { state, provider, codeVerifier };
  const cookieValue = jwt.sign(payload, STATE_SECRET, {
    expiresIn: STATE_TTL_SECONDS,
    issuer: STATE_ISSUER,
    audience: STATE_ISSUER,
  });

  return { state, codeVerifier, codeChallenge, cookieValue };
}

export type VerifyResult =
  | { ok: true; codeVerifier?: string }
  | { ok: false; reason: VerifyFailure };

export type VerifyFailure =
  | "missing_state_cookie"
  | "missing_state_param"
  | "invalid_state_signature"
  | "state_provider_mismatch"
  | "state_mismatch";

export function verifyOAuthState(
  cookieValue: string | undefined,
  receivedState: string | undefined,
  expectedProvider: Provider,
): VerifyResult {
  if (!cookieValue) return { ok: false, reason: "missing_state_cookie" };
  if (!receivedState) return { ok: false, reason: "missing_state_param" };

  let payload: StatePayload;
  try {
    payload = jwt.verify(cookieValue, STATE_SECRET, {
      issuer: STATE_ISSUER,
      audience: STATE_ISSUER,
    }) as unknown as StatePayload;
  } catch {
    return { ok: false, reason: "invalid_state_signature" };
  }

  if (payload.provider !== expectedProvider) {
    return { ok: false, reason: "state_provider_mismatch" };
  }

  const a = Buffer.from(payload.state);
  const b = Buffer.from(receivedState);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "state_mismatch" };
  }

  return { ok: true, codeVerifier: payload.codeVerifier };
}

export function buildOAuthStateCookie(value: string): string {
  // Path scopes the cookie to the OAuth routes only. SameSite=Lax allows the
  // cookie to ride the cross-site GET redirect back from Google/GitHub but
  // blocks third-party POSTs. Secure in production only.
  const parts = [
    `${OAUTH_STATE_COOKIE}=${value}`,
    "Path=/api/auth/oauth",
    "HttpOnly",
    `Max-Age=${STATE_TTL_SECONDS}`,
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function buildClearOAuthStateCookie(): string {
  const parts = [
    `${OAUTH_STATE_COOKIE}=`,
    "Path=/api/auth/oauth",
    "HttpOnly",
    "Max-Age=0",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function readOAuthStateCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${OAUTH_STATE_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}
