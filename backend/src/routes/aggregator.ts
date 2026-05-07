// ─────────────────────────────────────────────────────────────────────────────
// Job Aggregator API Routes - Manual and scheduled job syncing
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import prisma from "../lib/prisma.js";
import { JobAggregator, getJobAggregator } from "../lib/jobs/aggregator/index.js";
import type { JobQuery } from "../lib/jobs/aggregator/sources/base.js";
import { JOB_FIELDS } from "../lib/jobs/aggregator/taxonomy.js";
import type { CompanyCareerSourceConfig, CompanyCareerProvider } from "../lib/jobs/aggregator/sources/company-careers.js";

const router = Router();
const aggregator = getJobAggregator(prisma);

const DEFAULT_FIELD_KEYWORDS = [
  "software engineer", "developer", "devops", "data scientist", "data analyst", "ux/ui",
  "graphic designer", "cloud engineer", "product designer", "product manager", "QA engineer",
  "nurse", "clinical", "doctor", "physician", "pharmacist", "caregiver",
  "accountant", "accounting", "finance analyst", "auditor", "bookkeeper", "payroll",
  "sales manager", "account executive", "business development", "customer success",
  "customer support", "technical support", "call center",
  "marketing specialist", "content marketer", "seo", "brand manager", "growth manager",
  "operations manager", "program manager", "project manager", "supply chain", "logistics",
  "human resources", "recruiter", "talent acquisition", "people operations",
  "legal counsel", "compliance", "paralegal", "teacher", "instructor", "tutor",
  "mechanical engineer", "electrical engineer", "civil engineer", "technician",
  "electrician", "welder", "mechanic", "hospitality", "hotel", "chef", "nonprofit",
];

function isCompanyCareerProvider(value: string): value is CompanyCareerProvider {
  return ["GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS", "RECRUITEE", "GENERIC"].includes(value);
}

async function loadActiveCompanyCareerSources(): Promise<CompanyCareerSourceConfig[]> {
  const sources = await prisma.companyCareerSource.findMany({
    where: {
      active: true,
      allowedToCrawl: true,
    },
    orderBy: [
      { priority: "asc" },
      { companyName: "asc" },
    ],
  });

  return sources.flatMap((source) => {
    if (!source.providerKey || !isCompanyCareerProvider(source.provider)) {
      return [];
    }
    return [{
      id: source.id,
      provider: source.provider,
      providerKey: source.providerKey,
      companyName: source.companyName,
      careersUrl: source.careersUrl,
      targetFields: source.targetFields,
      enabled: source.active && source.allowedToCrawl,
    }];
  });
}

