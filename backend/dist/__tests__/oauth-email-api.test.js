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
function makeCandidateToken(id = "candidate-1") {
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
        const previousApple = process.env.APPLE_CLIENT_ID;
        process.env.GOOGLE_CLIENT_ID = "google-client-id";
        process.env.APPLE_CLIENT_ID = "apple-client-id";
        const res = await request(app).get("/api/auth/oauth/providers");
        expect(res.status).toBe(200);
        expect(res.body.providers).toEqual(expect.arrayContaining([
            expect.objectContaining({ provider: "google", enabled: true }),
            expect.objectContaining({ provider: "apple", enabled: true }),
        ]));
        process.env.GOOGLE_CLIENT_ID = previousGoogle;
        process.env.APPLE_CLIENT_ID = previousApple;
    });
    it("returns provider-mismatch when password login is attempted for OAuth-only account", async () => {
        prisma.user.findUnique.mockResolvedValueOnce({
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
        prisma.emailVerificationToken.findUnique.mockResolvedValueOnce({
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
        prisma.emailVerificationToken.findUnique.mockResolvedValueOnce(null);
        const res = await request(app).post("/api/auth/email/verify").send({
            token: "missing-token",
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid verification token");
    });
    it("blocks sensitive billing action for unverified users", async () => {
        prisma.user.findUnique.mockResolvedValueOnce({
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
//# sourceMappingURL=oauth-email-api.test.js.map