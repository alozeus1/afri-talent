import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { Role } from "@prisma/client";

const router = Router();

// GET /api/learning/categories — public. Return distinct categories.
router.get("/categories", async (_req: Request, res: Response) => {
  try {
    const resources = await prisma.learningResource.findMany({
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });

    const categories = resources.map((r) => r.category);
    res.json(categories);
  } catch (error) {
    console.error("List learning categories error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/learning/recommended — authenticated candidates only. Recommend courses based on skill gaps.
router.get("/recommended", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user!.userId },
      select: { skills: true },
    });

    if (!profile || profile.skills.length === 0) {
      // No skills on profile — return featured resources as fallback
      const featured = await prisma.learningResource.findMany({
        where: { featured: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      res.json(featured);
      return;
    }

    const candidateSkills = profile.skills.map((s) => s.toLowerCase());

    // Find learning resources whose skills DON'T overlap with the candidate's skills
    // (to fill gaps — skills the candidate doesn't have)
    const allResources = await prisma.learningResource.findMany({
      where: {
        NOT: {
          skills: { hasSome: profile.skills },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Also try case-insensitive filtering for better matching
    const recommended = allResources.filter((resource) => {
      const resourceSkills = resource.skills.map((s) => s.toLowerCase());
      // Keep resources where none of the resource's skills are in candidate's skills
      return !resourceSkills.some((rs) => candidateSkills.includes(rs));
    });

    res.json(recommended.slice(0, 10));
  } catch (error) {
    console.error("Recommended learning error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/learning — public. List learning resources with filters.
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      category,
      skills,
      difficulty,
      isFree,
      featured,
      page = "1",
      limit = "10",
    } = req.query;

    const where: any = {};

    if (category) {
      where.category = category as string;
    }

    if (skills) {
      const skillList = (skills as string).split(",").map((s) => s.trim());
      where.skills = { hasSome: skillList };
    }

    if (difficulty) {
      where.difficulty = difficulty as string;
    }

    if (isFree !== undefined) {
      where.isFree = isFree === "true";
    }

    if (featured !== undefined) {
      where.featured = featured === "true";
    }

    const parsedLimit = Math.min(parseInt(limit as string) || 10, 100);
    const skip = (parseInt(page as string) - 1) * parsedLimit;

    const [resources, total] = await Promise.all([
      prisma.learningResource.findMany({
        where,
        orderBy: [
          { featured: "desc" },
          { createdAt: "desc" },
        ],
        skip,
        take: parsedLimit,
      }),
      prisma.learningResource.count({ where }),
    ]);

    res.json({
      resources,
      pagination: {
        page: parseInt(page as string),
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    console.error("List learning resources error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/learning/:id — public. Single learning resource.
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const resource = await prisma.learningResource.findUnique({
      where: { id: req.params.id },
    });

    if (!resource) {
      res.status(404).json({ error: "Learning resource not found" });
      return;
    }

    res.json(resource);
  } catch (error) {
    console.error("Get learning resource error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
