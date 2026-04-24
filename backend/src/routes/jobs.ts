import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize, optionalAuth } from "../middleware/auth.js";
import { anonymousJobsLimiter, blockAnonymousJobsAutomation } from "../middleware/bot-protection.js";
import { JobStatus, Role, TrustEntityType, TrustRiskLevel } from "@prisma/client";
import { buildCacheKey, getCachedJson, setCachedJson } from "../lib/cache.js";
import { requireAccountStanding } from "../middleware/account-standing.js";
import { assessJobPostingRisk } from "../lib/trust/risk.js";
import { buildJobIntelligenceUpdate, scoreJobForSearch } from "../lib/jobs/discovery.js";
import {
  buildJobSearchWhere,
  buildPreferenceContext,
  fetchRankedJobs,
  loadCandidatePreferenceContext,
  publicJobInclude,
} from "../lib/jobs/search.js";
import {
  addTrustCaseAction,
  createTrustCase,
  employerTrustSummary,
  jobTrustSummary,
  recordTrustRiskEvent,
  refreshEmployerTrustProfile,
} from "../lib/trust/service.js";
import { recordLatencyMetric, recordOpsEvent } from "../lib/ops/events.js";

const router = Router();

const createJobSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  location: z.string(),
  type: z.string(),
  seniority: z.string(),
  salaryMin: z.coerce.number().optional(),
  salaryMax: z.coerce.number().optional(),
  currency: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const updateJobSchema = createJobSchema.partial();

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    + "-" + Date.now().toString(36);
}

function serializeJob<T extends {
  title: string;
  description: string;
  location: string;
  riskLevel: TrustRiskLevel;
  riskScore: number;
  qualityCheckedAt?: Date | null;
  publishedAt?: Date | null;
  employer?: {
    companyName: string;
    location: string;
    website?: string | null;
    bio?: string | null;
    createdAt?: Date;
    trustProfile?: {
      verificationLevel: any;
      authenticityScore: number;
      riskScore: number;
      riskLevel: TrustRiskLevel;
      postingEligibility: boolean;
      requiresEnhancedVerification: boolean;
      verifiedDomain: string | null;
      suspiciousSignals?: unknown;
    } | null;
  } | null;
}>(job: T) {
  const trust = jobTrustSummary({
    riskLevel: job.riskLevel,
    riskScore: job.riskScore,
    qualityCheckedAt: job.qualityCheckedAt ?? null,
    publishedAt: job.publishedAt ?? null,
    employerCreatedAt: job.employer?.createdAt ?? null,
    employerTrustProfile: job.employer?.trustProfile ?? null,
  });
  const ranked = scoreJobForSearch(job);

  return {
    ...job,
    trust,
    discovery: ranked.discovery,
    rankingExplanation: ranked.explanation,
    sourceLineage: ranked.sourceLineage,
    employer: job.employer
      ? {
          ...job.employer,
          trust: trust.employer,
        }
      : job.employer,
  };
}

