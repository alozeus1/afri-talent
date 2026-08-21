FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/renderer
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && rm -rf /root/.npm /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY server.mjs ./

RUN addgroup --system --gid 10001 renderer \
  && adduser --system --uid 10001 --ingroup renderer renderer \
  && chown -R renderer:renderer /srv/renderer

USER renderer
ENV NODE_ENV=production \
    CHROMIUM_PATH=/usr/bin/chromium \
    HOME=/tmp
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 CMD node -e 'fetch("http://127.0.0.1:8080/health").catch(() => process.exit(1))'
CMD ["node", "server.mjs"]
