FROM node:22-alpine AS base
WORKDIR /app

FROM base AS install
COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install

FROM base AS build
COPY --from=install /app/node_modules ./node_modules
COPY package.json ./
COPY src/scss/ ./src/scss/
RUN npx sass src/scss:public/assets/default/css --style=compressed --no-source-map

FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY --from=build /app/public/assets/default/css/ ./public/assets/default/css/
RUN mkdir -p /app/assets

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -qO- http://localhost:3000/session-info || exit 1

CMD ["npx", "tsx", "src/index.ts"]
