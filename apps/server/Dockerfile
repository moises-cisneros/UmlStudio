# syntax=docker/dockerfile:1.9

ARG NODE_IMAGE=node:24.15.0-slim@sha256:24dc26ef1e3c3690f27ebc4136c9c186c3133b25563ae4d7f0692e4d1fe5db0e

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack disable && npm install -g pnpm@11.1.3 \
    && pnpm config set store-dir /pnpm/store
WORKDIR /app

FROM base AS builder

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/
COPY apps/server/package.json ./apps/server/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter @umlstudio/server...

COPY packages/core ./packages/core
COPY packages/ui ./packages/ui
COPY apps/server ./apps/server
COPY assets ./assets
COPY tsconfig*.json ./

RUN pnpm --filter @umlstudio/core run build
RUN pnpm --filter @umlstudio/server run build

FROM base AS deploy
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=builder /app/packages/core ./packages/core
COPY --from=builder /app/packages/ui ./packages/ui
COPY --from=builder /app/apps/server ./apps/server
COPY --from=builder /app/node_modules ./node_modules
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm deploy --filter=@umlstudio/server --prod /deploy/server

FROM ${NODE_IMAGE} AS runtime

WORKDIR /app

LABEL org.opencontainers.image.source="https://github.com/umlstudio/UmlStudio" \
      org.opencontainers.image.url="https://github.com/umlstudio/UmlStudio" \
      org.opencontainers.image.documentation="https://github.com/umlstudio/UmlStudio#readme" \
      org.opencontainers.image.title="UmlStudio Server" \
      org.opencontainers.image.description="Hono + Redis + WebSocket relay server for the UmlStudio UML modeling editor." \
      org.opencontainers.image.vendor="UmlStudio Team" \
      org.opencontainers.image.licenses="MIT"

RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

COPY --from=deploy --chown=node:node /deploy/server ./

EXPOSE 8000 4444

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER node

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/src/server.js"]
