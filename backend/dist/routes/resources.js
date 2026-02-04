import { Router } from "express";
import prisma from "../lib/prisma.js";
const router = Router();
// GET /api/resources - Public: list published resources
router.get("/", async (req, res) => {
    try {
        const { category, search, page = "1", limit = "10" } = req.query;
        const where = { published: true };
        if (category) {
            where.category = category;
        }
        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { excerpt: { contains: search, mode: "insensitive" } },
            ];
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);
        const [resources, total] = await Promise.all([
            prisma.resource.findMany({
                where,
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    excerpt: true,
                    category: true,
                    coverImage: true,
                    publishedAt: true,
                },
                orderBy: { publishedAt: "desc" },
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
        console.error("List resources error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/resources/categories - Public: list unique categories
router.get("/categories", async (_req, res) => {
    try {
        const resources = await prisma.resource.findMany({
            where: { published: true },
            select: { category: true },
            distinct: ["category"],
        });
        const categories = resources.map((r) => r.category);
        res.json(categories);
    }
    catch (error) {
        console.error("List categories error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/resources/:slug - Public: get single resource
router.get("/:slug", async (req, res) => {
    try {
        const resource = await prisma.resource.findUnique({
            where: { slug: req.params.slug },
        });
        if (!resource || !resource.published) {
            res.status(404).json({ error: "Resource not found" });
            return;
        }
        res.json(resource);
    }
    catch (error) {
        console.error("Get resource error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export default router;
//# sourceMappingURL=resources.js.map