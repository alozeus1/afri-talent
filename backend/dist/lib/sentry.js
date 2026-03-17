import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";
export function initSentry() {
    if (Sentry.getClient()) {
        return;
    }
    const dsn = process.env.SENTRY_DSN;
    Sentry.init({
        dsn,
        enabled: Boolean(dsn) && !isTest,
        environment: process.env.NODE_ENV || "development",
        integrations: (defaultIntegrations) => [...defaultIntegrations, nodeProfilingIntegration()],
        tracesSampleRate: isProduction ? 0.2 : 1.0,
        profilesSampleRate: isProduction ? 0.2 : 1.0,
    });
}
export function setupExpressErrorHandler(app) {
    initSentry();
    Sentry.setupExpressErrorHandler(app);
}
export function sentryErrorHandler(err, req, _res, next) {
    captureException(err, {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
    });
    next(err);
}
export function captureException(error, context) {
    initSentry();
    return Sentry.captureException(error, context ? { extra: context } : undefined);
}
export function captureMessage(message, level = "info") {
    initSentry();
    return Sentry.captureMessage(message, level);
}
export async function flushSentry(timeout = 2000) {
    if (!Sentry.getClient()) {
        return true;
    }
    return Sentry.flush(timeout);
}
//# sourceMappingURL=sentry.js.map