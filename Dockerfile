# ── Containly — Multi-Stage-Build ────────────────────────────────────────────────
# Stage 1: Build (Monorepo: shared → server → web), inkl. Toolchain für native
# Module (better-sqlite3, argon2). Stage 2: schlankes Runtime-Image.

FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Build-Toolchain für node-gyp (native Addons). Wird im Runtime-Image nicht mitkopiert.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Erst nur die Manifeste → Layer-Caching für npm ci.
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci

# Quellen kopieren und bauen.
COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
COPY web ./web
COPY scripts ./scripts
RUN npm run build

# Dev-Dependencies entfernen — native Module (server) bleiben erhalten.
RUN npm prune --omit=dev

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app
# Injected from the release tag by CI (falls back to "dev" for local builds).
ARG CONTAINLY_VERSION=dev
ENV NODE_ENV=production \
    CONTAINLY_VERSION=$CONTAINLY_VERSION \
    CONTAINLY_WEB_ROOT=/app/web/dist \
    CONTAINLY_DATA_DIR=/data \
    CONTAINLY_STACKS_DIR=/stacks \
    PORT=8420

# tini (Signal-Handling) + Docker-CLI & Compose-Plugin (für Stack-Deployments).
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini ca-certificates curl gnupg \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && chmod a+r /etc/apt/keyrings/docker.asc \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
  && apt-get purge -y gnupg \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data /stacks

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package.json ./shared/package.json
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/web/dist ./web/dist

EXPOSE 8420
VOLUME ["/data", "/stacks"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||8420) +'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "server/dist/index.js"]
