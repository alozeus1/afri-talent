import type { Express, NextFunction, Request, Response } from "express";
export declare function initSentry(): void;
export declare function setupExpressErrorHandler(app: Express): void;
export declare function sentryErrorHandler(err: Error, req: Request, _res: Response, next: NextFunction): void;
export declare function captureException(error: unknown, context?: Record<string, unknown>): string;
export declare function captureMessage(message: string, level?: "info" | "warning" | "error"): string;
export declare function flushSentry(timeout?: number): Promise<boolean>;
//# sourceMappingURL=sentry.d.ts.map