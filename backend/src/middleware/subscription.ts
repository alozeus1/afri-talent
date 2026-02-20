import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  FREE: 0,
  BASIC: 1,
  PROFESSIONAL: 2,
};

/**
 * Middleware factory — requires a user to have at least `minimumPlan`.
 * Must be used after `authenticate`.
 */
export function requirePlan(minimumPlan: SubscriptionPlan) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId: req.user.userId },
      });

      const userPlan = subscription?.plan ?? SubscriptionPlan.FREE;
      const userStatus = subscription?.status ?? SubscriptionStatus.INACTIVE;

      // FREE plan is always "active" even without a subscription record
      const isActive =
        userPlan === SubscriptionPlan.FREE ||
        userStatus === SubscriptionStatus.ACTIVE;

      if (!isActive || PLAN_RANK[userPlan] < PLAN_RANK[minimumPlan]) {
        res.status(403).json({
          error: "This feature requires a higher subscription plan",
          currentPlan: userPlan,
          requiredPlan: minimumPlan,
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Subscription check error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
