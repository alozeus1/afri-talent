/**
 * Sentry Error Tracking Integration (Optional)
 *
 * To enable Sentry:
 * 1. Install: npm install @sentry/node
 * 2. Set SENTRY_DSN environment variable
 * 3. Import and call initSentry() in server.ts before routes
 *
 * Example:
 *   import { initSentry, sentryErrorHandler } from "./lib/sentry.js";
 *   initSentry();
 *   // ... routes ...
 *   app.use(sentryErrorHandler);
 */
import { Express, Request, Response, NextFunction } from "express";
export declare function initSentry(): Promise<void>;
export declare function setupSentryRequestHandler(app: Express): void;
export declare function setupSentryTracingHandler(app: Express): void;
export declare function sentryErrorHandler(err: Error, req: Request, res: Response, next: NextFunction): void;
export declare function captureException(error: Error, context?: Record<string, unknown>): void;
export declare function captureMessage(message: string, level?: "info" | "warning" | "error"): void;
//# sourceMappingURL=sentry.d.ts.map