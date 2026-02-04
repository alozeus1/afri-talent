import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { JobStatus, ReviewStatus, ReviewTargetType, Role } from "@prisma/client";
const router = Router();
// All admin routes require authentication and ADMIN role
router.use(authenticate, authorize(Role.ADMIN));
const reviewJobSchema = z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
    notes: z.string().optional(),
});
const reviewResourceSchema = z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
    notes: z.string().optional(),
});
// GET /api/admin/stats - Dashboard stats
router.get("/stats", async (_req, res) => {
    try {
        const [totalUsers, totalJobs, pendingJobs, totalApplications, totalResources,] = await Promise.all([
            prisma.user.count(),
            prisma.job.count(),
            prisma.job.count({ where: { status: JobStatus.PENDING_REVIEW } }),
            prisma.application.count(),
            prisma.resource.count(),
        ]);
        res.json({
            totalUsers,
            totalJobs,
            pendingJobs,
            totalApplications,
            totalResources,
        });
    }
    catch (error) {
        console.error("Stats error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/admin/jobs/pending - List jobs pending review
router.get("/jobs/pending", async (_req, res) => {
    try {
        const jobs = await prisma.job.findMany({
            where: { status: JobStatus.PENDING_REVIEW },
            include: {
                employer: {
                    select: { companyName: true, location: true },
                },
            },
            orderBy: { createdAt: "asc" },
        });
        res.json(jobs);
    }
    catch (error) {
        console.error("Pending jobs error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/admin/jobs - List all jobs
router.get("/jobs", async (req, res) => {
    try {
        const { status, page = "1", limit = "20" } = req.query;
        const where = {};
        if (status) {
            where.status = status;
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);
        const [jobs, total] = await Promise.all([
            prisma.job.findMany({
                where,
                include: {
                    employer: {
                        select: { companyName: true },
                    },
                    _count: { select: { applications: true } },
                },
                orderBy: { createdAt: "desc" },
                skip,
                take,
            }),
            prisma.job.count({ where }),
        ]);
        res.json({
            jobs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / take),
            },
        });
    }
    catch (error) {
        console.error("Admin jobs error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/admin/jobs/:id/review - Approve/reject job
router.put("/jobs/:id/review", async (req, res) => {
    try {
        const data = reviewJobSchema.parse(req.body);
        const job = await prisma.job.findUnique({
            where: { id: req.params.id },
        });
        if (!job) {
            res.status(404).json({ error: "Job not found" });
            return;
        }
        const newStatus = data.status === "APPROVED" ? JobStatus.PUBLISHED : JobStatus.REJECTED;
        const [updatedJob] = await prisma.$transaction([
            prisma.job.update({
                where: { id: req.params.id },
                data: {
                    status: newStatus,
                    publishedAt: data.status === "APPROVED" ? new Date() : null,
                },
            }),
            prisma.adminReview.create({
                data: {
                    reviewerId: req.user.userId,
                    targetType: ReviewTargetType.JOB,
                    targetJobId: req.params.id,
                    status: data.status === "APPROVED" ? ReviewStatus.APPROVED : ReviewStatus.REJECTED,
                    notes: data.notes,
                },
            }),
        ]);
        res.json(updatedJob);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        console.error("Review job error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/admin/users - List all users
router.get("/users", async (req, res) => {
    try {
        const { role, page = "1", limit = "20" } = req.query;
        const where = {};
        if (role) {
            where.role = role;
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);
        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    createdAt: true,
                    employer: {
                        select: { companyName: true },
                    },
                    _count: { select: { applications: true } },
                },
                orderBy: { createdAt: "desc" },
                skip,
                take,
            }),
            prisma.user.count({ where }),
        ]);
        res.json({
            users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / take),
            },
        });
    }
    catch (error) {
        console.error("Admin users error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/admin/resources - List all resources (including unpublished)
router.get("/resources", async (req, res) => {
    try {
        const { published, page = "1", limit = "20" } = req.query;
        const where = {};
        if (published !== undefined) {
            where.published = published === "true";
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);
        const [resources, total] = await Promise.all([
            prisma.resource.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take,
            }),
            prisma.resource.count({ where }),
        ]);
        res.json({
            resources,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / take),
            },
        });
    }
    catch (error) {
        console.error("Admin resources error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/admin/resources/:id/publish - Publish/unpublish resource
router.put("/resources/:id/publish", async (req, res) => {
    try {
        const { published } = req.body;
        const resource = await prisma.resource.findUnique({
            where: { id: req.params.id },
        });
        if (!resource) {
            res.status(404).json({ error: "Resource not found" });
            return;
        }
        const updatedResource = await prisma.resource.update({
            where: { id: req.params.id },
            data: {
                published: Boolean(published),
                publishedAt: published ? new Date() : null,
            },
        });
        res.json(updatedResource);
    }
    catch (error) {
        console.error("Publish resource error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/admin/reviews - List all admin reviews
router.get("/reviews", async (req, res) => {
    try {
        const { page = "1", limit = "20" } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);
        const [reviews, total] = await Promise.all([
            prisma.adminReview.findMany({
                include: {
                    reviewer: {
                        select: { name: true, email: true },
                    },
                    targetJob: {
                        select: { title: true, slug: true },
                    },
                    targetResource: {
                        select: { title: true, slug: true },
                    },
                },
                orderBy: { createdAt: "desc" },
                skip,
                take,
            }),
            prisma.adminReview.count(),
        ]);
        res.json({
            reviews,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / take),
            },
        });
    }
    catch (error) {
        console.error("Admin reviews error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export default router;
//# sourceMappingURL=admin.js.map