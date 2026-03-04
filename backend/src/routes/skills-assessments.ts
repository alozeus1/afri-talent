import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { AssessmentProvider, AssessmentStatus, Role } from "@prisma/client";

const router = Router();

const COMMON_TECH_SKILLS = [
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Python",
  "Java",
  "SQL",
  "AWS",
  "Docker",
  "Kubernetes",
  "Go",
  "Rust",
  "GraphQL",
  "PostgreSQL",
  "MongoDB",
  "Redis",
  "Git",
  "CI/CD",
  "Agile",
  "System Design",
];

const startAssessmentSchema = z.object({
  skillName: z.string().min(1).max(100).trim(),
  provider: z.nativeEnum(AssessmentProvider).default(AssessmentProvider.INTERNAL),
});

const completeAssessmentSchema = z.object({
  score: z.number().int().min(0).max(100),
});

function calculateLevel(score: number): string {
  if (score <= 25) return "beginner";
  if (score <= 50) return "intermediate";
  if (score <= 75) return "advanced";
  return "expert";
}

// GET /api/skills-assessments/available — Public: list available skills for assessment
router.get("/available", async (_req: Request, res: Response) => {
  try {
    // Unique skill names from completed assessments
    const completedSkills = await prisma.skillAssessment.findMany({
      where: { status: AssessmentStatus.COMPLETED },
      select: { skillName: true },
      distinct: ["skillName"],
    });

    const completedSkillNames = completedSkills.map((s) => s.skillName);

    // Merge with common tech skills, deduplicated
    const allSkills = Array.from(
      new Set([...COMMON_TECH_SKILLS, ...completedSkillNames])
    ).sort();

    res.json({ skills: allSkills });
  } catch (error) {
    console.error("Available skills error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/skills-assessments — Authenticated: list user's skill assessments
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const assessments = await prisma.skillAssessment.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        skillName: true,
        provider: true,
        status: true,
        score: true,
        level: true,
        percentile: true,
        resultUrl: true,
        completedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    res.json(assessments);
  } catch (error) {
    console.error("List assessments error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/skills-assessments — Candidate: start self-assessment
router.post("/", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const data = startAssessmentSchema.parse(req.body);

    const assessment = await prisma.skillAssessment.create({
      data: {
        userId: req.user!.userId,
        skillName: data.skillName,
        provider: data.provider,
        status: AssessmentStatus.PENDING,
      },
    });

    res.status(201).json(assessment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Start assessment error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/skills-assessments/:id/complete — Authenticated: complete assessment
router.put("/:id/complete", authenticate, async (req: Request, res: Response) => {
  try {
    const data = completeAssessmentSchema.parse(req.body);

    const assessment = await prisma.skillAssessment.findUnique({
      where: { id: req.params.id },
    });

    if (!assessment) {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }

    if (assessment.userId !== req.user!.userId) {
      res.status(403).json({ error: "Not authorized to update this assessment" });
      return;
    }

    if (assessment.status === AssessmentStatus.COMPLETED) {
      res.status(400).json({ error: "Assessment already completed" });
      return;
    }

    const level = calculateLevel(data.score);

    const updatedAssessment = await prisma.skillAssessment.update({
      where: { id: req.params.id },
      data: {
        score: data.score,
        level,
        status: AssessmentStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    res.json(updatedAssessment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Complete assessment error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
