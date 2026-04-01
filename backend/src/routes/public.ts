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

export default router;
