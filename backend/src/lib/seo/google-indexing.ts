// §4.4 — Google Indexing API integration.
//
// One-shot helper that pings Google when a job page transitions to EXPIRED.
// Google de-indexes the page faster than waiting for the next crawl, which
// matters for JobPosting structured data — Search shows expired listings
// until Google sees the page either return 410 or get an explicit
// URL_DELETED notification.
//
// Auth: JWT-signed service account (GOOGLE_INDEXING_KEY_JSON env var holds
// the full service-account JSON). No-op + warning log when missing so dev
// + test envs don't break.
//
// Reference: https://developers.google.com/search/apis/indexing-api/v3/using-api

import crypto from "node:crypto";
import logger from "../logger.js";

const INDEXING_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPES = "https://www.googleapis.com/auth/indexing";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  // Other fields ignored.
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function loadServiceAccountKey(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_INDEXING_KEY_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccountKey;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[google-indexing] GOOGLE_INDEXING_KEY_JSON is not valid JSON");
    return null;
  }
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signJwt(key: ServiceAccountKey): string {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: key.client_email,
    scope: SCOPES,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };
  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const claimsB64 = base64UrlEncode(Buffer.from(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  const signature = base64UrlEncode(signer.sign(key.private_key));
  return `${signingInput}.${signature}`;
}

async function fetchAccessToken(key: ServiceAccountKey): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  try {
    const assertion = signJwt(key);
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      logger.warn({ status: response.status, body }, "[google-indexing] token endpoint rejected the JWT");
      return null;
    }
    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) return null;
    cachedToken = {
      value: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    };
    return payload.access_token;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[google-indexing] failed to mint access token");
    return null;
  }
}

export type IndexingUrlType = "URL_UPDATED" | "URL_DELETED";

// Fire-and-forget ping. Returns true if Google accepted the notification,
// false otherwise (including the no-credentials no-op path). Never throws —
// stale-check should not fail because Google is down.
export async function notifyGoogleIndexing(url: string, type: IndexingUrlType): Promise<boolean> {
  const key = loadServiceAccountKey();
  if (!key) {
    logger.debug({ url, type }, "[google-indexing] GOOGLE_INDEXING_KEY_JSON not set; skipping");
    return false;
  }

  const token = await fetchAccessToken(key);
  if (!token) return false;

  try {
    const response = await fetch(INDEXING_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, type }),
    });
    if (!response.ok) {
      const body = await response.text();
      logger.warn({ url, type, status: response.status, body }, "[google-indexing] notification rejected");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ url, err: (err as Error).message }, "[google-indexing] notification failed");
    return false;
  }
}

// Test seam. Resets the in-memory token cache so test runs don't carry
// state between scenarios.
export function _resetGoogleIndexingTokenCache(): void {
  cachedToken = null;
}
