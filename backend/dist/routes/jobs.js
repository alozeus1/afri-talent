import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { JobStatus, Role } from "@prisma/client";
const router = Router();
const createJobSchema = z.object({
    title: z.string().min(3),
    description: z.string().min(10),
    location: z.string(),
    type: z.string(),
    seniority: z.string(),
    salaryMin: z.coerce.number().optional(),
    salaryMax: z.coerce.number().optional(),
    currency: z.string().optional(),
    tags: z.array(z.string()).optional(),
});
const updateJobSchema = createJobSchema.partial();
function generateSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        + "-" + Date.now().toString(36);
}
// GET /api/jobs/employer/my-jobs - Employer: list own jobs (must be before /:slug)
router.get("/employer/my-jobs", authenticate, authorize(Role.EMPLOYER), async (req, res) => {
    try {
        const employer = await prisma.employer.findUnique({
            where: { userId: req.user.userId },
        });
        if (!employer) {
            res.status(400).json({ error: "Employer profile not found" });
            return;
        }
        const jobs = await prisma.job.findMany({
            where: { employerId: employer.id },
            include: {
                _count: { select: { applications: true } },
            },
            orderBy: { createdAt: "desc" },
        });
        res.json(jobs);
    }
    catch (error) {
        console.error("My jobs error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/jobs - Public: list published jobs
router.get("/", async (req, res) => {
    try {
        const { search, location, type, seniority, page = "1", limit = "10" } = req.query;
        const where = { status: JobStatus.PUBLISHED };
        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
            ];
        }
        if (location) {
            where.location = { contains: location, mode: "insensitive" };
        }
        if (type) {
            where.type = type;
        }
        if (seniority) {
            where.seniority = seniority;
        }
        const parsedLimit = Math.min(parseInt(limit) || 10, 100);
        const skip = (parseInt(page) - 1) * parsedLimit;
        const take = parsedLimit;
        const [jobs, total] = await Promise.all([
            prisma.job.findMany({
                where,
                include: {
                    employer: {
                        select: { companyName: true, location: true },
                    },
                },
                orderBy: { publishedAt: "desc" },
                skip,
                take,
            }),
            prisma.job.count({ where }),
        ]);
        res.json({
            jobs,
            pagination: {
                page: parseInt(page),
                limit: take,
                total,
                totalPages: Math.ceil(total / take),
            },
        });
    }
    catch (error) {
        console.error("List jobs error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/jobs/:slug - Public: get single job by slug
router.get("/:slug", async (req, res) => {
    try {
        const job = await prisma.job.findUnique({
            where: { slug: req.params.slug },
            include: {
                employer: {
                    select: { companyName: true, location: true, website: true, bio: true },
                },
            },
        });
        if (!job) {
            res.status(404).json({ error: "Job not found" });
            return;
        }
        // Only show published jobs to public
        if (job.status !== JobStatus.PUBLISHED) {
            res.status(404).json({ error: "Job not found" });
            return;
        }
        res.json(job);
    }
    catch (error) {
        console.error("Get job error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/jobs - Employer: create job
router.post("/", authenticate, authorize(Role.EMPLOYER), async (req, res) => {
    try {
        const data = createJobSchema.parse(req.body);
        const employer = await prisma.employer.findUnique({
            where: { userId: req.user.userId },
        });
        if (!employer) {
            res.status(400).json({ error: "Employer profile not found" });
            return;
        }
        const job = await prisma.job.create({
            data: {
                ...data,
                slug: generateSlug(data.title),
                tags: data.tags || [],
                status: JobStatus.PENDING_REVIEW,
                employerId: employer.id,
            },
        });
        res.status(201).json(job);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        console.error("Create job error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/jobs/:id - Employer: update own job
router.put("/:id", authenticate, authorize(Role.EMPLOYER), async (req, res) => {
    try {
        const data = updateJobSchema.parse(req.body);
        const employer = await prisma.employer.findUnique({
            where: { userId: req.user.userId },
        });
        if (!employer) {
            res.status(400).json({ error: "Employer profile not found" });
            return;
        }
        const existingJob = await prisma.job.findFirst({
            where: { id: req.params.id, employerId: employer.id },
        });
        if (!existingJob) {
            res.status(404).json({ error: "Job not found" });
            return;
        }
        const job = await prisma.job.update({
            where: { id: req.params.id },
            data: {
                ...data,
                status: JobStatus.PENDING_REVIEW, // Re-submit for review on update
            },
        });
        res.json(job);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        console.error("Update job error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/jobs/:id - Employer: delete own job
router.delete("/:id", authenticate, authorize(Role.EMPLOYER), async (req, res) => {
    try {
        const employer = await prisma.employer.findUnique({
            where: { userId: req.user.userId },
        });
        if (!employer) {
            res.status(400).json({ error: "Employer profile not found" });
            return;
        }
        const existingJob = await prisma.job.findFirst({
            where: { id: req.params.id, employerId: employer.id },
        });
        if (!existingJob) {
            res.status(404).json({ error: "Job not found" });
            return;
        }
        await prisma.job.delete({ where: { id: req.params.id } });
        res.json({ message: "Job deleted successfully" });
    }
    catch (error) {
        console.error("Delete job error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export default router;
//# sourceMappingURL=jobs.js.map