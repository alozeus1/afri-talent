import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock Prisma
vi.mock("../lib/prisma.js", () => ({
    default: {
        salaryBenchmark: {
            findMany: vi.fn(),
        },
        user: {
            findUnique: vi.fn(),
        },
        $disconnect: vi.fn().mockResolvedValue(undefined),
    },
}));

import prisma from "../lib/prisma.js";

import request from "supertest";
import app from "../app.js";
import { Role } from "@prisma/client";
import { signToken } from "../lib/jwt.js";

const findMany = vi.mocked(prisma.salaryBenchmark.findMany);

function makeCandidateToken(id = "can123"): string {
    return signToken({
        userId: id,
        email: "candidate@test.com",
        role: Role.CANDIDATE,
    });
}

function mockCurrentCandidate(): void {
    (prisma.user.findUnique as any).mockImplementation((args: any) => {
        const isAuthLookup =
            args?.where?.id === "can123" &&
            args?.select?.deletedAt === true &&
            args?.select?.accountRestrictionStatus === true;

        if (isAuthLookup) {
            return Promise.resolve({
                id: "can123",
                email: "candidate@test.com",
                role: Role.CANDIDATE,
                deletedAt: null,
                accountRestrictionStatus: "ACTIVE",
            });
        }

        return undefined;
    });
}

const BENCHMARK_ROW = {
    role: "Software Engineer",
    level: "senior",
    country: "NG",
    currency: "USD",
    salaryMin: 40000,
    salaryMedian: 60000,
    salaryMax: 85000,
    sampleSize: 128,
    lastUpdated: new Date("2026-06-01T00:00:00.000Z"),
};

describe("GET /api/salary-benchmarks/search", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 401 when unauthenticated", async () => {
        const res = await request(app).get("/api/salary-benchmarks/search?role=engineer");

        expect(res.status).toBe(401);
        expect(findMany).not.toHaveBeenCalled();
    });

    it("returns 400 when role is missing", async () => {
        mockCurrentCandidate();
        const res = await request(app)
            .get("/api/salary-benchmarks/search")
            .set("Authorization", `Bearer ${makeCandidateToken()}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Validation failed");
        expect(findMany).not.toHaveBeenCalled();
    });

    it("returns 200 with matching benchmarks", async () => {
        mockCurrentCandidate();
        findMany.mockResolvedValueOnce([BENCHMARK_ROW] as never);

        const res = await request(app)
            .get("/api/salary-benchmarks/search?role=software")
            .set("Authorization", `Bearer ${makeCandidateToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.benchmarks).toHaveLength(1);
        expect(res.body.benchmarks[0]).toMatchObject({
            role: "Software Engineer",
            level: "senior",
            country: "NG",
            currency: "USD",
            salaryMin: 40000,
            salaryMedian: 60000,
            salaryMax: 85000,
            sampleSize: 128,
        });

        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    role: { contains: "software", mode: "insensitive" },
                },
                orderBy: { sampleSize: "desc" },
                take: 20,
            })
        );
    });

    it("applies optional country and level filters", async () => {
        mockCurrentCandidate();
        findMany.mockResolvedValueOnce([] as never);

        const res = await request(app)
            .get("/api/salary-benchmarks/search?role=engineer&country=NG&level=senior")
            .set("Authorization", `Bearer ${makeCandidateToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.benchmarks).toEqual([]);

        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    role: { contains: "engineer", mode: "insensitive" },
                    country: { equals: "NG", mode: "insensitive" },
                    level: { equals: "senior", mode: "insensitive" },
                },
            })
        );
    });
});
