# Frontend Dockerfile - Production
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Build stage
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time environment variables
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
# Wave 9 §10.2 — release tagging. GIT_SHA / NEXT_PUBLIC_GIT_SHA flow into
# the Sentry init configs so frontend release-health groups events by SHA.
ARG GIT_SHA
ARG NEXT_PUBLIC_GIT_SHA
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT
ENV GIT_SHA=$GIT_SHA
ENV NEXT_PUBLIC_GIT_SHA=$NEXT_PUBLIC_GIT_SHA

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application with the optional Sentry auth token mounted as a secret.
RUN --mount=type=secret,id=sentry_auth_token \
  export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" && \
  npm run build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# §2.5 build provenance — injected by deploy.yml. Available to the Node
# runtime (server.js) and to any /api route that wants to surface it.
ARG GIT_SHA="unknown"
ARG APP_RELEASE="local"
ARG BUILD_TIMESTAMP=""
ENV GIT_SHA=$GIT_SHA \
    APP_RELEASE=$APP_RELEASE \
    BUILD_TIMESTAMP=$BUILD_TIMESTAMP

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Set correct permissions for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# The standalone Next runtime starts with `node server.js`; it never invokes
# npm or npx. Remove the base image's package-manager tree so its transitive
# CLI dependencies are not unnecessarily shipped in the public runtime image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1

CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
