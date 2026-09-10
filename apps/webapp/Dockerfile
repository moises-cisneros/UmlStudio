# syntax=docker/dockerfile:1.9

ARG NODE_IMAGE=node:24.15.0-slim@sha256:24dc26ef1e3c3690f27ebc4136c9c186c3133b25563ae4d7f0692e4d1fe5db0e

FROM ${NODE_IMAGE} AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack disable && npm install -g pnpm@11.1.3 \
    && pnpm config set store-dir /pnpm/store
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/
COPY apps/webapp/package.json ./apps/webapp/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter @umlstudio/webapp...

COPY packages/core ./packages/core
COPY packages/ui ./packages/ui
COPY apps/webapp ./apps/webapp
COPY tsconfig*.json ./

RUN pnpm --filter @umlstudio/core run build \
 && pnpm --filter @umlstudio/webapp run build

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS runtime

LABEL org.opencontainers.image.source="https://github.com/umlstudio/UmlStudio" \
      org.opencontainers.image.url="https://github.com/umlstudio/UmlStudio" \
      org.opencontainers.image.documentation="https://github.com/umlstudio/UmlStudio#readme" \
      org.opencontainers.image.title="UmlStudio Webapp" \
      org.opencontainers.image.description="Browser-hosted web app for the UmlStudio UML modeling editor." \
      org.opencontainers.image.vendor="UmlStudio Team" \
      org.opencontainers.image.licenses="MIT"

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/webapp/dist /usr/share/nginx/html
COPY apps/webapp/docker/entrypoint.sh /docker-entrypoint.d/40-umlstudio-env.sh

RUN chmod +x /docker-entrypoint.d/40-umlstudio-env.sh && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

USER nginx

CMD ["nginx", "-g", "daemon off;"]
