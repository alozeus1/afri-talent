import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock Prisma
vi.mock("../lib/prisma.js", () => ({
    default: {
        company: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
        },
        employer: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
        },
        job: {
            groupBy: vi.fn(),
            count: vi.fn(),
        },
        companyReview: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
        $disconnect: vi.fn().mockResolvedValue(undefined),
    },
}));

import prisma from "../lib/prisma.js";

import request from "supertest";
import app from "../app.js";

function makeEmployer(overrides: Record<string, unknown> = {}) {
    return {
        id: "emp-1",
        companyName: "TechCorp",
        website: "https://techcorp.example.com",
        location: "Lagos",
        bio: "We build things.",
        logoUrl: null,
        brandColor: null,
        accentColor: null,
        trustProfile: {
            verificationLevel: "EMAIL_DOMAIN_VERIFIED",
            postingEligibility: true,
        },
        _count: { jobs: 3 },
        ...overrides,
    };
}

describe("GET /api/companies", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("only claims hiresFromAfrica for employers with a published Africa-eligible job", async () => {
        vi.mocked(prisma.company.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.employer.findMany).mockResolvedValue([
            makeEmployer(),
            makeEmployer({ id: "emp-2", companyName: "OtherCorp" }),
        ] as never);
        vi.mocked(prisma.job.groupBy).mockResolvedValue([
            { employerId: "emp-1", _count: { _all: 2 } },
        ] as never);

        const res = await request(app).get("/api/companies");

        expect(res.status).toBe(200);
        const byId = Object.fromEntries(
            res.body.companies.map((c: { id: string }) => [c.id, c]),
        );
        expect(byId["emp-1"].hiresFromAfrica).toBe(true);
        expect(byId["emp-2"].hiresFromAfrica).toBe(false);
    });

    it("exposes the granular employer trust badge", async () => {
        vi.mocked(prisma.company.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.employer.findMany).mockResolvedValue([
            makeEmployer(),
            makeEmployer({ id: "emp-2", companyName: "NewCorp", trustProfile: null }),
        ] as never);
        vi.mocked(prisma.job.groupBy).mockResolvedValue([] as never);

        const res = await request(app).get("/api/companies");

        expect(res.status).toBe(200);
        const byId = Object.fromEntries(
            res.body.companies.map((c: { id: string }) => [c.id, c]),
        );
        expect(byId["emp-1"].trustBadge).toBe("Domain verified employer");
        expect(byId["emp-2"].trustBadge).toBe("Unverified employer");
    });
});

describe("GET /api/companies/:id", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("normalizes the Company branch and wraps it in { company }", async () => {
        vi.mocked(prisma.company.findUnique).mockResolvedValue({
            id: "com-1",
            name: "Acme Directory Co",
            description: "A directory company.",
            logo: "https://img.example.com/acme.png",
            industry: "Software",
            headquarters: "Nairobi",
            website: null,
            size: null,
            hiresFromAfrica: true,
            verifiedAt: null,
            sponsorshipTrustScore: 7,
            ratingAggregate: { totalReviews: 2, averageOverall: 4.5 },
            reviews: [],
        } as never);
        vi.mocked(prisma.job.count).mockResolvedValue(5 as never);

        const res = await request(app).get("/api/companies/com-1");

        expect(res.status).toBe(200);
        expect(res.body.company.companyName).toBe("Acme Directory Co");
        expect(res.body.company.bio).toBe("A directory company.");
        expect(res.body.company.logoUrl).toBe("https://img.example.com/acme.png");
        expect(res.body.company.trustBadge).toBeNull();
        expect(res.body.company.jobCount).toBe(5);
    });

    it("derives hiresFromAfrica and trustBadge on the employer fallback", async () => {
        vi.mocked(prisma.company.findUnique).mockResolvedValue(null as never);
        vi.mocked(prisma.employer.findUnique).mockResolvedValue(makeEmployer() as never);
        vi.mocked(prisma.job.count).mockResolvedValue(0 as never);

        const res = await request(app).get("/api/companies/emp-1");

        expect(res.status).toBe(200);
        expect(res.body.company.hiresFromAfrica).toBe(false);
        expect(res.body.company.trustBadge).toBe("Domain verified employer");
        expect(res.body.company.bio).toBe("We build things.");
    });

    it("404s when neither a Company nor an Employer matches", async () => {
        vi.mocked(prisma.company.findUnique).mockResolvedValue(null as never);
        vi.mocked(prisma.employer.findUnique).mockResolvedValue(null as never);

        const res = await request(app).get("/api/companies/nope");

        expect(res.status).toBe(404);
    });
});
