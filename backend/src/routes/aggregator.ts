// ─────────────────────────────────────────────────────────────────────────────
// Job Aggregator API Routes - Manual and scheduled job syncing
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import prisma from "../lib/prisma.js";
import { getJobAggregator } from "../lib/jobs/aggregator/index.js";
import type { JobQuery } from "../lib/jobs/aggregator/sources/base.js";

const router = Router();
const aggregator = getJobAggregator(prisma);

// POST /api/aggregator/sync - Trigger manual job sync (Admin only)
router.post("/sync", authenticate, authorize("ADMIN"), async (req, res) => {
  const {
    keywords = ["software engineer", "developer", "devops", "data scientist", "data analyst", "ux/ui", "graphic designer", "cloud engineer", "Devops engineer", "Devops Engineer", "software engineer", "software developer", "Data engineer", "Data Analyst", "Data Scientist", "AI Engineer", "AI Developer", "AI Scientist", "AI Analyst", "Machine learning Engineer", "Machine learning Developer", "Machine learning Scientist", "Machine learning Analyst", "platform engineer", "platform developer", "platform scientist", "platform analyst", "cybersecurity engineer", "cybersecurity analyst", "cybersecurity scientist", "cybersecurity developer", "site reliability engineer", "site reliability developer", "site reliability scientist", "site reliability analyst", "ML Engineer", "ML Developer", "ML Scientist", "ML Analyst", "Frontend Engineer", "Frontend Developer", "Frontend Scientist", "Frontend Analyst", "Backend Engineer", "Backend Developer", "Backend Scientist", "Backend Analyst", "Fullstack Engineer", "Fullstack Developer", "Fullstack Scientist", "Fullstack Analyst", "UI Engineer", "UI Developer", "UI Scientist", "UI Analyst", "UX Engineer", "UX Developer", "UX Scientist", "UX Analyst", "product designer", "product manager", "QA Engineer", "QA Developer", "QA Scientist", "QA Analyst"],
    postedWithinDays = 21,
    limit = 500,
  } = req.body as Partial<JobQuery & { limit: number }>;

  try {
    const query: JobQuery = {
      keywords,
      postedWithinDays,
      limit,
      remote: true,
    };

    const result = await aggregator.syncJobsToDatabase(query);

    res.json({
      success: true,
      message: `Synced ${result.total} jobs`,
      stats: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Job sync failed",
      details: String(error),
    });
  }
});

// GET /api/aggregator/sources - List available job sources
router.get("/sources", authenticate, async (_req, res) => {
  const sources = aggregator.getEnabledSources();
  res.json({ sources });
});

// GET /api/aggregator/preview - Preview jobs without saving (Admin only)
router.get("/preview", authenticate, authorize("ADMIN"), async (req, res) => {
  const keywords = (req.query.keywords as string)?.split(",") || ["software engineer"];
  const limit = parseInt(req.query.limit as string) || 50;

  try {
    const query: JobQuery = {
      keywords,
      postedWithinDays: 21,
      limit,
    };

    const results = await aggregator.aggregateJobs(query);
    const allJobs = results.flatMap((r) => r.jobs);
    const africaFriendly = aggregator.filterAfricaFriendly(allJobs);

    res.json({
      totalJobs: allJobs.length,
      africaFriendlyJobs: africaFriendly.length,
      bySource: results.map((r) => ({
        source: r.source,
        count: r.jobs.length,
        errors: r.errors,
      })),
      preview: africaFriendly.slice(0, 10).map((j) => ({
        title: j.title,
        company: j.company,
        location: j.location,
        region: j.region,
        visaSponsorship: j.visaSponsorship,
        source: j.source,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: "Preview failed",
      details: String(error),
    });
  }
});

// GET /api/aggregator/stats - Get aggregation statistics
router.get("/stats", authenticate, authorize("ADMIN"), async (_req, res) => {
  try {
    const stats = await prisma.job.groupBy({
      by: ["jobSource"],
      _count: { id: true },
      where: { status: "PUBLISHED" },
    });

    const byRegion = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN location ILIKE '%remote%' THEN 'REMOTE_GLOBAL'
          WHEN "eligibleCountries" && ARRAY['NG', 'KE', 'GH', 'ZA', 'EG'] THEN 'AFRICA'
          WHEN location ILIKE '%usa%' OR location ILIKE '%canada%' OR location ILIKE '%united states%' THEN 'NORTH_AMERICA'
          WHEN location ILIKE '%uk%' OR location ILIKE '%germany%' OR location ILIKE '%france%' OR location ILIKE '%netherlands%' THEN 'EUROPE'
          ELSE 'OTHER'
        END as region,
        COUNT(*) as count
      FROM "Job"
      WHERE status = 'PUBLISHED'
      GROUP BY region
    `;

    const recentSync = await prisma.job.findFirst({
      where: { jobSource: "AGGREGATED" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });

    res.json({
      bySource: stats,
      byRegion,
      lastSync: recentSync?.updatedAt,
      enabledSources: aggregator.getEnabledSources(),
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch stats",
      details: String(error),
    });
  }
});

export default router;
