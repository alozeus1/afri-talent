// ─────────────────────────────────────────────────────────────────────────────
// Interview Experiences API Routes
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { Role } from "@prisma/client";

const router = Router();

// Validation schemas
const InterviewExperienceSchema = z.object({
  companyId: z.string().uuid(),
  jobTitle: z.string().min(1).max(200).trim(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  outcome: z.enum(["offered", "rejected", "no_response", "withdrew"]),
  interviewType: z.enum(["phone", "video", "onsite", "take_home", "panel"]),
  process: z.string().min(20).max(5000).trim(),
  questions: z.array(z.string().max(500)).max(20).default([]),
  tips: z.string().max(2000).trim().optional(),
  duration: z.string().max(50).trim().optional(),
});

// GET /api/interview-experiences — list interview experiences with filters
router.get("/", async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const companyId = req.query.companyId as string;
  const jobTitle = req.query.jobTitle as string;
  const difficulty = req.query.difficulty as string;
  const outcome = req.query.outcome as string;

  try {
    const where: Record<string, unknown> = { isApproved: true };

    if (companyId) {
      where.companyId = companyId;
    }
    if (jobTitle) {
      where.jobTitle = { contains: jobTitle, mode: "insensitive" };
    }
    if (difficulty) {
      where.difficulty = difficulty;
    }
    if (outcome) {
      where.outcome = outcome;
    }

    const [experiences, total] = await Promise.all([
      prisma.interviewExperience.findMany({
        where,
        include: {
          company: {
            select: { id: true, name: true, logo: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.interviewExperience.count({ where }),
    ]);

    // Strip userId from results for anonymity
    const sanitized = experiences.map(({ userId, ...rest }) => rest);

    res.json({
      experiences: sanitized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch interview experiences" });
  }
});

// GET /api/interview-experiences/companies/:companyId/summary — company interview summary
router.get("/companies/:companyId/summary", async (req: Request, res: Response) => {
  const { companyId } = req.params;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const experiences = await prisma.interviewExperience.findMany({
      where: { companyId, isApproved: true },
      select: {
        difficulty: true,
        outcome: true,
        questions: true,
      },
    });

    const totalInterviews = experiences.length;

    // Difficulty breakdown
    const difficultyBreakdown: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
    for (const exp of experiences) {
      if (exp.difficulty in difficultyBreakdown) {
        difficultyBreakdown[exp.difficulty]++;
      }
    }

    // Outcome breakdown
    const outcomeBreakdown: Record<string, number> = {
      offered: 0,
      rejected: 0,
      no_response: 0,
      withdrew: 0,
    };
    for (const exp of experiences) {
      if (exp.outcome in outcomeBreakdown) {
        outcomeBreakdown[exp.outcome]++;
      }
    }

    // Common question themes (most frequent words from questions, simple approach)
    const allQuestions = experiences.flatMap((e) => e.questions);
    const wordCounts: Record<string, number> = {};
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "do", "does", "did",
      "to", "of", "in", "for", "on", "with", "at", "by", "from", "and",
      "or", "but", "not", "you", "your", "how", "what", "why", "when",
      "where", "who", "which", "that", "this", "it", "be", "have", "has",
      "had", "can", "will", "would", "could", "should", "may", "might",
      "me", "my", "i", "we", "they", "them", "about", "if", "as",
    ]);
    for (const q of allQuestions) {
      const words = q.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/);
      for (const word of words) {
        if (word.length > 2 && !stopWords.has(word)) {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
      }
    }
    const commonThemes = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));

    res.json({
      company,
      summary: {
        totalInterviews,
        difficultyBreakdown,
        outcomeBreakdown,
        commonQuestionThemes: commonThemes,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch company interview summary" });
  }
});

// GET /api/interview-experiences/:id — single interview experience detail
router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const experience = await prisma.interviewExperience.findUnique({
      where: { id },
      include: {
        company: {
          select: { id: true, name: true, logo: true },
        },
      },
    });

    if (!experience || !experience.isApproved) {
      res.status(404).json({ error: "Interview experience not found" });
      return;
    }

    // Strip userId for anonymity
    const { userId, ...sanitized } = experience;

    res.json({ experience: sanitized });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch interview experience" });
  }
});

// POST /api/interview-experiences — submit interview experience (candidates only)
router.post("/", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  const parsed = InterviewExperienceSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  try {
    // Validate company exists
    const company = await prisma.company.findUnique({
      where: { id: parsed.data.companyId },
    });
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const experience = await prisma.interviewExperience.create({
      data: {
        userId: req.user!.userId,
        ...parsed.data,
        isApproved: false,
      },
    });

    res.status(201).json({
      experience,
      message: "Interview experience submitted for moderation",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit interview experience" });
  }
});

// POST /api/interview-experiences/:id/helpful — increment helpful count
router.post("/:id/helpful", authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const experience = await prisma.interviewExperience.findUnique({
      where: { id },
    });

    if (!experience || !experience.isApproved) {
      res.status(404).json({ error: "Interview experience not found" });
      return;
    }

    await prisma.interviewExperience.update({
      where: { id },
      data: { helpfulCount: { increment: 1 } },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark as helpful" });
  }
});

export default router;
