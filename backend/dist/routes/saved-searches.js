// ─────────────────────────────────────────────────────────────────────────────
// Saved Searches & Job Alerts API Routes
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import prisma from "../lib/prisma.js";
import { buildPreferenceContext, buildJobSearchWhere, fetchRankedJobs } from "../lib/jobs/search.js";
const router = Router();
// Validation schemas
const SavedSearchSchema = z.object({
    name: z.string().min(1).max(100),
    keywords: z.array(z.string()).default([]),
    locations: z.array(z.string()).default([]),
    jobTypes: z.array(z.string()).default([]),
    seniorities: z.array(z.string()).default([]),
    salaryMin: z.number().int().positive().optional(),
    salaryMax: z.number().int().positive().optional(),
    remoteOnly: z.boolean().default(false),
    visaSponsorship: z.boolean().default(false),
    alertEnabled: z.boolean().default(true),
    alertFrequency: z.enum(["INSTANT", "DAILY", "WEEKLY"]).default("DAILY"),
});
// GET /api/saved-searches - List user's saved searches
router.get("/", authenticate, async (req, res) => {
    const userId = req.user.userId;
    try {
        const searches = await prisma.savedSearch.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
        });
        // Get match counts for each search
        const searchesWithCounts = await Promise.all(searches.map(async (search) => {
            const matchCount = await countMatchingJobs(search);
            return { ...search, matchCount };
        }));
        res.json({ savedSearches: searchesWithCounts });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch saved searches" });
    }
});
// POST /api/saved-searches - Create a new saved search
router.post("/", authenticate, authorize("CANDIDATE"), async (req, res) => {
    const userId = req.user.userId;
    const parsed = SavedSearchSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    try {
        // Limit saved searches per user
        const existingCount = await prisma.savedSearch.count({ where: { userId } });
        if (existingCount >= 10) {
            return res.status(400).json({ error: "Maximum 10 saved searches allowed" });
        }
        const search = await prisma.savedSearch.create({
            data: {
                userId,
                ...parsed.data,
            },
        });
        res.status(201).json({ savedSearch: search });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create saved search" });
    }
});
// PUT /api/saved-searches/:id - Update a saved search
router.put("/:id", authenticate, async (req, res) => {
    const userId = req.user.userId;
    const { id } = req.params;
    const parsed = SavedSearchSchema.partial().safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    try {
        const search = await prisma.savedSearch.findFirst({
            where: { id, userId },
        });
        if (!search) {
            return res.status(404).json({ error: "Saved search not found" });
        }
        const updated = await prisma.savedSearch.update({
            where: { id },
            data: parsed.data,
        });
        res.json({ savedSearch: updated });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update saved search" });
    }
});
// DELETE /api/saved-searches/:id - Delete a saved search
router.delete("/:id", authenticate, async (req, res) => {
    const userId = req.user.userId;
    const { id } = req.params;
    try {
        const search = await prisma.savedSearch.findFirst({
            where: { id, userId },
        });
        if (!search) {
            return res.status(404).json({ error: "Saved search not found" });
        }
        await prisma.savedSearch.delete({ where: { id } });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to delete saved search" });
    }
});
// GET /api/saved-searches/:id/jobs - Get jobs matching a saved search
router.get("/:id/jobs", authenticate, async (req, res) => {
    const userId = req.user.userId;
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    try {
        const search = await prisma.savedSearch.findFirst({
            where: { id, userId },
        });
        if (!search) {
            return res.status(404).json({ error: "Saved search not found" });
        }
        const { jobs, total } = await findMatchingJobs(search, page, limit);
        res.json({
            jobs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch matching jobs" });
    }
});
// Helper functions
async function countMatchingJobs(search) {
    const where = buildJobSearchWhere(toJobSearchFilters(search));
    return prisma.job.count({ where });
}
async function findMatchingJobs(search, page, limit) {
    const filters = toJobSearchFilters(search);
    return fetchRankedJobs({
        where: buildJobSearchWhere(filters),
        page,
        limit,
        preferenceContext: buildPreferenceContext(filters),
    });
}
function toJobSearchFilters(search) {
    return {
        search: search.keywords.join(" ").trim() || undefined,
        location: search.locations[0] || undefined,
        type: search.jobTypes[0] || undefined,
        seniority: search.seniorities[0] || undefined,
        salaryMin: search.salaryMin ?? null,
        salaryMax: search.salaryMax ?? null,
        remote: search.remoteOnly,
        visaSponsorship: search.visaSponsorship ? "YES" : undefined,
    };
}
export default router;
//# sourceMappingURL=saved-searches.js.map