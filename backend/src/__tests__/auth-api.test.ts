import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock AI Persistence
vi.mock("../lib/ai/persistence.js", () => ({
    createAiRun: vi.fn().mockResolvedValue(undefined),
    completeAiRun: vi.fn().mockResolvedValue(undefined),
    getRunHistory: vi.fn().mockResolvedValue([]),
}));

// Mock Prisma
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
        candidateTrustProfile: {
            upsert: vi.fn(),
        },
        employerTrustProfile: {
            upsert: vi.fn(),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
        $disconnect: vi.fn().mockResolvedValue(undefined),
    }
}));

// We can still import the mocked module to access the spy functions
import prisma from "../lib/prisma.js";

// Mock bcrypt
import * as bcrypt from "bcrypt";
vi.mock("bcrypt", () => ({
    default: {
        hash: vi.fn().mockResolvedValue("hashed_password_123"),
        compare: vi.fn().mockImplementation(async (pass, hash) => pass === "Password123!"),
    },
    compare: vi.fn().mockImplementation(async (pass, hash) => pass === "Password123!"),
    hash: vi.fn().mockResolvedValue("hashed_password_123"),
}));

import request from "supertest";
import app from "../app.js";
import { Role } from "@prisma/client";
import { signToken } from "../lib/jwt.js";

function makeCandidateToken(id = "user123"): string {
    return signToken({
        userId: id,
        email: "candidate@test.com",
        role: Role.CANDIDATE,
    });
}

function mockOptionalAuthAccount(input: {
    id: string;
    email: string;
    role: Role;
    deletedAt?: Date | null;
    accountRestrictionStatus?: "ACTIVE" | "SUSPENDED";
} | null, expectedUserId: string): void {
    (prisma.user.findUnique as any).mockImplementation((args: any) => {
        const isAuthLookup =
            args?.where?.id === expectedUserId &&
            args?.select?.deletedAt === true &&
            args?.select?.accountRestrictionStatus === true;

        if (isAuthLookup) {
            return Promise.resolve(input);
        }

        if (input && args?.where?.id === input.id && args?.include?.employer === true) {
            return Promise.resolve({
                ...input,
                name: "John Doe",
                emailVerified: true,
                avatarUrl: null,
                employer: null,
            });
        }

        return undefined;
    });
}

