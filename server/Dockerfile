# syntax=docker/dockerfile:1

# oven/bun slim -- glibc, has a shell, much smaller than the full debian image.
# NOTE: neither curl nor wget exists in this image (they are only present in the
# upstream build stage), which is why the healthcheck shells out to bun instead.
# Pinned rather than floating on `1-slim` so builds are reproducible and
# Dependabot (docker ecosystem, see .github/dependabot.yml) has a concrete
# version to bump.
FROM oven/bun:1.4.0-slim

WORKDIR /app
ENV NODE_ENV=production

# The broker imports nothing -- it is plain Bun.serve with no dependencies. So
# there is no `bun install` step, which also avoids running the repo's
# `wxt prepare` postinstall (it would fail here: no extension sources, and none
# are needed). Bun executes the TypeScript directly, so no bundling step either.
COPY server ./server

# uid 1000, present in the debian/slim/alpine variants (not distroless).
USER bun

EXPOSE 3847

ENTRYPOINT ["bun", "run", "server/index.ts"]
