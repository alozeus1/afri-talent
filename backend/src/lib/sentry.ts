import type { Express, NextFunction, Request, Response } from "express";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

export function initSentry(): void {
  if (Sentry.getClient()) {
    return;
  }

  const dsn = process.env.SENTRY_DSN;

  Sentry.init({
    dsn,
    enabled: Boolean(dsn) && !isTest,
    environment: process.env.NODE_ENV || "development",
    // §2.5 build provenance: tag releases so Sentry can correlate errors with
    // deploys. APP_RELEASE is injected by the Docker build (see deploy.yml).
    release: process.env.APP_RELEASE || undefined,
    integrations: (defaultIntegrations) => [...defaultIntegrations, nodeProfilingIntegration()],
    tracesSampleRate: isProduction ? 0.2 : 1.0,
    profilesSampleRate: isProduction ? 0.2 : 1.0,
  });
}

export function setupExpressErrorHandler(app: Express): void {
  initSentry();
  Sentry.setupExpressErrorHandler(app);
}

export function sentryErrorHandler(
  err: Error,
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  captureException(err, {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
  });
  next(err);
}

export function captureException(error: unknown, context?: Record<string, unknown>): string {
  initSentry();
  return Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info"
): string {
  initSentry();
  return Sentry.captureMessage(message, level);
}

export async function flushSentry(timeout = 2000): Promise<boolean> {
  if (!Sentry.getClient()) {
    return true;
  }

  return Sentry.flush(timeout);
}
