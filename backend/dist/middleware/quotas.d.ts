import { Request, Response, NextFunction } from "express";
import { AiRunType } from "@prisma/client";
export declare function checkDailyQuota(req: Request, res: Response, next: NextFunction): Promise<void>;
/**
 * Monthly free-tier skill quota middleware factory.
 * FREE plan users are limited to `freeLimit` uses per calendar month.
 * BASIC+ users are unlimited.
 */
export declare function makeMonthlySkillQuota(runType: AiRunType, freeLimit: number): (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Fire-and-forget helper to record a completed skill AI run.
 * Call with `void recordSkillRun(...)` — never await in request path.
 */
export declare function recordSkillRun(userId: string, runType: AiRunType): Promise<void>;
//# sourceMappingURL=quotas.d.ts.map