import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

// Wave 9 §10.2 — release tagging + release-health. GIT_SHA is set at build
// time by the Docker build for the server runtime; NEXT_PUBLIC_GIT_SHA is
// the fallback so server and client share the same release identifier.
const release = process.env.GIT_SHA || process.env.NEXT_PUBLIC_GIT_SHA || undefined;

// Release-health (session tracking) is enabled by default in @sentry/nextjs v10
// when `release` is set; no explicit flag needed.
Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  release,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1,
  debug: false,
});
