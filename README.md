# yt-playlist-tools

[![CI](https://github.com/Alioun/yt-playlist-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/Alioun/yt-playlist-tools/actions/workflows/ci.yml)

Get it here:
https://addons.mozilla.org/en-US/firefox/addon/youtube-playlist-tools/

![5rgHjnQUy2](https://github.com/Alioun/yt-playlist-tools/assets/14974659/049852da-b7bb-408b-901f-06582aa910cc)
![firefox_0AvB0T8Vhu](https://github.com/Alioun/yt-playlist-tools/assets/14974659/ff37dbf7-fa6f-4452-a59a-ba465416ced4)

Adds a few small playlist tools.

- Automatically add the current video to one or multiple playlists
- Set a required watch percentage before it gets added
- Set a custom shortcut for it to be added to a special playlist
- Optional toasts for extension actions
- Fetches all your playlists and makes them selectable with a checkbox
- Caches added videos locally so the same video is not added twice
- Light / dark / system theme
- Settings live inside the popup, behind the gear icon (and also as a normal
  browser tab via the extension's Options entry)
- One-click **Add to queue** button on video thumbnails (toggleable in the popup)

Planned:

- Denylist for channels

## Tech stack

Built with [WXT](https://wxt.dev) (Chrome MV3 + Firefox MV3 from one codebase),
React 19, Tailwind v4 and [shadcn/ui](https://ui.shadcn.com) on Base UI.

```bash
bun install
bun run dev            # Chrome
bun run dev:firefox    # Firefox
bun run compile        # typecheck
bun run test           # unit tests
bun run test:watch     # unit tests, watch mode
bun run test:coverage  # unit tests + coverage report
bun run build          # Chrome
bun run build:firefox  # Firefox
bun run zip            # Chrome, packaged
bun run zip:firefox    # Firefox, packaged (+ the sources zip AMO requires)
```

> Every command here is one per line on purpose: Windows PowerShell 5.1 has no
> `&&` operator, so chained forms fail there.

> Firefox note: WXT defaults Firefox builds to MV2. `manifestVersion: 3` is
> pinned in `wxt.config.ts` so both targets ship MV3; don't remove it.

> Settings note: `open_in_tab` is set via `<meta name="manifest.open_in_tab">`
> in [`options/index.html`](src/entrypoints/options/index.html), **not** in
> `wxt.config.ts`. WXT derives `options_ui` from the entrypoint and overwrites
> whatever the config sets, silently.

### One-click "Add to queue"

YouTube removed its own hover overlay buttons from the home and subscriptions
feeds in March 2026, leaving the two-click detour through the ⋮ menu as the only
way to queue a video. The extension puts the action back on the thumbnail.

It does *not* simulate menu clicks. It calls the same Polymer command YouTube's
own menu item fires:

```
signalServiceEndpoint.actions[].addToPlaylistCommand
  { videoIds, listType: "PLAYLIST_EDIT_LIST_TYPE_QUEUE" }
```

`resolveCommand` is a page-world method, so the call happens in
[`yt-queue-bridge.ts`](src/entrypoints/yt-queue-bridge.ts), injected via
`injectScript` and declared in `web_accessible_resources`. Two notes for anyone
touching it:

- **`openMiniplayer` / `onCreateListCommand` are conditional.** They tell
  YouTube to *create* a queue. Sending them when a queue already exists replaces
  it instead of appending, so they are only included when the miniplayer is not
  already active.
- **It is `injectScript`, not `world: "MAIN"`, on purpose.** Firefox only gained
  MAIN-world content scripts in 128 and the manifest declares
  `strict_min_version: "125.0"`. Raise that floor to 128 and this can become a
  plain `world: "MAIN"` content script. `manifestVersion: 3` is also load-bearing
  here: WXT's MV2 `injectScript` path injects the script inline, and Firefox does
  not exempt inline extension scripts from the page CSP, which YouTube sets to
  `strict-dynamic`.

Firefox additionally requires `cloneInto` to pass the event detail from the
isolated world into the page; Chrome has no such function and needs none. That
branch lives in [`queue.ts`](src/lib/queue.ts).

### Popup startup

Both surfaces render the same [`SettingsPanel`](src/components/SettingsPanel.tsx),
so they cannot drift. It is loaded with `React.lazy` from **both** the popup and
the options page. The options page does not need the saving itself, but a
static import there would place the panel (and sonner) into the chunk it
*shares* with the popup, which the popup then preloads on every open. Lazy on
both sides keeps it a genuinely separate chunk.

Measured on the production build, popup shell only:

| | before | after |
| --- | --- | --- |
| Shared chunk executed before paint | 295 kB | 197 kB |
| DOMContentLoaded | 113 ms | 59 ms |

`popup/index.html` also carries a few inline critical styles: width,
min-height and background. A browser-action popup is sized from the rendered
document, so without them the browser shows a small white rectangle until React
mounts.

**Preact was tried and does not work here.** Aliasing react/react-dom to
`preact/compat` cuts the shared chunk from ~197 kB to ~38 kB, but Base UI's
`useRender` passes element *types* as React element descriptors, which Preact
renders literally as `<[object Object]>`, and every primitive (Button, Checkbox,
Switch, Slider) silently fails to render. It is not fixable by configuration;
it would mean replacing the component library. Don't spend the afternoon on it
a second time.

Note also that the popup document is destroyed every time it closes, so the
framework boots from scratch on each open. There is no way to keep a popup's JS
context alive; a side panel (`chrome.sidePanel` / `sidebar_action`) is the only
surface that persists.

> **Judging popup speed: use `bun run build`, not `bun run dev`.** `wxt dev`
> does not bundle: it serves unbundled ES modules from a Vite dev server, so
> the popup issues hundreds of module requests every time it opens. Measured
> here: production 59 ms to DOMContentLoaded, bundled development build 168 ms,
> `wxt dev` several seconds. Only the first number reflects what users get.

The popup renders from a cached playlist list (`local:cachedPlaylists`) and
refreshes behind it. Without that, every open blocked on waking the MV3 service
worker and paging through the YouTube API, which meant seconds of "Loading..." on an
account with many playlists. The background writes the cache after each
successful fetch, and deliberately leaves it untouched on failure: stale data
beats an empty popup.

## Authentication

The YouTube Data API needs a Google OAuth token. There are two ways to get one.

### 1. Sign in with Google (default)

Uses the hosted token broker in [`server/`](server/index.ts). One click, no
credentials to create.

**Why a server at all?** Google will not issue tokens to a public client. Only
an OAuth client of type *Web application* can register the redirect URIs a
browser extension needs (a *Desktop app* client has no redirect URI field at
all), and that client type always requires a `client_secret` at the token
endpoint, and PKCE is not accepted as a substitute. Embedding the secret in the
extension would make it trivially extractable from the published XPI/CRX, so it
lives on the broker instead.

The broker is **stateless and has no database**. `identity.launchWebAuthFlow`
intercepts the redirect, so the authorization code comes back to the extension,
not through the server; there is no callback hop and no state to correlate.

### 2. Use your own credentials (fallback)

Open settings (gear icon in the popup, or the extension's Options entry), expand
*Advanced*, and paste in your own
client ID and secret. Use this if you would rather not depend on the broker, or
if you hit the cap described below.

> **Restricted scope.** `https://www.googleapis.com/auth/youtube.force-ssl` is a
> Google *restricted* scope. Until the OAuth app completes Google's verification
> (which may include a security assessment), the shared client can only serve a
> limited number of test users. The own-credentials path above is the workaround
> in the meantime.

### Registering the OAuth client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project, then enable the **YouTube Data API v3** under *Library*.
3. Under *OAuth consent screen*, choose **External** and fill in the required
   fields. Add the `youtube.force-ssl` scope.
4. Under *Credentials* → *Create Credentials* → *OAuth 2.0 Client ID*, choose
   application type **Web application**. This is the only type that lets you
   register redirect URIs.
5. Add **both** redirect URIs under *Authorized redirect URIs*:

   | Browser | Redirect URI |
   | --- | --- |
   | Chrome | `https://<extension-id>.chromiumapp.org/` |
   | Firefox | `http://127.0.0.1/mozoauth2/<sha1-of-extension-id>` |

   The options page prints the exact value for whichever browser you are
   running; copy it from there rather than constructing it by hand. Google
   matches the string **byte for byte**, so a stray trailing slash will fail
   with `redirect_uri_mismatch`.

   Do *not* register the `*.extensions.allizom.org` URL that Firefox's
   `identity.getRedirectURL()` returns. It saves fine, but consent-screen
   verification later fails because nobody can prove ownership of
   `allizom.org`. The `127.0.0.1` loopback form (supported since Firefox 86)
   sidesteps this: Firefox intercepts that redirect before it ever hits the
   network, so nothing needs to listen on it.

## Running the broker

The broker is a single stateless file, [`server/index.ts`](server/index.ts). Its
only job is to hold the Google client secret and exchange codes and refresh
tokens against Google's token endpoint.

### Locally, with Bun

```bash
cp server/.env.example server/.env   # add your client ID + secret
bun run server
```

### Locally, in Docker

Use this to test the container itself. It uses the same `Dockerfile` a deployment
builds, so a mistake in it surfaces here rather than in production.

```bash
cp server/.env.example server/.env
```

```bash
docker compose -f server/docker-compose.dev.yml up --build --watch
```

Compose reads `server/.env` automatically. It looks beside the compose file, so
run this from the repository root as written, not from inside `server/`. `docker compose ps` reports
**healthy** within about ten seconds; that healthcheck is deliberately identical
to the deployed one, so it also proves the `bun -e` probe works in an image
shipping neither `curl` nor `wget`.

Editing any file under `server/` reloads the broker in ~3s. Keep the `--watch`
flag: the container also runs `bun --watch`, but that depends on inotify events
crossing the bind mount, which they do on a Linux host and **do not** on Docker
Desktop: the edit lands in the container and the event never arrives. Compose's
own watcher polls from the host, where file events work either way, and restarts
the container. Without `--watch` the mount still carries edits in, but nothing
re-runs them.

The dev file differs from the deployment one in three ways: it publishes
`127.0.0.1:3847` so the extension can reach it (the deployment file publishes
nothing and is reached only by Traefik over `dokploy-network`), it bind-mounts
`server/` for the reload loop above, and it omits `restart:` so a crash stays
down where you can see it.

### Pointing the extension at a broker

Two ways, and the runtime one wins:

| | Where | Applies to |
| --- | --- | --- |
| Build time | `WXT_AUTH_SERVER_URL` in `.env` at the repo root | builds you make yourself |
| Runtime | Settings → *Advanced* → **Token server** | any build, including a published one |

The build-time value is baked into the bundle, so it is no use to somebody who
installed from the store and wants to self-host. That is what the settings field
is for: paste in `https://broker.example.com`, and both the sign-in exchange and
every later token refresh go there instead. Leave it blank to fall back to the
built-in default (`http://localhost:3847` unless overridden at build time).

Changing it is only offered while signed out, since existing tokens belong to
whichever Google client the previous broker was holding.

### Self-hosting for other people

If you are standing one up for others to point at:

1. Register your own OAuth client (see [Registering the OAuth
   client](#registering-the-oauth-client) above) and put the ID and secret in
   the broker's environment.
2. Set `ALLOWED_EXTENSION_IDS` to the extension IDs you are willing to serve.
   Leave it empty and *any* extension can spend your Google client's quota and
   consent-screen reputation; the broker warns loudly at startup when it is.
   Chrome's value is the extension ID; Firefox's is the sha1 shown in the
   `mozoauth2` redirect URI on the settings page.
3. Register each of those extensions' redirect URIs on the client. Google
   matches them byte for byte, and they are per-extension.
4. Serve it over HTTPS. The broker sets `Access-Control-Allow-Origin: *`, which
   is required for an extension origin to call it, and it has no auth of its own
   beyond the extension-ID allowlist.

Your users then paste the URL into Settings → *Advanced* → *Token server*.

### Deploying with Dokploy

`server/docker-compose.yml` is Dokploy-ready.

1. Create a service of type **Compose**, mode **Docker Compose**, *not*
   **Stack**. Only Docker Compose mode runs the real Compose CLI with `--build`,
   so it builds straight from this repo. Stack mode drops `build:` and
   `restart:` and would need a pre-built image in a registry.
2. Set the compose path to `server/docker-compose.yml` (**not** the `.dev.yml`
   next to it; that one publishes a host port and mounts the source).
3. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `ALLOWED_EXTENSION_IDS`
   in the **Environment** tab.
4. In the **Domains** tab add your host with container port **3847**, HTTPS on,
   certificate **Let's Encrypt**.

Dokploy injects the Traefik labels at deploy time; do not write them by hand.
It only strips labels carrying its own generated prefix, so hand-written routers
survive its cleanup and end up competing for the same `Host` rule.

The image is deliberately dependency-free (the broker imports nothing), and the
healthcheck runs through `bun -e` because `oven/bun:1.4.0-slim` ships neither `curl`
nor `wget`.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to
`main` and every PR:

- **build**: install, `tsc --noEmit`, the unit suite, build both targets, then assert the
  manifests are right. The assertions are the point: they catch the failure
  modes that are easy to reintroduce and invisible until a user hits them:
  Firefox silently falling back to MV2, Chrome losing its `service_worker`,
  the gecko ID changing (which would break updates for every existing AMO
  user), and `host_permissions` going missing.
- **broker**: builds the Docker image and smoke-tests it: `/health` responds,
  the `bun -e` healthcheck works (the image has no `curl` or `wget`), and a
  bogus `redirect_uri` is rejected with a 400.

Dependencies are kept current by [Dependabot](.github/dependabot.yml), grouped
so things that must move together (React, WXT, Tailwind, shadcn + Base UI)
arrive in a single PR.

## Tests

`bun run test` runs [Vitest](https://vitest.dev) via
[`vitest.config.ts`](vitest.config.ts), which defines three projects:

| Project | Covers |
| --- | --- |
| `chrome` | Everything under `src/`, with `import.meta.env.BROWSER === "chrome"` |
| `firefox` | Only `*.firefox.test.ts`: code that branches on the build target |
| `server` | The token broker, in a plain node environment |

Extension APIs come from WXT's `fakeBrowser`, IndexedDB from `fake-indexeddb`,
and components are driven with Testing Library.

Two things worth knowing before editing the setup:

- **`bun test` cannot run these.** Bun's runner has no Vite plugin pipeline, so
  `#imports`, WXT auto-imports, the `@/` alias and the browser mock all fail to
  resolve. Bun stays the package manager and launcher; Vitest does the running.
- **`WxtVitest()` does not actually set `import.meta.env.BROWSER`/`FIREFOX`
  under Vitest**, despite the docs saying so. Vitest rewrites `import.meta.env`
  to a `process.env`-backed proxy before Vite's `define` runs, and values that
  do survive arrive as strings, so `FIREFOX` would be `"false"`, which is
  truthy. `vitest.config.ts` therefore carries a small `wxtTestGlobals`
  pre-transform plugin that substitutes real booleans. `auth.firefox.test.ts`
  asserts the flag itself, so if that ever regresses the suite fails loudly
  rather than silently testing the Chrome branch twice.

## Releasing

`.github/workflows/release.yml` builds and zips both targets on a `v*` tag, and
verifies the AMO sources zip actually rebuilds byte-identically. Store
submission is gated behind the repo variable `PUBLISH_TO_STORES` and these
secrets: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`,
`CHROME_REFRESH_TOKEN`, `FIREFOX_EXTENSION_ID`, `FIREFOX_JWT_ISSUER`,
`FIREFOX_JWT_SECRET`.

To publish from your own machine instead, put the same values in `.env.submit`
(see [`.env.submit.example`](.env.submit.example)); `wxt submit` reads that
file automatically, and `bunx wxt submit init` will walk you through obtaining
them. It is gitignored; CI does not use it.

### Environment files

| File | Holds | Copy from |
| --- | --- | --- |
| `.env` | `WXT_AUTH_SERVER_URL`: build-time broker URL | [`.env.example`](.env.example) |
| `server/.env` | Google OAuth client + broker settings | [`server/.env.example`](server/.env.example) |
| `.env.submit` | Chrome Web Store + AMO publishing credentials | [`.env.submit.example`](.env.submit.example) |

All three are gitignored; only the `.example` files are tracked. None is
required to run `bun run dev`: the extension ships no credentials, and the
broker URL has a working default.
