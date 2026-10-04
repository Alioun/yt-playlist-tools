# syntax=docker/dockerfile:1

# Pinned for reproducible builds and Dependabot. Has no curl or wget.
FROM oven/bun:1.4.0-slim

WORKDIR /app
ENV NODE_ENV=production

# The broker has no dependencies, so no install step.
COPY server ./server

USER bun

EXPOSE 3847

ENTRYPOINT ["bun", "run", "server/index.ts"]
