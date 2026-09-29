# ── Stage 1: Install dependencies ──
FROM node:22-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm config set fetch-timeout 600000 \
 && npm ci --prefer-offline --no-audit --no-fund

# ── Stage 2: Build Next.js app ──
FROM node:22-slim AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ── Stage 3: Production runner ──
FROM node:22-slim AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Azure App Service reads the container port from WEBSITES_PORT.
ENV WEBSITES_PORT=3000
ENV WEBSITES_ENABLE_APP_SERVICE_STORAGE=true

# Pi agent/runtime env
ENV PI_COMMAND=pi
ENV PI_CODING_AGENT_DIR=/home/nextjs/.pi/agent
ENV HOME=/home/nextjs

# App workspace for uploaded PDFs, LiteParse JSON, traces, and result.json.
# /app/workspace is also declared as a Docker volume below.
ENV WORKSPACE_ROOT=/app/workspace

# Install runtime OS packages often needed by PDF/document parsing and native modules.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      python3 \
      python3-pip \
      libreoffice-core \
      libreoffice-writer \
      libreoffice-calc \
      libreoffice-impress \
      imagemagick \
 && rm -rf /var/lib/apt/lists/*

# Install Pi CLI globally for agent execution.
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm config set fetch-timeout 600000 \
 && npm install -g @earendil-works/pi-coding-agent --no-audit --no-fund

# Create non-root user.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs \
 && mkdir -p /home/nextjs /app/workspace \
 && chown -R nextjs:nodejs /home/nextjs /app/workspace

WORKDIR /app

# Copy Next.js standalone output. Requires output: "standalone" in next.config.ts.
COPY --from=builder /app/.next/standalone/. ./

# Static assets are not included in standalone output.
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Native/external packages can be missed by tracing; keep full production node_modules.
COPY --from=deps /app/node_modules ./node_modules

RUN chown -R nextjs:nodejs /app /home/nextjs

USER nextjs

EXPOSE 3000

VOLUME ["/app/workspace"]

CMD ["node", "server.js"]
