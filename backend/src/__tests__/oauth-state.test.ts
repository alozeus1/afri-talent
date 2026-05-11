/**
 * OAuth state + PKCE tests (§2.2).
 *
 * Covers the server-side state-cookie lifecycle without hitting Google or
 * GitHub APIs. Happy-path token exchange is covered indirectly elsewhere; the
 * intent here is to prove the state gate rejects: missing cookie, missing
 * state param, signature tampering, provider mismatch, value mismatch, and
 * cross-flow replay.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    oAuthAccount: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../lib/ai/persistence.js", () => ({
  createAiRun: vi.fn().mockResolvedValue(undefined),
  completeAiRun: vi.fn().mockResolvedValue(undefined),
  getRunHistory: vi.fn().mockResolvedValue([]),
}));

import request from "supertest";
import app from "../app.js";
import {
  generateOAuthState,
  OAUTH_STATE_COOKIE,
} from "../lib/oauth-state.js";

const ORIGINAL_GOOGLE_ID = process.env.GOOGLE_CLIENT_ID;
const ORIGINAL_GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const ORIGINAL_GITHUB_ID = process.env.GITHUB_CLIENT_ID;

function setupGoogle(): void {
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
}

function restoreEnv(): void {
  process.env.GOOGLE_CLIENT_ID = ORIGINAL_GOOGLE_ID;
  process.env.GOOGLE_CLIENT_SECRET = ORIGINAL_GOOGLE_SECRET;
  process.env.GITHUB_CLIENT_ID = ORIGINAL_GITHUB_ID;
}

describe("OAuth start endpoints (§2.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /google/start → 200 with authorizeUrl + state cookie + PKCE challenge", async () => {
    setupGoogle();
    try {
      const res = await request(app).get("/api/auth/oauth/google/start");
      expect(res.status).toBe(200);
      expect(res.body.authorizeUrl).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
      expect(res.body.authorizeUrl).toContain("code_challenge=");
      expect(res.body.authorizeUrl).toContain("code_challenge_method=S256");
      expect(res.body.authorizeUrl).toContain("state=");
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeDefined();
      const cookieStr = Array.isArray(setCookie) ? setCookie.join("\n") : String(setCookie);
      expect(cookieStr).toContain(`${OAUTH_STATE_COOKIE}=`);
      expect(cookieStr).toContain("HttpOnly");
      expect(cookieStr).toContain("Path=/api/auth/oauth");
      expect(cookieStr).toContain("SameSite=Lax");
    } finally {
      restoreEnv();
    }
  });

  it("GET /google/start without GOOGLE_CLIENT_ID → 503 OAUTH_MISSING_CONFIG", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    try {
      const res = await request(app).get("/api/auth/oauth/google/start");
      expect(res.status).toBe(503);
      expect(res.body.code).toBe("OAUTH_MISSING_CONFIG");
    } finally {
      restoreEnv();
    }
  });

  it("GET /github/start → 200 with authorizeUrl + state cookie (no PKCE)", async () => {
    process.env.GITHUB_CLIENT_ID = "github-client-id";
    try {
      const res = await request(app).get("/api/auth/oauth/github/start");
      expect(res.status).toBe(200);
      expect(res.body.authorizeUrl).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
      expect(res.body.authorizeUrl).not.toContain("code_challenge");
      expect(res.body.authorizeUrl).toContain("state=");
      const setCookie = res.headers["set-cookie"];
      const cookieStr = Array.isArray(setCookie) ? setCookie.join("\n") : String(setCookie);
      expect(cookieStr).toContain(`${OAUTH_STATE_COOKIE}=`);
    } finally {
      restoreEnv();
    }
  });
});

describe("OAuth callback state gate (§2.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupGoogle();
  });

  it("POST /google/callback without state field → 400 (schema)", async () => {
    const res = await request(app)
      .post("/api/auth/oauth/google/callback")
      .send({ code: "some-code" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid request/i);
    restoreEnv();
  });

  it("POST /google/callback with state but no cookie → 400 missing_state_cookie", async () => {
    const res = await request(app)
      .post("/api/auth/oauth/google/callback")
      .send({ code: "some-code", state: "anything" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OAUTH_STATE_INVALID");
    expect(res.body.reason).toBe("missing_state_cookie");
    restoreEnv();
  });

  it("POST /google/callback with cookie but mismatched state → 400 state_mismatch", async () => {
    const { cookieValue } = generateOAuthState("google");
    const res = await request(app)
      .post("/api/auth/oauth/google/callback")
      .set("Cookie", `${OAUTH_STATE_COOKIE}=${cookieValue}`)
      .send({ code: "some-code", state: "totally-different-state-of-correct-length-padding" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OAUTH_STATE_INVALID");
    expect(res.body.reason).toBe("state_mismatch");
    restoreEnv();
  });

  it("POST /google/callback with a GitHub-issued state cookie → 400 state_provider_mismatch", async () => {
    const { state, cookieValue } = generateOAuthState("github");
    const res = await request(app)
      .post("/api/auth/oauth/google/callback")
      .set("Cookie", `${OAUTH_STATE_COOKIE}=${cookieValue}`)
      .send({ code: "some-code", state });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OAUTH_STATE_INVALID");
    expect(res.body.reason).toBe("state_provider_mismatch");
    restoreEnv();
  });

  it("POST /google/callback with tampered cookie signature → 400 invalid_state_signature", async () => {
    const { state, cookieValue } = generateOAuthState("google");
    // Flip the final character of the JWT signature segment.
    const tampered = cookieValue.replace(/.$/, (c) => (c === "a" ? "b" : "a"));
    const res = await request(app)
      .post("/api/auth/oauth/google/callback")
      .set("Cookie", `${OAUTH_STATE_COOKIE}=${tampered}`)
      .send({ code: "some-code", state });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OAUTH_STATE_INVALID");
    expect(res.body.reason).toBe("invalid_state_signature");
    restoreEnv();
  });

  it("POST /github/callback with no cookie → 400 missing_state_cookie", async () => {
    const res = await request(app)
      .post("/api/auth/oauth/github/callback")
      .send({ code: "some-code", state: "anything" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OAUTH_STATE_INVALID");
    expect(res.body.reason).toBe("missing_state_cookie");
  });
});
