# Token broker (1.5.0)

[← Legacy](README.md) · Retiring in 2.0 ([ADR-0001](../adr/0001-youtube-access-through-the-users-session.md))

A single stateless file, [`server/index.ts`](../../server/index.ts). No database. It holds the OAuth client secret for [Sign in with Google](authentication.md).

```bash
cp server/.env.example server/.env
```

Fill in `server/.env` (see the comments in [`server/.env.example`](../../server/.env.example)), then run it with Bun:

```bash
bun run server
```

Or in Docker, from the repo root, with hot reload:

```bash
docker compose -f server/docker-compose.dev.yml up --build --watch
```

Keep `--watch`: on Docker Desktop, file changes don't reach `bun --watch` inside the container, so Compose restarts it instead. The dev compose file publishes `127.0.0.1:3847` only.

## Using a different broker

| | Where | Applies to |
| --- | --- | --- |
| Build time | `WXT_AUTH_SERVER_URL` in `.env` | your own builds |
| Runtime (wins) | Settings → *Advanced* → **Token server** | any build |

The field is shown only while signed out, since tokens belong to the previous broker's client.

## Hosting one for others

1. Use your own OAuth client.
2. Set `ALLOWED_EXTENSION_IDS`. If empty, any extension can use your client.
3. Register each extension's redirect URIs on the client ([how](authentication.md#registering-an-oauth-client)).
4. Serve over HTTPS.

Users then enter the URL under *Token server*.

## Dokploy

1. New service: **Compose**, mode **Docker Compose** (not Stack, which drops `build:`).
2. Compose path: `server/docker-compose.yml`.
3. Environment: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EXTENSION_IDS`.
4. Domains: your host, container port **3847**, Let's Encrypt.

Don't add Traefik labels by hand; Dokploy generates them.
