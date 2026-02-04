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

// Sentry DSN from environment
const SENTRY_DSN = process.env.SENTRY_DSN;

// Type for dynamically loaded Sentry
interface SentryModule {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: Error, context?: Record<string, unknown>) => void;
  captureMessage: (message: string, level?: string) => void;
  Handlers: {
    requestHandler: () => (req: Request, res: Response, next: NextFunction) => void;
    tracingHandler: () => (req: Request, res: Response, next: NextFunction) => void;
  };
}

// Placeholder for Sentry module (loaded dynamically)
let Sentry: SentryModule | null = null;

export async function initSentry(): Promise<void> {
  if (!SENTRY_DSN) {
    console.log("Sentry DSN not configured, error tracking disabled");
    return;
  }

  try {
    // Dynamic import to avoid requiring @sentry/node if not installed
    // @ts-expect-error - @sentry/node is optional, may not be installed
    const sentryModule = await import("@sentry/node").catch(() => null);
    
    if (!sentryModule) {
      console.warn("@sentry/node not installed, error tracking disabled");
      return;
    }
    
    Sentry = sentryModule as unknown as SentryModule;
    
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    });

    console.log("Sentry initialized successfully");
  } catch (error) {
    console.warn("Failed to initialize Sentry:", error);
  }
}

export function setupSentryRequestHandler(app: Express): void {
  if (Sentry) {
    app.use(Sentry.Handlers.requestHandler());
  }
}

export function setupSentryTracingHandler(app: Express): void {
  if (Sentry) {
    app.use(Sentry.Handlers.tracingHandler());
  }
}

export function sentryErrorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (Sentry) {
    Sentry.captureException(err, {
      extra: {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
      },
    });
  }
  next(err);
}

export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (Sentry) {
    Sentry.captureException(error, { extra: context });
  }
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
  if (Sentry) {
    Sentry.captureMessage(message, level);
  }
}
