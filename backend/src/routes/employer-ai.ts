import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { EmployerAiTaskStatus, EmployerAiTaskType, Role } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { requireFeatureFlag } from "../middleware/feature-flags.js";
import logger from "../lib/logger.js";

const router = Router();

const aiToolLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 1000 : 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI tool requests. Please try again later." },
});

const jobDescriptionSchema = z.object({
  title: z.string().min(2).max(200),
  seniority: z.string().min(2).max(80),
  location: z.string().min(2).max(120),
  employmentType: z.string().min(2).max(80),
  responsibilities: z.array(z.string().min(3).max(300)).min(3).max(20),
  requirements: z.array(z.string().min(3).max(300)).min(3).max(20),
  companyContext: z.string().max(2000).optional(),
});

const candidateRankingSchema = z.object({
  jobId: z.string().uuid(),
  applicationIds: z.array(z.string().uuid()).max(200).optional(),
  topN: z.number().int().min(1).max(100).optional(),
});

const reviewTaskSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reviewNotes: z.string().max(2000).optional(),
});

function overlapScore(a: string[], b: string[]): number {
  const setA = new Set(a.map((item) => item.toLowerCase()));
  const setB = new Set(b.map((item) => item.toLowerCase()));
  let hits = 0;
  for (const value of setA) {
    if (setB.has(value)) hits += 1;
  }
  if (setA.size === 0) return 0;
  return Math.round((hits / setA.size) * 100);
}

function generateJobDescriptionDraft(input: z.infer<typeof jobDescriptionSchema>): string {
  const responsibilities = input.responsibilities.map((item) => `- ${item}`).join("\n");
  const requirements = input.requirements.map((item) => `- ${item}`).join("\n");
  return [
    `Role: ${input.title} (${input.seniority})`,
    `Location: ${input.location}`,
    `Employment Type: ${input.employmentType}`,
    "",
    "About the Role",
    `${input.companyContext || "Join a mission-driven team building career pathways and hiring outcomes across global markets."}`,
    "",
    "What You Will Do",
    responsibilities,
    "",
    "What We Are Looking For",
    requirements,
    "",
    "Hiring Team Note",
    "This AI draft is a starting point. A human reviewer must edit and approve before publishing.",
  ].join("\n");
}

router.use(requireFeatureFlag("PHASE4_EMPLOYER_AI_ENABLED"));
router.use(authenticate);
router.use(authorize(Role.EMPLOYER));

router.get("/tasks", async (req: Request, res: Response) => {
  try {
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true },
    });

    if (!employer) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const tasks = await prisma.employerAiTask.findMany({
      where: { employerId: employer.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json({ tasks });
  } catch (error) {
    logger.error({ error }, "Failed to list employer AI tasks");
    res.status(500).json({ error: "Failed to list employer AI tasks" });
  }
});

router.post("/job-description-drafts", aiToolLimiter, async (req: Request, res: Response) => {
  try {
    const input = jobDescriptionSchema.parse(req.body);
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true, companyName: true },
    });

    if (!employer) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const draft = generateJobDescriptionDraft(input);
    const task = await prisma.employerAiTask.create({
      data: {
        employerId: employer.id,
        createdByUserId: req.user!.userId,
        type: EmployerAiTaskType.JOB_DESCRIPTION_GENERATION,
        status: EmployerAiTaskStatus.GENERATED,
        title: `JD Draft · ${input.title}`,
        input,
        output: {
          companyName: employer.companyName,
          draftText: draft,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    res.status(201).json({
      task,
      draft,
      reviewRequired: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Failed to create JD draft");
    res.status(500).json({ error: "Failed to create JD draft" });
  }
});

router.post("/candidate-ranking-drafts", aiToolLimiter, async (req: Request, res: Response) => {
  try {
    const input = candidateRankingSchema.parse(req.body);
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true },
    });

    if (!employer) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const job = await prisma.job.findFirst({
      where: { id: input.jobId, employerId: employer.id },
      select: { id: true, title: true, tags: true, seniority: true },
    });

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const applications = await prisma.application.findMany({
      where: {
        jobId: job.id,
        ...(input.applicationIds?.length
          ? { id: { in: input.applicationIds } }
          : {}),
      },
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            candidateProfile: {
              select: { skills: true, yearsExperience: true, headline: true },
            },
          },
        },
      },
    });

    const ranked = applications.map((application) => {
      const skills = application.candidate.candidateProfile?.skills || [];
      const skillMatchScore = overlapScore(job.tags || [], skills);
      const experience = application.candidate.candidateProfile?.yearsExperience || 0;
      const experienceScore = Math.min(100, experience * 8);
      const finalScore = Math.round(skillMatchScore * 0.75 + experienceScore * 0.25);

      return {
        applicationId: application.id,
        candidateId: application.candidate.id,
        candidateName: application.candidate.name,
        score: finalScore,
        rationale: [
          `Skill overlap score: ${skillMatchScore}%`,
          `Experience score: ${experienceScore}%`,
          application.candidate.candidateProfile?.headline || "No profile headline provided",
        ],
      };
    }).sort((a, b) => b.score - a.score);

    const topN = input.topN || 20;
    const shortlist = ranked.slice(0, topN);

    const task = await prisma.employerAiTask.create({
      data: {
        employerId: employer.id,
        createdByUserId: req.user!.userId,
        type: EmployerAiTaskType.CANDIDATE_RANKING,
        status: EmployerAiTaskStatus.GENERATED,
        title: `Candidate Ranking · ${job.title}`,
        input,
        output: {
          jobId: job.id,
          jobTitle: job.title,
          rankedCandidates: shortlist,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    res.status(201).json({
      task,
      rankedCandidates: shortlist,
      reviewRequired: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Failed to create candidate ranking draft");
    res.status(500).json({ error: "Failed to create candidate ranking draft" });
  }
});

router.post("/tasks/:id/review", async (req: Request, res: Response) => {
  try {
    const data = reviewTaskSchema.parse(req.body);
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true },
    });

    if (!employer) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const task = await prisma.employerAiTask.findFirst({
      where: {
        id: req.params.id,
        employerId: employer.id,
      },
    });

    if (!task) {
      res.status(404).json({ error: "AI task not found" });
      return;
    }

    const updated = await prisma.employerAiTask.update({
      where: { id: task.id },
      data: {
        status: data.decision === "approve" ? EmployerAiTaskStatus.APPROVED : EmployerAiTaskStatus.REJECTED,
        humanApproved: data.decision === "approve",
        reviewedByUserId: req.user!.userId,
        reviewNotes: data.reviewNotes || null,
        reviewedAt: new Date(),
      },
    });

    res.json({
      task: updated,
      message: data.decision === "approve"
        ? "AI output approved for manual publishing."
        : "AI output rejected. Generate another draft if needed.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Failed to review AI task");
    res.status(500).json({ error: "Failed to review AI task" });
  }
});

export default router;

