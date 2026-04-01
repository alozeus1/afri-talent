import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { Role } from "@prisma/client";
import logger from "../lib/logger.js";
import {
  candidateTrustSummary,
  canUseVerifiedCandidateFilter,
} from "../lib/trust/service.js";

const router = Router();

// GET /api/talent - Search candidates (employer/admin only)
router.get("/", authenticate, authorize(Role.EMPLOYER, Role.ADMIN), async (req: Request, res: Response) => {
  try {
    const {
      skills, location, minExperience, maxExperience,
      visaStatus, verifiedOnly, verifiedSkillsOnly, fullyCompletedOnly, assessmentBackedOnly, page = "1", limit = "10",
    } = req.query;

    const where: any = {
      openToWork: true,
      user: {
        accountRestrictionStatus: {
          not: "SUSPENDED",
        },
      },
    };

    const subscription = req.user!.role === Role.EMPLOYER
      ? await prisma.subscription.findUnique({
        where: { userId: req.user!.userId },
        select: { plan: true },
      }).catch(() => null)
      : null;

    const requiresPremiumTrustFilters =
      verifiedOnly === "true" || verifiedSkillsOnly === "true" || assessmentBackedOnly === "true";

    if (requiresPremiumTrustFilters && !canUseVerifiedCandidateFilter(subscription?.plan, req.user!.role)) {
      res.status(403).json({
        error: "Verified-candidate filters are available to premium trusted employers.",
        code: "PREMIUM_VERIFIED_FILTER_REQUIRED",
      });
      return;
    }

    const trustFilters: Record<string, unknown> = {};

    if (verifiedOnly === "true") {
      trustFilters.premiumFilterEligible = true;
    }

    if (verifiedSkillsOnly === "true") {
      trustFilters.verifiedSkillCount = { gt: 0 };
    }

    if (fullyCompletedOnly === "true") {
      trustFilters.fullyCompletedProfile = true;
    }

    if (assessmentBackedOnly === "true") {
      trustFilters.assessmentBacked = true;
    }

    if (Object.keys(trustFilters).length > 0) {
      where.user = {
        ...(where.user || {}),
        candidateTrustProfile: {
          is: trustFilters,
        },
      };
    }

    if (skills) {
      const skillList = (skills as string).split(",").map((s) => s.trim()).filter(Boolean);
      if (skillList.length > 0) {
        where.skills = { hasSome: skillList };
      }
    }

    if (location) {
      where.OR = [
        { targetCountries: { has: location as string } },
        { user: { employer: undefined } },
      ];
      // Filter by targetCountries containing the location
      where.targetCountries = { has: location as string };
      delete where.OR;
    }

    if (minExperience) {
      where.yearsExperience = {
        ...where.yearsExperience,
        gte: parseInt(minExperience as string),
      };
    }

    if (maxExperience) {
      where.yearsExperience = {
        ...where.yearsExperience,
        lte: parseInt(maxExperience as string),
      };
    }

    if (visaStatus) {
      where.visaStatus = { contains: visaStatus as string, mode: "insensitive" };
    }

    const parsedLimit = Math.min(parseInt(limit as string) || 10, 100);
    const skip = (parseInt(page as string) - 1) * parsedLimit;

    const [candidates, total] = await Promise.all([
      prisma.candidateProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              candidateTrustProfile: true,
            },
          },
          resumes: {
            where: { isActive: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: parsedLimit,
      }),
      prisma.candidateProfile.count({ where }),
    ]);

    // Attach skill assessments separately
    const userIds = candidates.map((c) => c.userId);
    const assessments = userIds.length > 0
      ? await prisma.skillAssessment.findMany({
        where: { userId: { in: userIds } },
      })
      : [];

    const [verifiedSkills, partnerMarkers] = userIds.length > 0
      ? await Promise.all([
        prisma.candidateVerifiedSkill.findMany({
          where: {
            userId: { in: userIds },
            status: "VERIFIED",
          },
          orderBy: { verifiedAt: "desc" },
          include: {
            partner: {
              select: {
                id: true,
                name: true,
                organizationType: true,
              },
            },
          },
        }),
        prisma.candidatePartnerMarker.findMany({
          where: {
            userId: { in: userIds },
            status: "ACTIVE",
          },
          orderBy: { issuedAt: "desc" },
          include: {
            partner: {
              select: {
                id: true,
                name: true,
                country: true,
                organizationType: true,
              },
            },
          },
        }),
      ])
      : [[], []];

    const assessmentMap = new Map<string, typeof assessments>();
    for (const a of assessments) {
      const list = assessmentMap.get(a.userId) ?? [];
      list.push(a);
      assessmentMap.set(a.userId, list);
    }

    const verifiedSkillMap = new Map<string, typeof verifiedSkills>();
    for (const skill of verifiedSkills) {
      const list = verifiedSkillMap.get(skill.userId) ?? [];
      list.push(skill);
      verifiedSkillMap.set(skill.userId, list);
    }

    const partnerMarkerMap = new Map<string, typeof partnerMarkers>();
    for (const marker of partnerMarkers) {
      const list = partnerMarkerMap.get(marker.userId) ?? [];
      list.push(marker);
      partnerMarkerMap.set(marker.userId, list);
    }

    const results = candidates.map((c) => ({
      ...c,
      skillAssessments: assessmentMap.get(c.userId) ?? [],
      verifiedSkills: verifiedSkillMap.get(c.userId) ?? [],
      partnerMarkers: partnerMarkerMap.get(c.userId) ?? [],
      trust: c.user.candidateTrustProfile
        ? candidateTrustSummary(c.user.candidateTrustProfile)
        : null,
    }));

    res.json({
      candidates: results,
      pagination: {
        page: parseInt(page as string),
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error({ error }, "Talent search error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/talent/:userId - Get candidate detail (employer/admin only)
router.get("/:userId", authenticate, authorize(Role.EMPLOYER, Role.ADMIN), async (req: Request, res: Response) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.params.userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            candidateTrustProfile: true,
          },
        },
        resumes: {
          where: { isActive: true },
        },
      },
    });

    if (!profile || !profile.openToWork) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }

    const skillAssessments = await prisma.skillAssessment.findMany({
      where: { userId: req.params.userId },
    });

    const [verifiedSkills, partnerMarkers] = await Promise.all([
      prisma.candidateVerifiedSkill.findMany({
        where: {
          userId: req.params.userId,
          status: "VERIFIED",
        },
        orderBy: { verifiedAt: "desc" },
        include: {
          partner: {
            select: {
              id: true,
              name: true,
              organizationType: true,
            },
          },
        },
      }),
      prisma.candidatePartnerMarker.findMany({
        where: {
          userId: req.params.userId,
          status: "ACTIVE",
        },
        orderBy: { issuedAt: "desc" },
        include: {
          partner: {
            select: {
              id: true,
              name: true,
              country: true,
              organizationType: true,
            },
          },
        },
      }),
    ]);

    res.json({
      ...profile,
      skillAssessments,
      verifiedSkills,
      partnerMarkers,
      trust: profile.user.candidateTrustProfile
        ? candidateTrustSummary(profile.user.candidateTrustProfile)
        : null,
    });
  } catch (error) {
    logger.error({ error }, "Talent detail error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
