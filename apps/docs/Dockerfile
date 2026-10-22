# syntax=docker/dockerfile:1.9

ARG NODE_IMAGE=node:24.15.0-slim@sha256:24dc26ef1e3c3690f27ebc4136c9c186c3133b25563ae4d7f0692e4d1fe5db0e

FROM ${NODE_IMAGE} AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack disable && npm install -g pnpm@11.1.3 \
    && pnpm config set store-dir /pnpm/store
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/docs/package.json ./apps/docs/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter @umlstudio/docs...

COPY apps/docs ./apps/docs
COPY tsconfig*.json ./

RUN pnpm --filter @umlstudio/docs run build

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS runtime

LABEL org.opencontainers.image.title="UmlStudio Documentation" \
      org.opencontainers.image.description="Docusaurus documentation site for UmlStudio" \
      org.opencontainers.image.vendor="UmlStudio Team" \
      org.opencontainers.image.licenses="MIT"

RUN rm -f /etc/nginx/conf.d/default.conf

COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/docs/build /usr/share/nginx/html/docs

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:80/docs/ || exit 1

USER nginx

CMD ["nginx", "-g", "daemon off;"]