// GET /api/jobs/employer/my-jobs - Employer: list own jobs (must be before /:slug)
router.get("/employer/my-jobs", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!employer) {
      res.status(400).json({ error: "Employer profile not found" });
      return;
    }

    const jobs = await prisma.job.findMany({
      where: { employerId: employer.id },
      include: {
        employer: {
          select: {
            companyName: true,
            location: true,
            createdAt: true,
            trustProfile: {
              select: {
                verificationLevel: true,
                authenticityScore: true,
                riskScore: true,
                riskLevel: true,
                postingEligibility: true,
                requiresEnhancedVerification: true,
                verifiedDomain: true,
                suspiciousSignals: true,
              },
            },
          },
        },
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(jobs.map(serializeJob));
  } catch (error) {
    console.error("My jobs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/jobs/ai-search - AI-optimized job search for orchestrator job picker
router.get("/ai-search", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const { query = "", limit = "10" } = req.query;
    const take = Math.min(parseInt(limit as string) || 10, 50);
    const candidateContext = await loadCandidatePreferenceContext(req);
    const filters = { search: query as string };
    const { jobs } = await fetchRankedJobs({
      where: buildJobSearchWhere(filters),
      page: 1,
      limit: take,
      take: Math.max(120, take * 8),
      preferenceContext: buildPreferenceContext(filters, candidateContext),
    });

    res.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        company: j.employer?.companyName ?? j.sourceName ?? "Unknown",
        location: j.location,
        type: j.type,
        seniority: j.seniority,
        rawText: j.description,
        url: j.sourceUrl ?? null,
        rankingExplanation: j.rankingExplanation.summary,
      })),
    });
  } catch (err) {
    console.error("AI job search error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/jobs - Public: list published jobs
router.get("/", optionalAuth, anonymousJobsLimiter, blockAnonymousJobsAutomation, async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const viewerKey = req.user?.role === Role.CANDIDATE ? req.user.userId : "anon";
    const cacheKey = buildCacheKey("jobs:list", { ...req.query, viewer: viewerKey });
    const cachedResponse = await getCachedJson<Record<string, unknown>>(cacheKey);
    if (cachedResponse) {
      res.setHeader("X-Cache", "HIT");
      recordLatencyMetric("job_search_latency", Date.now() - startedAt, {
        cache: "hit",
      });
      res.json(cachedResponse);
      return;
    }

    const {
      search, query: queryAlias, location, type, seniority,
      visaSponsorship, relocationAssistance, remote,
      salaryMin, salaryMax, country,
      page = "1", limit = "10", forAI,
    } = req.query;
    const searchTerm = (search || queryAlias) as string | undefined;
    const parsedLimit = Math.min(parseInt(limit as string) || 10, 100);
    const currentPage = Math.max(parseInt(page as string) || 1, 1);
    const filters = {
      search: searchTerm,
      location: location as string | undefined,
      type: type as string | undefined,
      seniority: seniority as string | undefined,
      visaSponsorship: visaSponsorship as string | undefined,
      relocationAssistance: relocationAssistance === "true",
      remote: remote === "true",
      salaryMin: salaryMin ? parseInt(salaryMin as string, 10) : null,
      salaryMax: salaryMax ? parseInt(salaryMax as string, 10) : null,
      country: country as string | undefined,
    };
    const candidateContext = await loadCandidatePreferenceContext(req);
    const preferenceContext = buildPreferenceContext(filters, candidateContext);
    const { jobs, total } = await fetchRankedJobs({
      where: buildJobSearchWhere(filters),
      page: currentPage,
      limit: parsedLimit,
      preferenceContext,
    });

    if (forAI === "true") {
      const aiJobs = jobs.map(job => ({
        id: job.id,
        title: job.title,
        company: job.employer?.companyName ?? job.sourceName ?? "Unknown",
        location: job.location,
        type: job.type,
        seniority: job.seniority,
        description: job.description,
        rankingExplanation: job.rankingExplanation.summary,
      }));
      const payload = { jobs: aiJobs, total };
      await setCachedJson(cacheKey, payload, 60);
      res.setHeader("X-Cache", "MISS");
      recordLatencyMetric("job_search_latency", Date.now() - startedAt, {
        cache: "miss",
        ai: true,
      });
      res.json(payload);
      return;
    }

    const payload = {
      jobs: jobs.map(serializeJob),
      pagination: {
        page: currentPage,
        limit: parsedLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
      },
    };
    await setCachedJson(cacheKey, payload, 60);
    res.setHeader("X-Cache", "MISS");
    recordLatencyMetric("job_search_latency", Date.now() - startedAt, {
      cache: "miss",
      ai: false,
    });
    res.json(payload);
  } catch (error) {
    console.error("List jobs error:", error);
    recordOpsEvent({
      metricName: "job_search_failure",
      category: "jobs",
      outcome: "failure",
      severity: "warning",
      durationMs: Date.now() - startedAt,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/jobs/:slug - Public: get single job by slug
router.get("/:slug", async (req: Request, res: Response) => {
  try {
    const cacheKey = buildCacheKey("jobs:detail", { slug: req.params.slug });
    const cachedJob = await getCachedJson<Record<string, unknown>>(cacheKey);
    if (cachedJob) {
      res.setHeader("X-Cache", "HIT");
      res.json(cachedJob);
      return;
    }

    const job = await prisma.job.findUnique({
      where: { slug: req.params.slug },
      include: publicJobInclude,
    });

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // Only show published, non-expired jobs to public
    if (job.status !== JobStatus.PUBLISHED || job.isExpired) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const payload = serializeJob(job);
    await setCachedJson(cacheKey, payload, 120);
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
  } catch (error) {
    console.error("Get job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/jobs - Employer: create job
router.post("/", authenticate, authorize(Role.EMPLOYER), requireAccountStanding(), async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const data = createJobSchema.parse(req.body);

    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!employer) {
      recordOpsEvent({
        metricName: "job_publish_failure",
        category: "jobs",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "missing_employer_profile",
        },
      });
      res.status(400).json({ error: "Employer profile not found" });
      return;
    }

    const trustProfile = await refreshEmployerTrustProfile(employer.id);
    const trust = employerTrustSummary(trustProfile);

    if (!trustProfile.postingEligibility) {
      recordOpsEvent({
        metricName: "job_publish_failure",
        category: "jobs",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "trust_requirement_not_met",
          risk_level: trustProfile.riskLevel,
        },
      });
      res.status(403).json({
        error: "Complete employer verification before publishing jobs.",
        code: "EMPLOYER_TRUST_REQUIRED",
        trust,
      });
      return;
    }

    const jobRisk = assessJobPostingRisk({
      title: data.title,
      description: data.description,
      salaryMin: data.salaryMin ?? null,
      salaryMax: data.salaryMax ?? null,
      employerRiskScore: trustProfile.riskScore,
    });
    const requiresModeration =
      trustProfile.requiresEnhancedVerification ||
      jobRisk.autoHold ||
      jobRisk.level === TrustRiskLevel.HIGH ||
      jobRisk.level === TrustRiskLevel.CRITICAL;
    const publishedAt = requiresModeration ? null : new Date();
    const intelligence = buildJobIntelligenceUpdate({
      title: data.title,
      description: data.description,
      location: data.location,
      type: data.type,
      seniority: data.seniority,
      salaryMin: data.salaryMin ?? null,
      salaryMax: data.salaryMax ?? null,
      currency: data.currency ?? null,
      tags: data.tags || [],
      publishedAt,
      riskScore: jobRisk.score,
      riskLevel: jobRisk.level,
      sourceName: employer.companyName,
      jobSource: "EMPLOYER_POSTED",
      employer: {
        companyName: employer.companyName,
        createdAt: employer.createdAt,
        trustProfile,
      },
    });

    const job = await prisma.job.create({
      data: {
        ...data,
        slug: generateSlug(data.title),
        tags: data.tags || [],
        status: requiresModeration ? JobStatus.PENDING_REVIEW : JobStatus.PUBLISHED,
        publishedAt,
        employerId: employer.id,
        riskScore: jobRisk.score,
        riskLevel: jobRisk.level,
        trustFlags: jobRisk.flags,
        qualityCheckedAt: requiresModeration ? null : new Date(),
        sourceName: employer.companyName,
        ...intelligence,
      },
    });

    if (jobRisk.score > 0) {
      await recordTrustRiskEvent({
        entityType: TrustEntityType.JOB,
        reasonCode: "job_posting_risk_assessment",
        summary: `Job "${job.title}" triggered trust and safety checks.`,
        scoreDelta: jobRisk.score,
        resultingScore: jobRisk.score,
        riskLevel: jobRisk.level,
        userId: req.user!.userId,
        employerId: employer.id,
        jobId: job.id,
        evidence: {
          flags: jobRisk.flags,
        },
        autoHeld: requiresModeration,
      });
    }

    if (requiresModeration) {
      const trustCase = await createTrustCase({
        entityType: TrustEntityType.JOB,
        priority: jobRisk.level,
        title: `Job moderation required: ${job.title}`,
        reasonCode: "job_auto_hold",
        summary: `Job held for moderation because of ${jobRisk.flags.join(", ") || "elevated employer risk"}.`,
        jobId: job.id,
        employerTrustProfileId: trustProfile.id,
      });

      await addTrustCaseAction({
        caseId: trustCase.id,
        actorId: req.user!.userId,
        actionType: "HOLD",
        reasonCode: "job_auto_hold",
        notes: "Job was automatically held for trust and safety review.",
        metadata: {
          flags: jobRisk.flags,
        },
      });
    }

    res.status(201).json({
      ...job,
      moderationRequired: requiresModeration,
      trust,
    });
    recordOpsEvent({
      metricName: requiresModeration ? "job_publish_held" : "job_publish_success",
      category: "jobs",
      outcome: requiresModeration ? "held" : "success",
      severity: requiresModeration ? "warning" : "info",
      durationMs: Date.now() - startedAt,
      details: {
        risk_level: jobRisk.level,
        employer_requires_enhanced_verification: trustProfile.requiresEnhancedVerification,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      recordOpsEvent({
        metricName: "job_publish_failure",
        category: "jobs",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "validation_failed",
        },
      });
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Create job error:", error);
    recordOpsEvent({
      metricName: "job_publish_failure",
      category: "jobs",
      outcome: "failure",
      severity: "critical",
      durationMs: Date.now() - startedAt,
      details: {
        reason: "internal_error",
      },
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/jobs/:id - Employer: update own job
router.put("/:id", authenticate, authorize(Role.EMPLOYER), requireAccountStanding(), async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const data = updateJobSchema.parse(req.body);

    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!employer) {
      recordOpsEvent({
        metricName: "job_publish_failure",
        category: "jobs",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "missing_employer_profile",
          operation: "update",
        },
      });
      res.status(400).json({ error: "Employer profile not found" });
      return;
    }

    const existingJob = await prisma.job.findFirst({
      where: { id: req.params.id, employerId: employer.id },
    });

    if (!existingJob) {
      recordOpsEvent({
        metricName: "job_publish_failure",
        category: "jobs",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "job_not_found",
          operation: "update",
        },
      });
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const trustProfile = await refreshEmployerTrustProfile(employer.id);
    const trust = employerTrustSummary(trustProfile);

    if (!trustProfile.postingEligibility) {
      recordOpsEvent({
        metricName: "job_publish_failure",
        category: "jobs",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "trust_requirement_not_met",
          operation: "update",
          risk_level: trustProfile.riskLevel,
        },
      });
      res.status(403).json({
        error: "Complete employer verification before republishing jobs.",
        code: "EMPLOYER_TRUST_REQUIRED",
        trust,
      });
      return;
    }

    const jobRisk = assessJobPostingRisk({
      title: data.title ?? existingJob.title,
      description: data.description ?? existingJob.description,
      salaryMin: data.salaryMin ?? existingJob.salaryMin ?? null,
      salaryMax: data.salaryMax ?? existingJob.salaryMax ?? null,
      employerRiskScore: trustProfile.riskScore,
    });
    const requiresModeration =
      trustProfile.requiresEnhancedVerification ||
      jobRisk.autoHold ||
      jobRisk.level === TrustRiskLevel.HIGH ||
      jobRisk.level === TrustRiskLevel.CRITICAL;
    const nextPublishedAt = requiresModeration ? existingJob.publishedAt : existingJob.publishedAt ?? new Date();
    const intelligence = buildJobIntelligenceUpdate({
      title: data.title ?? existingJob.title,
      description: data.description ?? existingJob.description,
      location: data.location ?? existingJob.location,
      type: data.type ?? existingJob.type,
      seniority: data.seniority ?? existingJob.seniority,
      salaryMin: data.salaryMin ?? existingJob.salaryMin ?? null,
      salaryMax: data.salaryMax ?? existingJob.salaryMax ?? null,
      currency: data.currency ?? existingJob.currency ?? null,
      tags: data.tags ?? existingJob.tags,
      publishedAt: nextPublishedAt,
      sourceName: employer.companyName,
      jobSource: existingJob.jobSource,
      sourceLineage: existingJob.sourceLineage,
      sourceFirstSeenAt: existingJob.sourceFirstSeenAt,
      sourceLastSeenAt: existingJob.sourceLastSeenAt,
      riskScore: jobRisk.score,
      riskLevel: jobRisk.level,
      employer: {
        companyName: employer.companyName,
        createdAt: employer.createdAt,
        trustProfile,
      },
    }, existingJob.sourceLineage);

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: {
        ...data,
        status: requiresModeration ? JobStatus.PENDING_REVIEW : JobStatus.PUBLISHED,
        publishedAt: nextPublishedAt,
        riskScore: jobRisk.score,
        riskLevel: jobRisk.level,
        trustFlags: jobRisk.flags,
        qualityCheckedAt: requiresModeration ? null : new Date(),
        sourceName: employer.companyName,
        ...intelligence,
      },
    });

    if (jobRisk.score > 0) {
      await recordTrustRiskEvent({
        entityType: TrustEntityType.JOB,
        reasonCode: "job_update_risk_assessment",
        summary: `Job "${job.title}" was rescored after an update.`,
        scoreDelta: jobRisk.score,
        resultingScore: jobRisk.score,
        riskLevel: jobRisk.level,
        userId: req.user!.userId,
        employerId: employer.id,
        jobId: job.id,
        evidence: {
          flags: jobRisk.flags,
        },
        autoHeld: requiresModeration,
      });
    }

    if (requiresModeration) {
      const trustCase = await createTrustCase({
        entityType: TrustEntityType.JOB,
        priority: jobRisk.level,
        title: `Updated job moderation required: ${job.title}`,
        reasonCode: "job_update_auto_hold",
        summary: `Updated job held for moderation because of ${jobRisk.flags.join(", ") || "elevated employer risk"}.`,
        jobId: job.id,
        employerTrustProfileId: trustProfile.id,
      });

      await addTrustCaseAction({
        caseId: trustCase.id,
        actorId: req.user!.userId,
        actionType: "HOLD",
        reasonCode: "job_update_auto_hold",
        notes: "Updated job was automatically held for trust and safety review.",
        metadata: {
          flags: jobRisk.flags,
        },
      });
    }

    res.json({
      ...job,
      moderationRequired: requiresModeration,
      trust,
    });
    recordOpsEvent({
      metricName: requiresModeration ? "job_publish_held" : "job_publish_success",
      category: "jobs",
      outcome: requiresModeration ? "held" : "success",
      severity: requiresModeration ? "warning" : "info",
      durationMs: Date.now() - startedAt,
      details: {
        operation: "update",
        risk_level: jobRisk.level,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      recordOpsEvent({
        metricName: "job_publish_failure",
        category: "jobs",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "validation_failed",
          operation: "update",
        },
      });
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Update job error:", error);
    recordOpsEvent({
      metricName: "job_publish_failure",
      category: "jobs",
      outcome: "failure",
      severity: "critical",
      durationMs: Date.now() - startedAt,
      details: {
        reason: "internal_error",
        operation: "update",
      },
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/jobs/:id - Employer: delete own job
router.delete("/:id", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!employer) {
      res.status(400).json({ error: "Employer profile not found" });
      return;
    }

    const existingJob = await prisma.job.findFirst({
      where: { id: req.params.id, employerId: employer.id },
    });

    if (!existingJob) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    await prisma.job.delete({ where: { id: req.params.id } });

    res.json({ message: "Job deleted successfully" });
  } catch (error) {
    console.error("Delete job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
