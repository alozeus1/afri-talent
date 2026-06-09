import { Router, Request, Response } from "express";
import { LearningFeedbackStatus, LearningProgressStatus, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate, authorize, optionalAuth } from "../middleware/auth.js";
import { z } from "zod";

const router = Router();

const submitFeedbackSchema = z.object({
  areaSlug: z.string().trim().min(1).max(120),
  lessonTitle: z.string().trim().min(1).max(200).optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(10).max(2000),
  attachPhoto: z.boolean().default(false),
});

const moderateFeedbackSchema = z.object({
  action: z.enum(["approve", "reject"]),
  moderationNotes: z.string().trim().max(1000).optional(),
});

const updateProgressSchema = z.object({
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]),
  lastStepIndex: z.number().int().min(0).max(100).optional(),
});

function formatFeedbackRecord(
  feedback: {
    id: string;
    areaSlug: string;
    lessonTitle: string | null;
    firstName: string;
    lastName: string;
    rating: number;
    comment: string;
    attachPhoto: boolean;
    avatarUrlSnapshot: string | null;
    displayName: string;
    status: LearningFeedbackStatus;
    approvedAt: Date | null;
    moderationNotes: string | null;
    createdAt: Date;
    userId: string | null;
  },
  options: { adminView: boolean } = { adminView: false },
) {
  return {
    id: feedback.id,
    areaSlug: feedback.areaSlug,
    lessonTitle: feedback.lessonTitle,
    firstName: feedback.firstName,
    lastName: feedback.lastName,
    displayName: feedback.userId ? `${feedback.firstName} ${feedback.lastName}` : "Anonymous",
    rating: feedback.rating,
    comment: feedback.comment,
    avatarUrl: feedback.attachPhoto && feedback.avatarUrlSnapshot ? feedback.avatarUrlSnapshot : null,
    status: feedback.status,
    approvedAt: feedback.approvedAt,
    moderationNotes: options.adminView ? feedback.moderationNotes : undefined,
    createdAt: feedback.createdAt,
  };
}

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

// POST /api/learning/feedback — Public, optional auth. Submit learner feedback for moderation.
router.post("/feedback", optionalAuth, async (req: Request, res: Response) => {
  try {
    const data = submitFeedbackSchema.parse(req.body);

    if (req.user?.role && req.user.role !== Role.CANDIDATE) {
      res.status(403).json({ error: "Only candidates can submit learning feedback" });
      return;
    }

    const user = req.user
      ? await prisma.user.findUnique({
          where: { id: req.user.userId },
          select: { id: true, avatarUrl: true, name: true, role: true },
        })
      : null;

    if (req.user && !user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const created = await prisma.learningFeedback.create({
      data: {
        areaSlug: data.areaSlug,
        lessonTitle: data.lessonTitle ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        userId: user?.role === Role.CANDIDATE ? user.id : null,
        rating: data.rating,
        comment: data.comment,
        attachPhoto: data.attachPhoto && Boolean(user?.avatarUrl),
        avatarUrlSnapshot: data.attachPhoto ? user?.avatarUrl ?? null : null,
        displayName: user ? `${data.firstName} ${data.lastName}` : "Anonymous",
      },
    });

    res.status(201).json({
      feedback: formatFeedbackRecord(created),
      message: "Feedback submitted for admin approval",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Submit learning feedback error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/learning/feedback — Public approved feedback, or admin moderation list when authenticated.
router.get("/feedback", optionalAuth, async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "8"), 10) || 8, 1), 50);
    const areaSlug = typeof req.query.areaSlug === "string" ? req.query.areaSlug.trim() : undefined;
    const statusParam = typeof req.query.status === "string" ? req.query.status.trim().toUpperCase() : undefined;
    const isAdmin = req.user?.role === Role.ADMIN;

    const where: Record<string, unknown> = {};
    if (areaSlug) {
      where.areaSlug = areaSlug;
    }
    if (isAdmin) {
      if (statusParam && ["PENDING", "APPROVED", "REJECTED"].includes(statusParam)) {
        where.status = statusParam as LearningFeedbackStatus;
      }
    } else {
      where.status = LearningFeedbackStatus.APPROVED;
    }

    const [feedback, total] = await Promise.all([
      prisma.learningFeedback.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.learningFeedback.count({ where }),
    ]);

    res.json({
      feedback: feedback.map((entry) => formatFeedbackRecord(entry, { adminView: isAdmin })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("List learning feedback error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/learning/feedback/:id/moderate — Admin moderation.
router.put("/feedback/:id/moderate", authenticate, authorize(Role.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = moderateFeedbackSchema.parse(req.body);
    const existing = await prisma.learningFeedback.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      res.status(404).json({ error: "Feedback not found" });
      return;
    }

    const updated = await prisma.learningFeedback.update({
      where: { id: req.params.id },
      data: {
        status: data.action === "approve" ? LearningFeedbackStatus.APPROVED : LearningFeedbackStatus.REJECTED,
        approvedAt: data.action === "approve" ? new Date() : null,
        approvedById: req.user!.userId,
        moderationNotes: data.moderationNotes ?? null,
      },
    });

    res.json({ feedback: formatFeedbackRecord(updated, { adminView: true }) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Moderate learning feedback error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/learning/progress — authenticated candidates. Return persisted course progress.
router.get("/progress", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const progress = await prisma.learningProgress.findMany({
      where: { userId: req.user!.userId },
      orderBy: { updatedAt: "desc" },
    });

    res.json({ progress });
  } catch (error) {
    console.error("List learning progress error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/learning/:id/progress — authenticated candidates. Upsert course progress.
router.put("/:id/progress", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const data = updateProgressSchema.parse(req.body);
    const completedAt = data.status === LearningProgressStatus.COMPLETED ? new Date() : null;

    const progress = await prisma.learningProgress.upsert({
      where: {
        userId_resourceId: {
          userId: req.user!.userId,
          resourceId: req.params.id,
        },
      },
      create: {
        userId: req.user!.userId,
        resourceId: req.params.id,
        status: data.status,
        lastStepIndex: data.lastStepIndex ?? 0,
        completedAt,
      },
      update: {
        status: data.status,
        ...(data.lastStepIndex !== undefined && { lastStepIndex: data.lastStepIndex }),
        completedAt,
      },
    });

    res.json({ progress });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Update learning progress error:", error);
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
