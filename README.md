# yt-playlist-tools

[![CI](https://github.com/Alioun/yt-playlist-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/Alioun/yt-playlist-tools/actions/workflows/ci.yml)

Get it on [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/youtube-playlist-tools/).

![5rgHjnQUy2](https://github.com/Alioun/yt-playlist-tools/assets/14974659/049852da-b7bb-408b-901f-06582aa910cc)
![firefox_0AvB0T8Vhu](https://github.com/Alioun/yt-playlist-tools/assets/14974659/ff37dbf7-fa6f-4452-a59a-ba465416ced4)

## Features

- Auto-add the current video to one or more playlists after a set watch percentage
- Keyboard shortcut to add to a chosen playlist
- Duplicate check, so a video is never added twice
- One-click **Add to queue** button on thumbnails (not on Subscriptions, which has YouTube's own)
- Optional: right-click a video card to open YouTube's ⋮ menu (Shift+right-click for the browser menu)
- Optional toasts; light, dark and system themes
- Settings inside the popup (gear icon) or as a tab via the Options entry

Planned: channel denylist.

## Development

WXT (Chrome MV3 + Firefox MV3), React 19, Tailwind v4, shadcn/ui on Base UI.

```bash
bun install
bun run dev            # Chrome
bun run dev:firefox    # Firefox
bun run compile        # typecheck
bun run test           # unit tests (test:watch, test:coverage)
bun run build          # Chrome
bun run build:firefox  # Firefox
bun run zip            # Chrome package
bun run zip:firefox    # Firefox package + AMO sources zip
```

Judge popup speed with `bun run build`. `wxt dev` serves unbundled modules and takes seconds to open the popup; the production build takes ~60 ms.

### Gotchas

- **`manifestVersion: 3` in `wxt.config.ts` is required.** WXT defaults Firefox to MV2, whose `injectScript` inlines scripts that YouTube's CSP blocks.
- **`open_in_tab` is set in [`options/index.html`](src/entrypoints/options/index.html)** via `<meta name="manifest.open_in_tab">`. WXT overwrites `options_ui` from config.
- **Preact does not work.** Base UI passes element types that Preact renders as `<[object Object]>`.
- **`SettingsPanel` is lazy-loaded from both popup and options.** A static import in either puts it in the shared chunk the popup preloads.
- **Tests for flat entrypoints live in `src/tests/`.** WXT treats any flat file in `src/entrypoints/` as an entrypoint.

### Add to queue

The button fires the same command as YouTube's menu item (`addToPlaylistCommand` with `PLAYLIST_EDIT_LIST_TYPE_QUEUE`) from a page-world script, [`yt-queue-bridge.ts`](src/entrypoints/yt-queue-bridge.ts), because `resolveCommand` is not visible to content scripts.

- `openMiniplayer` / `onCreateListCommand` are only sent when no queue exists. Sending them otherwise replaces the queue.
- It uses `injectScript` instead of `world: "MAIN"` because the manifest supports Firefox 125 and MAIN world needs 128.
- Excluded pages are listed in `EXCLUDED_PATHS` in [`queue.ts`](src/lib/queue.ts).

## Authentication

Two ways to get a Google OAuth token:

1. **Sign in with Google** (default): goes through the token broker in [`server/`](server/index.ts), which holds the client secret so the extension ships none. Google requires a secret for the *Web application* client type, the only type that accepts extension redirect URIs.
2. **Own credentials**: Settings → *Advanced*, paste your client ID and secret. Skips the broker.

> `youtube.force-ssl` is a restricted scope. Until Google verifies the app, a shared client is limited to test users. Own credentials work around this.

### Registering an OAuth client

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project and enable **YouTube Data API v3**.
2. *OAuth consent screen*: External, add the `youtube.force-ssl` scope.
3. *Credentials* → *OAuth 2.0 Client ID* → **Web application**.
4. Add both redirect URIs. Copy them from Settings → *Advanced*; Google matches them exactly, trailing slash included.

   | Browser | Redirect URI |
   | --- | --- |
   | Chrome | `https://<extension-id>.chromiumapp.org/` |
   | Firefox | `http://127.0.0.1/mozoauth2/<sha1-of-extension-id>` |

   Don't use Firefox's `*.extensions.allizom.org` URL; it fails consent-screen verification.

## Token broker

A single stateless file, [`server/index.ts`](server/index.ts). No database.

```bash
cp server/.env.example server/.env
```

Fill in `server/.env` (see the comments there), then run it with Bun:

```bash
bun run server
```

Or in Docker, from the repo root, with hot reload:

```bash
docker compose -f server/docker-compose.dev.yml up --build --watch
```

Keep `--watch`: on Docker Desktop, file changes don't reach `bun --watch` inside the container, so Compose restarts it instead. The dev compose file publishes `127.0.0.1:3847` only.

### Using a different broker

| | Where | Applies to |
| --- | --- | --- |
| Build time | `WXT_AUTH_SERVER_URL` in `.env` | your own builds |
| Runtime (wins) | Settings → *Advanced* → **Token server** | any build |

The field is shown only while signed out, since tokens belong to the previous broker's client.

### Hosting one for others

1. Use your own OAuth client.
2. Set `ALLOWED_EXTENSION_IDS`. If empty, any extension can use your client.
3. Register each extension's redirect URIs on the client.
4. Serve over HTTPS.

Users then enter the URL under *Token server*.

### Dokploy

1. New service: **Compose**, mode **Docker Compose** (not Stack, which drops `build:`).
2. Compose path: `server/docker-compose.yml`.
3. Environment: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EXTENSION_IDS`.
4. Domains: your host, container port **3847**, Let's Encrypt.

Don't add Traefik labels by hand; Dokploy generates them.

## CI and tests

[`ci.yml`](.github/workflows/ci.yml) typechecks, tests, builds both targets, checks the manifests (MV3, background type, gecko ID, host permissions) and smoke-tests the broker image. [Dependabot](.github/dependabot.yml) groups packages that must update together.

Tests use Vitest with three projects: `chrome`, `firefox` (`*.firefox.test.ts`) and `server`. `bun test` can't run them because it doesn't resolve WXT's imports. `vitest.config.ts` sets `import.meta.env.FIREFOX` itself, since `WxtVitest()` doesn't under Vitest.

## Releasing

Pushing a `v*` tag runs [`release.yml`](.github/workflows/release.yml): zips both targets and checks that the AMO sources zip rebuilds. Store upload runs when the repo variable `PUBLISH_TO_STORES` is `true`, using the secrets listed in `.env.submit.example`.

To publish locally, fill in `.env.submit` (or run `bunx wxt submit init`) and run `bunx wxt submit`.

## Environment files

All gitignored; copy from the `.example` next to each. None is needed for `bun run dev`.

| File | Contents |
| --- | --- |
| [`.env`](.env.example) | Build-time broker URL |
| [`server/.env`](server/.env.example) | Google OAuth client, broker settings |
| [`.env.submit`](.env.submit.example) | Chrome Web Store and AMO credentials |
