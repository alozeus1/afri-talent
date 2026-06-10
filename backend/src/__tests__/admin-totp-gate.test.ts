import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../lib/prisma.js", () => ({
    default: {
        user: { findUnique: vi.fn() },
        $disconnect: vi.fn(),
    },
}));
vi.mock("../lib/redis.js", () => ({
    redisClient: null,
    blockToken: vi.fn(),
    isTokenBlocked: vi.fn().mockResolvedValue(false),
}));

import prisma from "../lib/prisma.js";
import { adminTotpGate } from "../middleware/admin-totp-gate.js";
import { signToken } from "../lib/jwt.js";
import { Role } from "@prisma/client";

const findUnique = vi.mocked(prisma.user.findUnique);

const ADMIN_TOKEN = signToken({ userId: "admin-1", email: "admin@test.com", role: Role.ADMIN });

function makeReq(method: string, path = "/users"): Request {
    return {
        method,
        path,
        originalUrl: `/api/admin${path}`,
        headers: {
            authorization: `Bearer ${ADMIN_TOKEN}`,
            // The gate has a NODE_ENV=test bypass unless this header demands enforcement.
            "x-admin-totp-test-bypass": "enforce",
        },
    } as unknown as Request;
}

function makeRes() {
    const headers: Record<string, string> = {};
    const res = {
        statusCode: 0,
        body: undefined as unknown,
        setHeader: vi.fn((k: string, v: string) => {
            headers[k] = v;
        }),
        status: vi.fn().mockImplementation(function (this: Response, code: number) {
            (res as { statusCode: number }).statusCode = code;
            return res;
        }),
        json: vi.fn().mockImplementation((payload: unknown) => {
            (res as { body: unknown }).body = payload;
            return res;
        }),
        headers,
    };
    return res as unknown as Response & { statusCode: number; body: { code?: string }; headers: Record<string, string> };
}

function adminUser(overrides: Partial<{ totpEnrolledAt: Date | null; totpGraceUntil: Date | null }> = {}) {
    return {
        role: Role.ADMIN,
        totpEnrolledAt: null,
        totpGraceUntil: null,
        adminRole: { id: "role-1" },
        ...overrides,
    };
}

async function runGate(req: Request, res: Response): Promise<NextFunction> {
    const next = vi.fn() as unknown as NextFunction;
    await adminTotpGate(req, res, next);
    // authenticate() resolves asynchronously; flush microtasks.
    await new Promise((r) => setImmediate(r));
    return next;
}

describe("adminTotpGate — H2 grace-window hardening", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("lets an enrolled admin through for any method", async () => {
        findUnique.mockResolvedValue(adminUser({ totpEnrolledAt: new Date() }) as never);
        const res = makeRes();

        const next = await runGate(makeReq("POST"), res);

        expect(next).toHaveBeenCalledOnce();
    });

    it("allows GET during grace and sets the grace header", async () => {
        const graceUntil = new Date(Date.now() + 60 * 60 * 1000);
        findUnique.mockResolvedValue(adminUser({ totpGraceUntil: graceUntil }) as never);
        const res = makeRes();

        const next = await runGate(makeReq("GET"), res);

        expect(next).toHaveBeenCalledOnce();
        expect(res.headers["X-Admin-Totp-Grace-Until"]).toBe(graceUntil.toISOString());
    });

    it("blocks mutating methods during grace with TOTP_ENROLMENT_REQUIRED", async () => {
        const graceUntil = new Date(Date.now() + 60 * 60 * 1000);
        findUnique.mockResolvedValue(adminUser({ totpGraceUntil: graceUntil }) as never);

        for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
            const res = makeRes();
            const next = await runGate(makeReq(method), res);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
            expect(res.body.code).toBe("TOTP_ENROLMENT_REQUIRED");
        }
    });

    it("blocks everything after grace expiry", async () => {
        findUnique.mockResolvedValue(
            adminUser({ totpGraceUntil: new Date(Date.now() - 1000) }) as never,
        );
        const res = makeRes();

        const next = await runGate(makeReq("GET"), res);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
        expect(res.body.code).toBe("TOTP_ENROLMENT_REQUIRED");
    });

    it("rejects non-admin users", async () => {
        findUnique.mockResolvedValue({
            role: Role.CANDIDATE,
            totpEnrolledAt: null,
            totpGraceUntil: null,
            adminRole: null,
        } as never);
        const res = makeRes();

        const next = await runGate(makeReq("GET"), res);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    it("exempts the enrolment endpoints from the gate", async () => {
        const res = makeRes();

        const next = await runGate(makeReq("POST", "/totp/enrol"), res);

        expect(next).toHaveBeenCalledOnce();
        expect(findUnique).not.toHaveBeenCalled();
    });
});
