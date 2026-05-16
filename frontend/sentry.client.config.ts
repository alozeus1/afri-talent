import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Wave 9 §10.2 — release tagging + release-health.
// NEXT_PUBLIC_GIT_SHA is injected at build time by the Docker build
// (see deploy.yml and Dockerfile). When unset (e.g. local `next dev`),
// release stays undefined and Sentry treats events as unreleased.
const release = process.env.NEXT_PUBLIC_GIT_SHA || undefined;

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
