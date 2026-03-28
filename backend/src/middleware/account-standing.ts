import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";

export function requireAccountStanding(options?: { allowLimited?: boolean }) {
  const allowLimited = options?.allowLimited ?? false;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const actor = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        accountRestrictionStatus: true,
        accountRestrictionReason: true,
      },
    });

    if (!actor) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (actor.accountRestrictionStatus === "SUSPENDED") {
      res.status(403).json({
        error: actor.accountRestrictionReason || "This account is suspended pending trust review.",
        code: "ACCOUNT_SUSPENDED",
      });
      return;
    }

    if (!allowLimited && actor.accountRestrictionStatus === "LIMITED") {
      res.status(429).json({
        error: actor.accountRestrictionReason || "Sensitive actions are temporarily limited pending trust review.",
        code: "ACCOUNT_LIMITED",
      });
      return;
    }

    next();
  };
}
