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
COPY apps/codegen/package.json ./apps/codegen/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter @umlstudio/codegen...

COPY packages/core ./packages/core
COPY packages/ui ./packages/ui
COPY apps/codegen ./apps/codegen
COPY tsconfig*.json ./

RUN pnpm --filter @umlstudio/core run build
RUN pnpm --filter @umlstudio/codegen run build

FROM base AS deploy
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=builder /app/packages/core ./packages/core
COPY --from=builder /app/packages/ui ./packages/ui
COPY --from=builder /app/apps/codegen ./apps/codegen
COPY --from=builder /app/node_modules ./node_modules
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm deploy --filter=@umlstudio/codegen --prod /deploy/codegen

FROM ${NODE_IMAGE} AS runtime

WORKDIR /app

LABEL org.opencontainers.image.source="https://github.com/umlstudio/UmlStudio" \
      org.opencontainers.image.url="https://github.com/umlstudio/UmlStudio" \
      org.opencontainers.image.title="UmlStudio Codegen" \
      org.opencontainers.image.description="Spring Boot 3.x and OpenAPI code generation microservice for UmlStudio." \
      org.opencontainers.image.vendor="UmlStudio Team" \
      org.opencontainers.image.licenses="MIT"

RUN apt-get update && apt-get install -y --no-install-recommends tini curl && rm -rf /var/lib/apt/lists/*

COPY --from=deploy --chown=node:node /deploy/codegen ./

EXPOSE 8002 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT:-8002}/health || exit 1

USER node

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/src/server.js"]
