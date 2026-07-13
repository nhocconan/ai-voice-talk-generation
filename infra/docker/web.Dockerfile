FROM node:22-alpine AS base
WORKDIR /app
# openssl CLI so Prisma detects the system OpenSSL (3.x on Alpine 3.20) and
# downloads the matching musl-openssl-3.0.x query engine during `prisma generate`.
# Without it Prisma defaults to the openssl-1.1.x engine, which fails to load
# libssl.so.1.1 (absent on Alpine 3.20) at runtime.
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/ui/package.json ./packages/ui/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
# Generate Prisma client before next build — next type-checks prisma/seed.ts
# which imports enum types (Role, ProviderName) only present after generate.
RUN pnpm --filter web exec prisma generate
# Build-time env so t3-env schema validation passes during next build's
# "Collecting page data" (routes import the env module at module load).
# NEXT_PUBLIC_APP_URL is a client var, baked into the bundle — real value via ARG.
# Server-only vars get throwaway placeholders; real values come from the compose
# environment at runtime (compose `environment:` overrides these image ENVs).
ARG NEXT_PUBLIC_APP_URL=https://vc.dic.app
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    DATABASE_URL=postgresql://build:build@build:5432/build \
    REDIS_URL=redis://build:6379 \
    AUTH_SECRET=build-placeholder-secret-min-32-characters \
    SERVER_SECRET=build-placeholder-secret-min-32-characters \
    MINIO_ENDPOINT=build \
    MINIO_ACCESS_KEY=build \
    MINIO_SECRET_KEY=build
RUN pnpm --filter web build
# Ensure apps/web/public exists (it may be absent when the project has no
# static assets yet) so the runner stage's COPY of it doesn't fail.
RUN mkdir -p apps/web/public

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
RUN mkdir -p /app/apps/web/.next/cache && chown -R nextjs:nodejs /app/apps/web/.next
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
