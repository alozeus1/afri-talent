import { Router, Request, Response } from "express";
import { SupportedLocale } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

const localeSchema = z.object({
  preferredLocale: z.nativeEnum(SupportedLocale),
});

router.get("/locale", authenticate, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { preferredLocale: true },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});

router.put("/locale", authenticate, async (req: Request, res: Response) => {
  try {
    const data = localeSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { preferredLocale: data.preferredLocale },
      select: { preferredLocale: true },
    });
    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    res.status(500).json({ error: "Failed to update locale preference" });
  }
});

export default router;
