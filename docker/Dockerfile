# syntax=docker/dockerfile:1
# Longan: multi-stage image. Build from the repository root:
#   docker build -f docker/Dockerfile -t longan .
#
# Images: sharp 0.35 needs libvips >= 8.18, newer than any Debian package, so it uses its bundled prebuilt
# libvips (AVIF/HEIF container support, no HEVC). HEVC-coded HEIC (iPhone photos) is decoded with libheif's
# `heif-convert` (Debian libheif-examples, libheif1 is built with libde265), which the media pipeline uses as a fallback.

ARG NODE_IMAGE=node:24-bookworm-slim

# ---------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
# Manifests first so dependency layers are cached across source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/

# ---------------------------------------------------------------------------------------------------------
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
# The SPA is optional at build time: without apps/web/src an empty dist is produced (API-only image).
RUN if [ -f apps/web/index.html ] && [ -d apps/web/src ]; then \
		pnpm --filter @longan/web build; \
	else \
		echo "apps/web not present: building an API-only image" && mkdir -p apps/web/dist; \
	fi

# ---------------------------------------------------------------------------------------------------------
FROM base AS prod-deps
# Server runtime dependencies only. Workspace packages stay symlinked (not copied into node_modules), so
# Node's type stripping can load @longan/shared's .ts sources.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
	pnpm install --frozen-lockfile --prod --filter "@longan/server..."

# ---------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg libheif-examples tini ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
	PORT=3000 \
	STORAGE_PATH=/data \
	WEB_DIST=/app/apps/web/dist
COPY --from=prod-deps /app ./
COPY packages/shared/src packages/shared/src
COPY apps/server/src apps/server/src
COPY apps/server/drizzle apps/server/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/longan-entrypoint
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["tini", "--", "longan-entrypoint"]
CMD ["node", "apps/server/src/node.ts"]
