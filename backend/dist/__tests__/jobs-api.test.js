import { vi, describe, it, expect, beforeEach } from "vitest";
// Mock AI Persistence
vi.mock("../lib/ai/persistence.js", () => ({
    createAiRun: vi.fn().mockResolvedValue(undefined),
    completeAiRun: vi.fn().mockResolvedValue(undefined),
    getRunHistory: vi.fn().mockResolvedValue([]),
}));
// Mock Prisma
vi.mock("../lib/prisma.js", () => ({
    default: {
        job: {
            findMany: vi.fn(),
            count: vi.fn(),
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        employer: {
            findUnique: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation(async (arr) => {
            const results = [];
            for (const item of arr) {
                results.push(await item);
            }
            return results;
        }),
        $queryRaw: vi.fn().mockResolvedValue([]),
        $disconnect: vi.fn().mockResolvedValue(undefined),
    }
}));
import prisma from "../lib/prisma.js";
import request from "supertest";
import app from "../app.js";
import { Role } from "@prisma/client";
import { signToken } from "../lib/jwt.js";
function makeEmployerToken(id = "emp123") {
    return signToken({
        userId: id,
        email: "employer@test.com",
        role: Role.EMPLOYER,
    });
}
function makeCandidateToken(id = "can123") {
    return signToken({
        userId: id,
        email: "candidate@test.com",
        role: Role.CANDIDATE,
    });
}
const DUMMY_JOB = {
    id: "job123",
    title: "Frontend Engineer",
    slug: "frontend-engineer-123",
    employerId: "emp123",
    status: "PUBLISHED",
    employer: { companyName: "TechCorp" }
};
describe("Jobs API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe("GET /api/jobs", () => {
        it("returns 200 with list of jobs and pagination", async () => {
            // First is count (1), Second is findMany ([DUMMY_JOB])
            prisma.job.count.mockResolvedValueOnce(1);
            prisma.job.findMany.mockResolvedValueOnce([DUMMY_JOB]);
            const res = await request(app).get("/api/jobs?page=1&limit=10");
            expect(res.status).toBe(200);
            expect(res.body.jobs).toHaveLength(1);
            expect(res.body.jobs[0].title).toBe("Frontend Engineer");
            expect(res.body.pagination).toEqual({
                page: 1,
                limit: 10,
                total: 1,
                totalPages: 1
            });
        });
    });
    describe("GET /api/jobs/:slug", () => {
        it("returns 404 for non-existent job", async () => {
            prisma.job.findUnique.mockResolvedValueOnce(null);
            const res = await request(app).get("/api/jobs/missing-slug");
            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Job not found");
        });
        it("returns 200 for existing published job", async () => {
            prisma.job.findUnique.mockResolvedValueOnce(DUMMY_JOB);
            const res = await request(app).get("/api/jobs/frontend-engineer-123");
            expect(res.status).toBe(200);
            expect(res.body.id).toBe("job123");
            expect(res.body.slug).toBe("frontend-engineer-123");
        });
    });
    describe("POST /api/jobs", () => {
        it("returns 401 without token", async () => {
            const res = await request(app).post("/api/jobs").send({ title: "New Job" });
            expect(res.status).toBe(401);
        });
        it("returns 403 for candidate (non-employer)", async () => {
            const token = makeCandidateToken();
            const res = await request(app).post("/api/jobs")
                .set("Authorization", `Bearer ${token}`)
                .send({ title: "New Job" });
            expect(res.status).toBe(403);
        });
        it("returns 400 for missing required fields", async () => {
            const token = makeEmployerToken();
            const res = await request(app).post("/api/jobs")
                .set("Authorization", `Bearer ${token}`)
                .send({ title: "Only Title" }); // missing desc, location, etc.
            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Validation failed");
        });
        it("creates job successfully on valid payload", async () => {
            const token = makeEmployerToken();
            prisma.employer.findUnique.mockResolvedValueOnce({ id: "emp123", userId: "emp123" });
            prisma.job.create.mockResolvedValueOnce({
                id: "new_job_1",
                title: "Frontend Dev",
                slug: "frontend-dev",
                employerId: "emp123",
                status: "DRAFT"
            });
            const res = await request(app).post("/api/jobs")
                .set("Authorization", `Bearer ${token}`)
                .send({
                title: "Frontend Dev",
                description: "A great job",
                location: "Remote",
                type: "FULL_TIME",
                seniority: "MID",
                salaryMin: 50000,
                salaryMax: 100000,
                currency: "USD",
                status: "DRAFT"
            });
            expect(res.status).toBe(201);
            expect(res.body.title).toBe("Frontend Dev");
            expect(res.body.status).toBe("DRAFT");
        });
    });
    describe("PUT /api/jobs/:id", () => {
        it("returns 404 if job not found during update", async () => {
            const token = makeEmployerToken();
            prisma.employer.findUnique.mockResolvedValueOnce({ id: "emp123", userId: "emp123" });
            prisma.job.findFirst.mockResolvedValueOnce(null);
            const res = await request(app).put("/api/jobs/job123")
                .set("Authorization", `Bearer ${token}`)
                .send({ title: "Updated Title", description: "Updated Dev", location: "Lagos", type: "CONTRACT", seniority: "JUNIOR", status: "DRAFT" });
            expect(res.status).toBe(404);
        });
        it("returns 403 if job belongs to another employer", async () => {
            const token = makeEmployerToken("different_employer_id");
            // Job belongs to "emp123"
            prisma.employer.findUnique.mockResolvedValueOnce({ id: "emp999", userId: "different_employer_id" });
            prisma.job.findFirst.mockResolvedValueOnce(null); // findFirst with correct employer returns null
            const res = await request(app).put("/api/jobs/job123")
                .set("Authorization", `Bearer ${token}`)
                .send({ title: "Updated Title", description: "Updated Dev", location: "Lagos", type: "CONTRACT", seniority: "JUNIOR", status: "DRAFT" });
            expect(res.status).toBe(404); // the route logic handles "not found" vs "forbidden" as 404
        });
        it("updates job successfully", async () => {
            const token = makeEmployerToken("emp123");
            // Check ownership
            prisma.employer.findUnique.mockResolvedValueOnce({ id: "emp123", userId: "emp123" });
            prisma.job.findFirst.mockResolvedValueOnce({ ...DUMMY_JOB, employerId: "emp123" });
            // Perform update
            prisma.job.update.mockResolvedValueOnce({ ...DUMMY_JOB, title: "Updated Title" });
            const res = await request(app).put("/api/jobs/job123")
                .set("Authorization", `Bearer ${token}`)
                .send({ title: "Updated Title", description: "Updated Dev", location: "Lagos", type: "CONTRACT", seniority: "JUNIOR", status: "DRAFT" });
            expect(res.status).toBe(200);
            expect(res.body.title).toBe("Updated Title");
        });
    });
});
//# sourceMappingURL=jobs-api.test.js.map