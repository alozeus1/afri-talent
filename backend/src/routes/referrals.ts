import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { ReferralStatus } from "@prisma/client";

const router = Router();

const createReferralSchema = z.object({
  refereeEmail: z.string().email().max(255),
  jobId: z.string().uuid().optional(),
  companyName: z.string().max(200).trim().optional(),
  message: z.string().max(2000).trim().optional(),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(ReferralStatus),
});

// GET /api/referrals/stats — authenticated. Referral stats for current user.
router.get("/stats", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [totalMade, totalAccepted, totalHired] = await Promise.all([
      prisma.referral.count({ where: { referrerId: userId } }),
      prisma.referral.count({ where: { referrerId: userId, status: ReferralStatus.ACCEPTED } }),
      prisma.referral.count({ where: { referrerId: userId, status: ReferralStatus.HIRED } }),
    ]);

    res.json({ totalMade, totalAccepted, totalHired });
  } catch (error) {
    console.error("Referral stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/referrals — authenticated. List user's referrals (made and received).
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [made, received] = await Promise.all([
      prisma.referral.findMany({
        where: { referrerId: userId },
        include: {
          referee: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.referral.findMany({
        where: { refereeId: userId },
        include: {
          referrer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({ made, received });
  } catch (error) {
    console.error("List referrals error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/referrals — authenticated. Create a referral.
router.post("/", authenticate, async (req: Request, res: Response) => {
  try {
    const data = createReferralSchema.parse(req.body);
    const userId = req.user!.userId;

    // Check if referee email matches an existing user
    const existingUser = await prisma.user.findUnique({
      where: { email: data.refereeEmail },
      select: { id: true },
    });

    const referral = await prisma.referral.create({
      data: {
        referrerId: userId,
        refereeEmail: data.refereeEmail,
        refereeId: existingUser?.id ?? null,
        jobId: data.jobId ?? null,
        companyName: data.companyName ?? null,
        message: data.message ?? null,
      },
      include: {
        referee: { select: { id: true, name: true, email: true } },
        referrer: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json(referral);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Create referral error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/referrals/:id/status — authenticated. Update referral status (only referrer can update).
router.put("/:id/status", authenticate, async (req: Request, res: Response) => {
  try {
    const data = updateStatusSchema.parse(req.body);
    const userId = req.user!.userId;

    const referral = await prisma.referral.findFirst({
      where: { id: req.params.id, referrerId: userId },
    });

    if (!referral) {
      res.status(404).json({ error: "Referral not found" });
      return;
    }

    const updated = await prisma.referral.update({
      where: { id: req.params.id },
      data: { status: data.status },
      include: {
        referee: { select: { id: true, name: true, email: true } },
        referrer: { select: { id: true, name: true, email: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Update referral status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
