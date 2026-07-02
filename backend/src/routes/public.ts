import { Router, Request, Response } from "express";
import { Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { getCachedJson, setCachedJson } from "../lib/cache.js";

const router = Router();

// GET /api/public/stats - Public marketing stats for homepage hero cards
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const cacheKey = "public:hero-stats:v1";
    const cached = await getCachedJson<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      res.setHeader("X-Cache", "HIT");
      res.json(cached);
      return;
    }

    const [activeCandidates, partnerCompanies, jobsPosted] = await Promise.all([
      prisma.user.count({ where: { role: Role.CANDIDATE } }),
      prisma.employer.count(),
      prisma.job.count({
        where: {
          status: "PUBLISHED",
          isExpired: false,
        },
      }),
    ]);

    const payload = {
      activeCandidates,
      partnerCompanies,
      jobsPosted,
      africanCountries: 54,
      lastUpdated: new Date().toISOString(),
    };
    await setCachedJson(cacheKey, payload, 300);
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
  } catch (error) {
    console.error("Public stats error:", error);
    res.status(500).json({ error: "Failed to load platform stats" });
  }
});

// GET /api/public/market-pulse — weekly market insights for the homepage.
// Real internal data (no estimates): computed from live published jobs.
router.get("/market-pulse", async (_req: Request, res: Response) => {
  try {
    const cacheKey = "public:market-pulse:v1";
    const cached = await getCachedJson<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=7200");
      res.setHeader("X-Cache", "HIT");
      res.json(cached);
      return;
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const publishedWhere = { status: "PUBLISHED" as const, isExpired: false };

    const [jobsThisWeek, totalOpen, africaFriendly, remoteCount, salaryTransparent, recentJobs] =
      await Promise.all([
        prisma.job.count({ where: { ...publishedWhere, createdAt: { gte: weekAgo } } }),
        prisma.job.count({ where: publishedWhere }),
        prisma.job.count({ where: { ...publishedWhere, hiresFromAfrica: true } }),
        prisma.job.count({
          where: { ...publishedWhere, location: { contains: "remote", mode: "insensitive" } },
        }),
        prisma.job.count({ where: { ...publishedWhere, salaryMin: { not: null } } }),
        prisma.job.findMany({
          where: { ...publishedWhere, createdAt: { gte: weekAgo } },
          select: { tags: true },
          take: 500,
        }),
      ]);

    // Top in-demand skills from this week's job tags
    const skillCounts = new Map<string, number>();
    for (const job of recentJobs) {
      for (const tag of job.tags.slice(0, 8)) {
        const key = tag.trim().toLowerCase();
        if (key.length < 2) continue;
        skillCounts.set(key, (skillCounts.get(key) ?? 0) + 1);
      }
    }
    const topSkills = [...skillCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([skill, count]) => ({ skill, count }));

    const pct = (n: number) => (totalOpen > 0 ? Math.round((n / totalOpen) * 100) : 0);

    const payload = {
      jobsThisWeek,
      totalOpenJobs: totalOpen,
      africaFriendlyJobs: africaFriendly,
      africaFriendlyShare: pct(africaFriendly),
      remoteShare: pct(remoteCount),
      salaryTransparencyShare: pct(salaryTransparent),
      topSkills,
      weekOf: weekAgo.toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    await setCachedJson(cacheKey, payload, 3600);
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=7200");
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
  } catch (error) {
    console.error("Market pulse error:", error);
    res.status(500).json({ error: "Failed to load market pulse" });
  }
});

export default router;
