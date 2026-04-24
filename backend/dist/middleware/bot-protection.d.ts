import { NextFunction, Request, Response } from "express";
export declare function validateHumanAuthSubmission(req: Request, res: Response, next: NextFunction): void;
export declare const anonymousJobsLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare function blockAnonymousJobsAutomation(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=bot-protection.d.ts.map