describe("Auth API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        (prisma.user.findUnique as any).mockReset();
    });

    describe("POST /api/auth/register", () => {
        it("returns 400 for invalid email", async () => {
            const res = await request(app).post("/api/auth/register").send({
                email: "not-an-email",
                password: "Password123!",
                role: "CANDIDATE",
                firstName: "John",
                lastName: "Doe",
            });
            expect(res.status).toBe(400);
            expect(res.body.details[0].path).toContain("email");
        });

        it("returns 400 when password is too weak", async () => {
            const res = await request(app).post("/api/auth/register").send({
                email: "test@example.com",
                password: "weak",
                role: "CANDIDATE",
                firstName: "John",
                lastName: "Doe",
            });
            expect(res.status).toBe(400);
            expect(res.body.details[0].path).toContain("password");
        });

        it("returns 400 if user exists", async () => {
            (prisma.user.findUnique as any).mockResolvedValueOnce({ id: "user123", email: "test@example.com" });

            const res = await request(app).post("/api/auth/register").send({
                email: "test@example.com",
                password: "Password123!",
                role: "CANDIDATE",
                name: "John Doe",
            });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Email already registered");
        });

        it("registers user successfully", async () => {
            (prisma.user.findUnique as any).mockResolvedValueOnce(null); // doesn't exist yet
            (prisma.user.create as any).mockResolvedValueOnce({
                id: "new_user_123",
                email: "test@example.com",
                role: Role.CANDIDATE,
                name: "John Doe",
            });

            const res = await request(app).post("/api/auth/register").send({
                email: "test@example.com",
                password: "Password123!",
                role: "CANDIDATE",
                name: "John Doe",
            });
            expect(res.status).toBe(201);
            expect(res.body.user).toEqual({
                id: "new_user_123",
                email: "test@example.com",
                role: "CANDIDATE",
                name: "John Doe",
            });
        });
    });

    describe("POST /api/auth/login", () => {
        it("returns 401 on invalid credentials (user not found)", async () => {
            (prisma.user.findUnique as any).mockResolvedValueOnce(null);

            const res = await request(app).post("/api/auth/login").send({
                email: "does_not_exist@example.com",
                password: "Password123!",
            });

            expect(res.status).toBe(401);
            expect(res.body.error).toBe("Invalid email or password");
        });

        it("returns 401 on bad password", async () => {
            (prisma.user.findUnique as any).mockResolvedValueOnce({
                id: "user123",
                email: "test@example.com",
                passwordHash: "securehash",
                role: Role.CANDIDATE,
            });

            // (bcrypt.compare as any).mockResolvedValueOnce(true); // matching password doesn't match

            const res = await request(app).post("/api/auth/login").send({
                email: "test@example.com",
                password: "BadPassword123!",
            });

            expect(res.status).toBe(401);
            expect(res.body.error).toBe("Invalid email or password");
        });

        it("logs in successfully", async () => {
            (prisma.user.findUnique as any).mockResolvedValueOnce({
                id: "user123",
                email: "test@example.com",
                password: "securehash",
                role: Role.EMPLOYER,
                name: "Jane Doe",
                employer: { companyName: "ACME" }
            });

            const res = await request(app).post("/api/auth/login").send({
                email: "test@example.com",
                password: "Password123!",
            });

            expect(res.status).toBe(200);
            expect(res.body.user.role).toBe("EMPLOYER");
            expect(res.body.user.name).toBe("Jane Doe");
        });
    });

    describe("GET /api/auth/me", () => {
        it("returns an anonymous session payload without token", async () => {
            const res = await request(app).get("/api/auth/me");
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                authenticated: false,
                user: null,
            });
            // §2.3 — anonymous /me now also seeds a CSRF token.
            expect(typeof res.body.csrfToken).toBe("string");
        });

        it("returns an anonymous payload when the token account no longer exists", async () => {
            mockOptionalAuthAccount(null, "deleted_user");
            const token = makeCandidateToken("deleted_user");

            const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ authenticated: false, user: null });
        });

        it("returns current database account data instead of stale token claims", async () => {
            mockOptionalAuthAccount({
                id: "user123",
                email: "candidate@test.com",
                role: Role.CANDIDATE,
                deletedAt: null,
                accountRestrictionStatus: "ACTIVE",
            }, "user123");
            const token = signToken({ userId: "user123", email: "stale@example.test", role: Role.EMPLOYER });

            const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body.authenticated).toBe(true);
            expect(res.body.user.id).toBe("user123");
            expect(res.body.user.email).toBe("candidate@test.com");
            expect(res.body.user.role).toBe(Role.CANDIDATE);
        });

        it("returns an anonymous payload for a deleted account", async () => {
            mockOptionalAuthAccount({
                id: "deleted_user",
                email: "deleted@example.test",
                role: Role.CANDIDATE,
                deletedAt: new Date(),
                accountRestrictionStatus: "ACTIVE",
            }, "deleted_user");

            const res = await request(app)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${makeCandidateToken("deleted_user")}`);

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ authenticated: false, user: null });
        });

        it("returns an anonymous payload for a suspended account", async () => {
            mockOptionalAuthAccount({
                id: "suspended_user",
                email: "suspended@example.test",
                role: Role.CANDIDATE,
                deletedAt: null,
                accountRestrictionStatus: "SUSPENDED",
            }, "suspended_user");

            const res = await request(app)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${makeCandidateToken("suspended_user")}`);

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ authenticated: false, user: null });
        });

        it("returns an anonymous payload for a malformed token", async () => {
            const res = await request(app)
                .get("/api/auth/me")
                .set("Authorization", "Bearer not-a-valid-token");

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ authenticated: false, user: null });
        });
    });
});
