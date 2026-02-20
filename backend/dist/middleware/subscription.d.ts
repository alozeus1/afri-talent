import { Request, Response, NextFunction } from "express";
import { SubscriptionPlan } from "@prisma/client";
/**
 * Middleware factory — requires a user to have at least `minimumPlan`.
 * Must be used after `authenticate`.
 */
export declare function requirePlan(minimumPlan: SubscriptionPlan): (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=subscription.d.ts.map