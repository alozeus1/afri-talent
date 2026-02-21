# Backend Dockerfile - Production (Debian/Prisma OpenSSL compatible)
FROM node:20-bookworm-slim AS base

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

# Prune dev deps for runtime
RUN npm prune --production

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \ 
  && adduser --system --uid 1001 --ingroup nodejs expressjs

# Copy built app and production deps
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

RUN chown -R expressjs:nodejs /app
USER expressjs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -fsS http://localhost:4000/health || exit 1

CMD ["node", "dist/server.js"]