// POST /api/aggregator/sync - Trigger manual job sync (Admin only)
router.post("/sync", authenticate, authorize("ADMIN"), async (req, res) => {
  const {
    keywords = DEFAULT_FIELD_KEYWORDS,
    fields,
    remote,
    workplaceTypes,
    visaSponsorship,
    relocationAssistance,
    postedWithinDays = 21,
    limit = 800,
  } = req.body as Partial<JobQuery & { limit: number }>;

  try {
    const dbCompanySources = await loadActiveCompanyCareerSources();
    const syncAggregator = dbCompanySources.length > 0
      ? new JobAggregator(prisma, dbCompanySources)
      : aggregator;
    const query: JobQuery = {
      keywords,
      includeAllCompanyJobs: true,
      fields,
      postedWithinDays,
      limit,
      remote,
      workplaceTypes,
      visaSponsorship,
      relocationAssistance,
    };

    const result = await syncAggregator.syncJobsToDatabase(query);
    const companyApiDiagnostics = result.diagnostics.sourceDiagnostics.find((entry) => entry.source === "COMPANY_API");
    if (dbCompanySources.length > 0 && companyApiDiagnostics) {
      await prisma.companyCareerSource.updateMany({
        where: {
          providerKey: { in: dbCompanySources.map((source) => source.providerKey) },
        },
        data: companyApiDiagnostics.status === "success"
          ? {
              lastCrawledAt: new Date(),
              lastSuccessAt: new Date(),
              failureReason: null,
              consecutiveFailures: 0,
            }
          : {
              lastCrawledAt: new Date(),
              failureReason: companyApiDiagnostics.failureReason ?? "source_fetch_failed",
              consecutiveFailures: { increment: 1 },
            },
      });
    }

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

// GET /api/aggregator/fields - List normalized occupational fields
router.get("/fields", authenticate, async (_req, res) => {
  res.json({ fields: JOB_FIELDS });
});

// GET /api/aggregator/company-sources - Admin source health and target company list
router.get("/company-sources", authenticate, authorize("ADMIN"), async (_req, res) => {
  const sources = await prisma.companyCareerSource.findMany({
    orderBy: [
      { active: "desc" },
      { priority: "asc" },
      { companyName: "asc" },
    ],
  });
  res.json({ sources });
});

// POST /api/aggregator/company-sources - Add or update a target company career source
router.post("/company-sources", authenticate, authorize("ADMIN"), async (req, res) => {
  const {
    companyName,
    careersUrl,
    provider,
    providerKey,
    targetFields = [],
    priority = 50,
    crawlFrequencyHours = 12,
    active = true,
    allowedToCrawl = true,
  } = req.body as {
    companyName?: string;
    careersUrl?: string;
    provider?: string;
    providerKey?: string;
    targetFields?: string[];
    priority?: number;
    crawlFrequencyHours?: number;
    active?: boolean;
    allowedToCrawl?: boolean;
  };

  if (!companyName || !careersUrl || !provider || !providerKey) {
    res.status(400).json({ error: "companyName, careersUrl, provider, and providerKey are required" });
    return;
  }
  const normalizedProvider = provider.toUpperCase();
  if (!isCompanyCareerProvider(normalizedProvider)) {
    res.status(400).json({ error: "Unsupported provider" });
    return;
  }

  const source = await prisma.companyCareerSource.upsert({
    where: {
      provider_providerKey: {
        provider: normalizedProvider,
        providerKey,
      },
    },
    create: {
      companyName,
      careersUrl,
      provider: normalizedProvider,
      providerKey,
      targetFields,
      priority,
      crawlFrequencyHours,
      active,
      allowedToCrawl,
    },
    update: {
      companyName,
      careersUrl,
      targetFields,
      priority,
      crawlFrequencyHours,
      active,
      allowedToCrawl,
    },
  });

  res.json({ source });
});

// GET /api/aggregator/preview - Preview jobs without saving (Admin only)
router.get("/preview", authenticate, authorize("ADMIN"), async (req, res) => {
  const keywords = (req.query.keywords as string)?.split(",") || DEFAULT_FIELD_KEYWORDS;
  const limit = parseInt(req.query.limit as string) || 50;
  const fields = (req.query.fields as string | undefined)?.split(",").filter(Boolean);
  const remote = req.query.remote === "true" ? true : undefined;

  try {
    const dbCompanySources = await loadActiveCompanyCareerSources();
    const previewAggregator = dbCompanySources.length > 0
      ? new JobAggregator(prisma, dbCompanySources)
      : aggregator;
    const query: JobQuery = {
      keywords,
      includeAllCompanyJobs: true,
      fields,
      postedWithinDays: 21,
      limit,
      remote,
    };

    const results = await previewAggregator.aggregateJobs(query);
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
        field: j.jobField,
        workplaceType: j.workplaceType,
        visaSponsorship: j.visaSponsorship,
        relocationAssistance: j.relocationAssistance,
        source: j.source,
        applyUrl: j.applicationUrl,
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

    const byField = await prisma.job.groupBy({
      by: ["jobField"],
      _count: { id: true },
      where: { status: "PUBLISHED", isExpired: false },
      orderBy: { _count: { id: "desc" } },
    });

    const byWorkplace = await prisma.job.groupBy({
      by: ["workplaceType"],
      _count: { id: true },
      where: { status: "PUBLISHED", isExpired: false },
      orderBy: { _count: { id: "desc" } },
    });

    const companySourceHealth = await prisma.companyCareerSource.groupBy({
      by: ["provider", "active"],
      _count: { id: true },
      orderBy: { provider: "asc" },
    });

    res.json({
      bySource: stats,
      byRegion,
      byField,
      byWorkplace,
      companySourceHealth,
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
