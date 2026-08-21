# Backend Dockerfile - Production (Debian/Prisma OpenSSL compatible)
FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl curl \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies and build
FROM base AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install full deps for build and Prisma generate
RUN npm ci

# Generate Prisma client targeting OpenSSL 3 (Debian/glibc)
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

# Preserve Prisma CLI artifacts before pruning so the runtime can still apply migrations.
RUN mkdir -p /tmp/prisma-cli \
  && cp -R node_modules/prisma /tmp/prisma-cli/prisma \
  && cp -R node_modules/@prisma /tmp/prisma-cli/@prisma \
  && npm prune --omit=dev \
  && mkdir -p node_modules/.bin node_modules/@prisma \
  && cp -R /tmp/prisma-cli/prisma node_modules/prisma \
  && cp -R /tmp/prisma-cli/@prisma/. node_modules/@prisma \
  && ln -sf ../prisma/build/index.js node_modules/.bin/prisma \
  # npm's internal lockfile retains the complete build-time graph after prune.
  # It is not needed at runtime and causes image scanners to report removed
  # development-only packages as shipped dependencies.
  && rm -f node_modules/.package-lock.json

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Chromium is deliberately not installed in the application runtime. PDF
# rendering is delegated to the isolated internal renderer service.

# §2.5 build provenance — injected by deploy.yml. Surfaced in /api/health
# (verbose admin view) and as the Sentry release tag.
ARG GIT_SHA="unknown"
ARG APP_RELEASE="local"
ARG BUILD_TIMESTAMP=""
ENV GIT_SHA=$GIT_SHA \
    APP_RELEASE=$APP_RELEASE \
    BUILD_TIMESTAMP=$BUILD_TIMESTAMP

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs expressjs

# Copy built app and production deps
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/docker ./docker

# Runtime migrations invoke the copied Prisma CLI directly, so the global npm
# client (and its unrelated transitive CLI tree) is not shipped in production.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
  && chmod +x ./docker/entrypoint.sh
RUN chown -R expressjs:nodejs /app
USER expressjs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 CMD curl -fsS http://localhost:4000/health || exit 1

CMD ["./docker/entrypoint.sh"]
