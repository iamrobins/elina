FROM oven/bun:1.3.13 AS server-install
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.13 AS web-install
WORKDIR /app
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile

FROM node:24-bookworm-slim AS web-build
WORKDIR /app
COPY --from=web-install /app/node_modules ./node_modules
COPY web/package.json web/next.config.ts web/postcss.config.mjs web/tsconfig.json web/next-env.d.ts ./
COPY web/src ./src
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
COPY --from=web-build /app/node_modules ./web/node_modules
COPY --from=web-build /app/.next ./web/.next
COPY web/package.json ./web/package.json
USER node
EXPOSE 3000 3001
CMD ["bun", "src/index.ts"]
