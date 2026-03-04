// ─────────────────────────────────────────────────────────────────────────────
// Salary Reports API Routes
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { Role } from "@prisma/client";

const router = Router();

// Validation schemas
const SalaryReportSchema = z.object({
  jobTitle: z.string().min(1).max(200).trim(),
  location: z.string().min(1).max(200).trim(),
  country: z.string().min(1).max(100).trim(),
  salaryCurrency: z.string().min(1).max(10).trim().default("USD"),
  salaryAmount: z.coerce.number().int().min(1),
  salaryPeriod: z.enum(["yearly", "monthly"]).default("yearly"),
  yearsExperience: z.coerce.number().int().min(0).max(50).optional(),
  employmentType: z.enum(["full-time", "contract", "part-time"]).optional(),
  companyId: z.string().uuid().optional(),
});

// GET /api/salary-reports — search salary reports with aggregated stats
router.get("/", async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const jobTitle = req.query.jobTitle as string;
  const country = req.query.country as string;
  const companyId = req.query.companyId as string;

  try {
    const where: Record<string, unknown> = {};

    if (jobTitle) {
      where.jobTitle = { contains: jobTitle, mode: "insensitive" };
    }
    if (country) {
      where.country = { contains: country, mode: "insensitive" };
    }
    if (companyId) {
      where.companyId = companyId;
    }

    const [reports, total, aggregation] = await Promise.all([
      prisma.salaryReport.findMany({
        where,
        select: {
          id: true,
          jobTitle: true,
          location: true,
          country: true,
          salaryCurrency: true,
          salaryAmount: true,
          salaryPeriod: true,
          yearsExperience: true,
          employmentType: true,
          createdAt: true,
          company: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.salaryReport.count({ where }),
      prisma.salaryReport.aggregate({
        where,
        _avg: { salaryAmount: true },
        _min: { salaryAmount: true },
        _max: { salaryAmount: true },
        _count: { id: true },
      }),
    ]);

    // Compute median from all matching reports
    const allAmounts = await prisma.salaryReport.findMany({
      where,
      select: { salaryAmount: true },
      orderBy: { salaryAmount: "asc" },
    });
    const amounts = allAmounts.map((r) => r.salaryAmount);
    const median = amounts.length > 0
      ? amounts.length % 2 === 1
        ? amounts[Math.floor(amounts.length / 2)]
        : Math.round((amounts[Math.floor(amounts.length / 2) - 1] + amounts[Math.floor(amounts.length / 2)]) / 2)
      : null;

    res.json({
      reports,
      stats: {
        avg: aggregation._avg.salaryAmount ? Math.round(aggregation._avg.salaryAmount) : null,
        min: aggregation._min.salaryAmount,
        max: aggregation._max.salaryAmount,
        median,
        count: aggregation._count.id,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch salary reports" });
  }
});

// GET /api/salary-reports/compare — compare salaries across countries
router.get("/compare", async (req: Request, res: Response) => {
  const jobTitle = req.query.jobTitle as string;
  const countries = req.query.country as string | string[];

  if (!jobTitle) {
    res.status(400).json({ error: "jobTitle is required" });
    return;
  }

  const countryList = Array.isArray(countries)
    ? countries
    : countries
      ? [countries]
      : [];

  if (countryList.length === 0) {
    res.status(400).json({ error: "At least one country is required" });
    return;
  }

  try {
    const comparisons = await Promise.all(
      countryList.map(async (country) => {
        const agg = await prisma.salaryReport.aggregate({
          where: {
            jobTitle: { contains: jobTitle, mode: "insensitive" },
            country: { contains: country, mode: "insensitive" },
          },
          _avg: { salaryAmount: true },
          _min: { salaryAmount: true },
          _max: { salaryAmount: true },
          _count: { id: true },
        });

        return {
          country,
          avg: agg._avg.salaryAmount ? Math.round(agg._avg.salaryAmount) : null,
          min: agg._min.salaryAmount,
          max: agg._max.salaryAmount,
          count: agg._count.id,
        };
      })
    );

    res.json({ jobTitle, comparisons });
  } catch (error) {
    res.status(500).json({ error: "Failed to compare salaries" });
  }
});

// GET /api/salary-reports/top-paying — top 10 highest-paying job titles
router.get("/top-paying", async (_req: Request, res: Response) => {
  try {
    const results = await prisma.salaryReport.groupBy({
      by: ["jobTitle"],
      _avg: { salaryAmount: true },
      _count: { id: true },
      orderBy: { _avg: { salaryAmount: "desc" } },
      take: 10,
    });

    const topPaying = results.map((r) => ({
      jobTitle: r.jobTitle,
      avgSalary: r._avg.salaryAmount ? Math.round(r._avg.salaryAmount) : null,
      reportCount: r._count.id,
    }));

    res.json({ topPaying });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch top-paying jobs" });
  }
});

// POST /api/salary-reports — submit anonymous salary report (candidates only)
router.post("/", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  const parsed = SalaryReportSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  try {
    // Validate companyId if provided
    if (parsed.data.companyId) {
      const company = await prisma.company.findUnique({
        where: { id: parsed.data.companyId },
      });
      if (!company) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
    }

    const report = await prisma.salaryReport.create({
      data: {
        userId: req.user!.userId,
        ...parsed.data,
      },
    });

    res.status(201).json({ report });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit salary report" });
  }
});

export default router;
