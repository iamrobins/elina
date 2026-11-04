FROM oven/bun:1.3.13 AS install
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.13
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
