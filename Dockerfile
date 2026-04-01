FROM oven/bun:1-alpine AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -qO- http://localhost:3000/session-info || exit 1

CMD ["bun", "run", "src/index.ts"]
