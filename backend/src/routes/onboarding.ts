// ─────────────────────────────────────────────────────────────────────────────
// Onboarding — "first look" instant matches
//
// The time-to-wow surface: every candidate (FREE plan included) gets ten real
// matched jobs within minutes of signing up. Matching is deterministic
// (skill/role overlap against live published jobs) so it costs zero AI tokens
// and needs no quota. The deeper AI matching remains behind its plan gate.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { Role, JobStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import logger from "../lib/logger.js";

const router = Router();
const log = logger.child({ route: "onboarding" });

router.use(authenticate, authorize(Role.CANDIDATE));

const MATCH_LIMIT = 10;
const CANDIDATE_POOL = 80;

interface InstantMatch {
  id: string;
  title: string;
  slug: string;
  location: string;
  type: string;
  workplaceType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  companyName: string;
  hiresFromAfrica: boolean;
  publishedAt: Date | null;
  matchedSkills: string[];
  matchScore: number;
}

const instantMatchSelect = {
  id: true,
  title: true,
  slug: true,
  location: true,
  type: true,
  workplaceType: true,
  salaryMin: true,
  salaryMax: true,
  currency: true,
  tags: true,
  hiresFromAfrica: true,
  publishedAt: true,
  sourceName: true,
  employer: { select: { companyName: true } },
} as const;

// GET /api/onboarding/instant-matches — free, deterministic top-10 matches
router.get("/instant-matches", async (req: Request, res: Response) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user!.userId },
      select: { skills: true, targetRoles: true, headline: true },
    });

    const skills = (profile?.skills ?? []).map((s) => s.toLowerCase()).slice(0, 20);
    const targetRoles = (profile?.targetRoles ?? []).map((r) => r.toLowerCase()).slice(0, 5);
    const profileReady = skills.length > 0 || targetRoles.length > 0;

    // Pull a candidate pool: skill-tag hits first, topped up with fresh
    // Africa-friendly roles so brand-new profiles still see a real feed.
    const skillMatched = profileReady
      ? await prisma.job.findMany({
          where: {
            status: JobStatus.PUBLISHED,
            isExpired: false,
            OR: [
              ...(skills.length ? [{ tags: { hasSome: skills } }] : []),
              ...targetRoles.map((role) => ({
                title: { contains: role, mode: "insensitive" as const },
              })),
            ],
          },
          orderBy: { publishedAt: "desc" },
          take: CANDIDATE_POOL,
          select: instantMatchSelect,
        })
      : [];

    const fillCount = CANDIDATE_POOL - skillMatched.length;
    const fill =
      fillCount > 0
        ? await prisma.job.findMany({
            where: {
              status: JobStatus.PUBLISHED,
              isExpired: false,
              hiresFromAfrica: true,
              id: { notIn: skillMatched.map((j) => j.id) },
            },
            orderBy: { publishedAt: "desc" },
            take: fillCount,
            select: instantMatchSelect,
          })
        : [];

    const matches: InstantMatch[] = [...skillMatched, ...fill]
      .map((job) => {
        const jobTags = job.tags.map((t) => t.toLowerCase());
        const matchedSkills = skills.filter((s) => jobTags.includes(s));
        const titleLower = job.title.toLowerCase();
        const roleHit = targetRoles.some((r) => titleLower.includes(r));

        let score = matchedSkills.length * 10;
        if (roleHit) score += 15;
        if (job.hiresFromAfrica) score += 10;
        if ((job.workplaceType ?? "").toLowerCase() === "remote") score += 5;
        if (job.salaryMin != null || job.salaryMax != null) score += 3;

        return {
          id: job.id,
          title: job.title,
          slug: job.slug,
          location: job.location,
          type: job.type,
          workplaceType: job.workplaceType,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          currency: job.currency,
          companyName: job.employer?.companyName ?? job.sourceName ?? "Company",
          hiresFromAfrica: job.hiresFromAfrica,
          publishedAt: job.publishedAt,
          matchedSkills: matchedSkills.slice(0, 5),
          matchScore: Math.min(score, 100),
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, MATCH_LIMIT);

    res.json({ profileReady, matches });
  } catch (error) {
    log.error({ error }, "instant-matches error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
