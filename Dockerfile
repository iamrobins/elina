FROM oven/bun:1.3.13 AS server-install
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.13 AS web-install
WORKDIR /app
COPY elina-web/package.json elina-web/bun.lock ./
RUN bun install --frozen-lockfile

FROM node:24-bookworm-slim AS web-build
WORKDIR /app
COPY --from=web-install /app/node_modules ./node_modules
COPY elina-web/package.json elina-web/next.config.ts elina-web/postcss.config.mjs elina-web/tsconfig.json elina-web/next-env.d.ts ./
COPY elina-web/src ./src
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
LABEL org.opencontainers.image.source="https://github.com/iamrobins/elina"
COPY --from=server-install /usr/local/bin/bun /usr/local/bin/bun
COPY --from=server-install /app/node_modules ./node_modules
COPY package.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
COPY --from=web-build /app/node_modules ./elina-web/node_modules
COPY --from=web-build /app/.next ./elina-web/.next
COPY elina-web/package.json ./elina-web/package.json
USER node
EXPOSE 3000 3001
CMD ["bun", "src/index.ts"]
