# ── Containly — hardened multi-stage build (Alpine) ──────────────────────────
# Alpine keeps the OS attack surface (and CVE count) minimal. Native modules
# (better-sqlite3, argon2) are compiled in the builder; the runtime is stripped
# down and the bundled npm (a CVE source we don't need at runtime) is removed.

FROM node:26-alpine AS builder
WORKDIR /app

# Build toolchain for node-gyp (native addons). Not copied into the runtime.
RUN apk add --no-cache python3 make g++

# Manifests first → layer caching for `npm ci`.
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/
# `npm ci` + install the musl variants of the native-binary optionals (rolldown,
# tailwind-oxide, lightningcss). The glibc-generated lockfile only pins the -gnu
# bindings (npm optional-deps bug #4828); derive the matching -musl set from it.
RUN npm ci \
  && node -e 'const l=require("./package-lock.json").packages||{};const o=[];for(const k in l){if(/linux-x64-gnu$/.test(k)&&l[k].version)o.push(k.replace(/^node_modules\//,"").replace(/gnu$/,"musl")+"@"+l[k].version)}require("fs").writeFileSync("/tmp/musl.txt",o.join(" "))' \
  && sh -c '[ -s /tmp/musl.txt ] && echo "musl bindings:" && cat /tmp/musl.txt && echo && npm install --no-save --force $(cat /tmp/musl.txt) || true'

# Sources + build.
COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
COPY web ./web
COPY scripts ./scripts
RUN npm run build

# Drop dev dependencies — native modules (server) are kept.
RUN npm prune --omit=dev

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:26-alpine AS runner
WORKDIR /app
# Injected from the release tag by CI (falls back to "dev" for local builds).
ARG CONTAINLY_VERSION=dev
ENV NODE_ENV=production \
    CONTAINLY_VERSION=$CONTAINLY_VERSION \
    CONTAINLY_WEB_ROOT=/app/web/dist \
    CONTAINLY_DATA_DIR=/data \
    CONTAINLY_STACKS_DIR=/stacks \
    PORT=8420

# tini (PID 1 / signal handling) only. The Docker CLI / Compose toolchain is NOT
# bundled — `docker compose` runs in a disposable helper container (docker:cli) on
# the target host, so the distributed Containly image carries no Go-toolchain CVEs.
# Also remove the bundled global npm/corepack/yarn (unused at runtime, a CVE source).
RUN apk add --no-cache tini \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
            /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
            /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
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
