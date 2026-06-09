import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Role } from "@prisma/client";
import { signToken } from "../lib/jwt.js";

vi.mock("../lib/ai/persistence.js", () => ({
  createAiRun: vi.fn().mockResolvedValue(undefined),
  completeAiRun: vi.fn().mockResolvedValue(undefined),
  getRunHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("../lib/prisma.js", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    employer: {
      create: vi.fn(),
    },
    oAuthAccount: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    emailVerificationToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    userBillingProfile: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([{}, {}]),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

import prisma from "../lib/prisma.js";
import app from "../app.js";

function makeCandidateToken(id = "candidate-1"): string {
  return signToken({
    userId: id,
    email: "candidate@example.com",
    role: Role.CANDIDATE,
  });
}

describe("OAuth + Email Verification API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists enabled OAuth providers", async () => {
    const previousGoogle = process.env.GOOGLE_CLIENT_ID;
    const previousGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;
    const previousGithub = process.env.GITHUB_CLIENT_ID;
    const previousGithubSecret = process.env.GITHUB_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.GITHUB_CLIENT_ID = "github-client-id";
    process.env.GITHUB_CLIENT_SECRET = "github-client-secret";

    const res = await request(app).get("/api/auth/oauth/providers");
    expect(res.status).toBe(200);
    expect(res.body.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "google", clientId: "google-client-id", enabled: true }),
        expect.objectContaining({ provider: "github", clientId: "github-client-id", enabled: true }),
      ]),
    );

    process.env.GOOGLE_CLIENT_ID = previousGoogle;
    process.env.GOOGLE_CLIENT_SECRET = previousGoogleSecret;
    process.env.GITHUB_CLIENT_ID = previousGithub;
    process.env.GITHUB_CLIENT_SECRET = previousGithubSecret;
  });

  it("hides GitHub provider when GITHUB_CLIENT_SECRET is missing", async () => {
    const previousId = process.env.GITHUB_CLIENT_ID;
    const previousSecret = process.env.GITHUB_CLIENT_SECRET;
    process.env.GITHUB_CLIENT_ID = "id-only";
    delete process.env.GITHUB_CLIENT_SECRET;

    const res = await request(app).get("/api/auth/oauth/providers");
    expect(res.status).toBe(200);
    expect(res.body.providers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ provider: "github" })]),
    );

    process.env.GITHUB_CLIENT_ID = previousId;
    if (previousSecret !== undefined) process.env.GITHUB_CLIENT_SECRET = previousSecret;
  });

  it("returns 503 when GitHub OAuth is not configured", async () => {
    const previousId = process.env.GITHUB_CLIENT_ID;
    const previousSecret = process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;

    // §2.2: the callback now requires a valid state cookie before it reaches
    // the missing-config branch. Generate a matching pair so the state gate
    // passes and the test exercises the OAUTH_MISSING_CONFIG path.
    const { generateOAuthState, OAUTH_STATE_COOKIE } = await import("../lib/oauth-state.js");
    const { state, cookieValue } = generateOAuthState("github");

    const res = await request(app)
      .post("/api/auth/oauth/github/callback")
      .set("Cookie", `${OAUTH_STATE_COOKIE}=${cookieValue}`)
      .send({ code: "abc", state, redirectUri: "https://example.com/auth/callback" });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("OAUTH_MISSING_CONFIG");

    if (previousId !== undefined) process.env.GITHUB_CLIENT_ID = previousId;
    if (previousSecret !== undefined) process.env.GITHUB_CLIENT_SECRET = previousSecret;
  });

  it("exposes safe OAuth diagnostics without secrets", async () => {
    const previousFrontend = process.env.FRONTEND_URL;
    const previousGoogle = process.env.GOOGLE_CLIENT_ID;
    const previousGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;

    process.env.FRONTEND_URL = "https://staging.example.com";
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";

    const res = await request(app).get("/api/auth/oauth/diagnostics");

    expect(res.status).toBe(200);
    expect(res.body.providers.google.configured).toBe(true);
    expect(res.body.providers.google.clientSecretConfigured).toBe(true);
    expect(res.body.providers.google.requiredCallbackUrls).toContain("https://staging.example.com/auth/callback");
    expect(res.body.providers.google.requiredCallbackUrls).toContain("http://localhost:3000/auth/callback");
    expect(res.body.secretsExposed).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain("google-client-secret");

    process.env.FRONTEND_URL = previousFrontend;
    process.env.GOOGLE_CLIENT_ID = previousGoogle;
    process.env.GOOGLE_CLIENT_SECRET = previousGoogleSecret;
  });

  it("returns provider-mismatch when password login is attempted for OAuth-only account", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: "oauth-user-1",
      email: "oauth@example.com",
      password: "",
      role: Role.CANDIDATE,
      name: "OAuth User",
      employer: null,
      oauthAccounts: [{ provider: "GOOGLE" }],
      emailVerified: true,
      avatarUrl: null,
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "oauth@example.com",
      password: "Password123!",
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PROVIDER_MISMATCH");
  });

  it("verifies a valid email token", async () => {
    (prisma.emailVerificationToken.findUnique as any).mockResolvedValueOnce({
      id: "token-record-1",
      token: "valid-token",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      user: {
        id: "user-1",
        email: "candidate@example.com",
      },
    });

    const res = await request(app).post("/api/auth/email/verify").send({
      token: "valid-token",
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email verified successfully");
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("rejects invalid verification token", async () => {
    (prisma.emailVerificationToken.findUnique as any).mockResolvedValueOnce(null);

    const res = await request(app).post("/api/auth/email/verify").send({
      token: "missing-token",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid verification token");
  });

  it("blocks sensitive billing action for unverified users", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      emailVerified: false,
      email: "candidate@example.com",
    });

    const token = makeCandidateToken("candidate-1");
    const res = await request(app)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ plan: "BASIC", interval: "MONTHLY" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_VERIFICATION_REQUIRED");
  });
});
