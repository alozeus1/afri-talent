import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",
  poweredByHeader: false,

  // Free-tier deployment: when BACKEND_PROXY_ORIGIN is set (e.g. on Vercel),
  // /api/* and /health are proxied server-side to the backend origin. This
  // lets the HTTPS frontend talk to an HTTP-only backend VM without
  // mixed-content blocking, and makes API calls same-origin (no CORS).
  // Unset (default) → no rewrites, behavior unchanged.
  async rewrites() {
    const target = process.env.BACKEND_PROXY_ORIGIN?.replace(/\/+$/, "");
    if (!target) return [];
    return [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
      { source: "/health", destination: `${target}/health` },
    ];
  },

  // Optimize images
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
