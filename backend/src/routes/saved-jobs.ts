// ─────────────────────────────────────────────────────────────────────────────
// Saved Jobs — candidate bookmarks (roadmap Phase 2/D)
//
// GET    /api/saved-jobs        — list the caller's saved jobs (newest first)
// GET    /api/saved-jobs/ids    — job-id set for fast client-side "saved" state
// POST   /api/saved-jobs        — save { jobId } (idempotent via upsert)
// DELETE /api/saved-jobs/:jobId — unsave
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { z } from "zod/v4";
import { Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import logger from "../lib/logger.js";

const router = Router();
const log = logger.child({ route: "saved-jobs" });

router.use(authenticate, authorize(Role.CANDIDATE));

const saveSchema = z.object({ jobId: z.string().uuid() });
const MAX_SAVED_JOBS = 200;

router.get("/", async (req: Request, res: Response) => {
  try {
    const saved = await prisma.savedJob.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: MAX_SAVED_JOBS,
      include: {
        job: {
          select: {
            id: true, title: true, slug: true, location: true, type: true,
            workplaceType: true, salaryMin: true, salaryMax: true, currency: true,
            hiresFromAfrica: true, isExpired: true, publishedAt: true,
            eligibleCountries: true, visaSponsorship: true,
            sourceName: true, employer: { select: { companyName: true } },
          },
        },
      },
    });
    res.json({ saved });
  } catch (error) {
    log.error({ error }, "list saved jobs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/ids", async (req: Request, res: Response) => {
  try {
    const rows = await prisma.savedJob.findMany({
      where: { userId: req.user!.userId },
      select: { jobId: true },
      take: MAX_SAVED_JOBS,
    });
    res.json({ jobIds: rows.map((r) => r.jobId) });
  } catch (error) {
    log.error({ error }, "saved job ids error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { jobId } = saveSchema.parse(req.body);
    const userId = req.user!.userId;

    const count = await prisma.savedJob.count({ where: { userId } });
    if (count >= MAX_SAVED_JOBS) {
      res.status(400).json({ error: `You can save up to ${MAX_SAVED_JOBS} jobs — remove some first.` });
      return;
    }

    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const saved = await prisma.savedJob.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId },
      update: {},
    });
    res.status(201).json({ saved: { id: saved.id, jobId } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.issues });
      return;
    }
    log.error({ error }, "save job error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:jobId", async (req: Request, res: Response) => {
  try {
    await prisma.savedJob.deleteMany({
      where: { userId: req.user!.userId, jobId: req.params.jobId },
    });
    res.json({ success: true });
  } catch (error) {
    log.error({ error }, "unsave job error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
