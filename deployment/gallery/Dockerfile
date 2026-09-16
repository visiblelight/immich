FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS build
WORKDIR /app
RUN npm install --global pnpm@11.22.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./
COPY packages/gallery-core/package.json packages/gallery-core/package.json
COPY packages/gallery-db/package.json packages/gallery-db/package.json
COPY packages/gallery-ui/package.json packages/gallery-ui/package.json
COPY packages/gallery-public/package.json packages/gallery-public/package.json
COPY packages/gallery-admin/package.json packages/gallery-admin/package.json
COPY deployment/gallery/tsconfig.base.json deployment/gallery/tsconfig.base.json
COPY deployment/gallery/database/bootstrap.sql deployment/gallery/database/bootstrap.sql
RUN --mount=type=cache,target=/root/.local/share/pnpm pnpm --filter immich-monorepo --filter '@gallery/*' install --frozen-lockfile
COPY packages/gallery-core packages/gallery-core
COPY packages/gallery-db packages/gallery-db
COPY packages/gallery-ui packages/gallery-ui
COPY packages/gallery-public packages/gallery-public
COPY packages/gallery-admin packages/gallery-admin
RUN pnpm --filter immich-monorepo --filter '@gallery/*' gallery:build
# Keep workspace source entrypoints and their links: Node executes server-only TS.
FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 GALLERY_DESIGN_PREVIEW=0
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "packages/gallery-public/build/index.js"]
