import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../middleware/account-standing.js", () => ({
    requireAccountStanding: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock Prisma
vi.mock("../lib/prisma.js", () => ({
    default: {
        user: {
            findUnique: vi.fn(),
        },
        candidateProfile: {
            findUnique: vi.fn(),
        },
        learningResource: {
            findMany: vi.fn(),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
        $disconnect: vi.fn().mockResolvedValue(undefined),
    },
}));

import prisma from "../lib/prisma.js";

import request from "supertest";
import app from "../app.js";
import { Role } from "@prisma/client";
import { signToken } from "../lib/jwt.js";

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

function makeResource(overrides: Record<string, unknown> = {}) {
    return {
        id: "res-1",
        title: "Kubernetes Fundamentals",
        description: "Container orchestration from scratch",
        url: "https://learn.example.com/k8s",
        provider: "ExampleAcademy",
        category: "DevOps Demos",
        skills: ["kubernetes", "docker"],
        difficulty: "BEGINNER",
        durationHours: 6,
        isFree: true,
        imageUrl: null,
        featured: true,
        createdAt: new Date(),
        ...overrides,
    };
}

describe("GET /api/learning/recommended", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns gapSkills on each item when the candidate has profile skills", async () => {
        mockCurrentCandidate();
        vi.mocked(prisma.candidateProfile.findUnique).mockResolvedValue({
            skills: ["React", "TypeScript"],
        } as never);
        vi.mocked(prisma.learningResource.findMany).mockResolvedValue([
            makeResource(),
            makeResource({ id: "res-2", title: "Terraform Basics", skills: ["terraform"] }),
        ] as never);

        const res = await request(app)
            .get("/api/learning/recommended")
            .set("Authorization", `Bearer ${makeCandidateToken()}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].gapSkills).toEqual(["kubernetes", "docker"]);
        expect(res.body[1].gapSkills).toEqual(["terraform"]);
    });

    it("never lists a skill the candidate already has as a gap", async () => {
        mockCurrentCandidate();
        vi.mocked(prisma.candidateProfile.findUnique).mockResolvedValue({
            skills: ["Docker"],
        } as never);
        // Simulate a resource slipping past the DB-level overlap filter
        // (case-insensitive check happens in the route).
        vi.mocked(prisma.learningResource.findMany).mockResolvedValue([
            makeResource({ skills: ["kubernetes", "helm"] }),
        ] as never);

        const res = await request(app)
            .get("/api/learning/recommended")
            .set("Authorization", `Bearer ${makeCandidateToken()}`);

        expect(res.status).toBe(200);
        expect(res.body[0].gapSkills).toEqual(["kubernetes", "helm"]);
        expect(res.body[0].gapSkills).not.toContain("Docker");
    });

    it("omits gapSkills on the featured fallback when the profile has no skills", async () => {
        mockCurrentCandidate();
        vi.mocked(prisma.candidateProfile.findUnique).mockResolvedValue({
            skills: [],
        } as never);
        vi.mocked(prisma.learningResource.findMany).mockResolvedValue([
            makeResource(),
        ] as never);

        const res = await request(app)
            .get("/api/learning/recommended")
            .set("Authorization", `Bearer ${makeCandidateToken()}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].gapSkills).toBeUndefined();
    });

    it("requires authentication", async () => {
        const res = await request(app).get("/api/learning/recommended");
        expect(res.status).toBe(401);
    });
});
