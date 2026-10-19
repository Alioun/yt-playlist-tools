# What modules does the rebuild have?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 04, 07, 10, 16

## Question

Use `codebase-design` to design the module map: deep modules with small interfaces. Likely candidates are a YouTube gateway, the watch tracker, the add pipeline (filters and duplicates), the settings and account store, and the surfaces. Decide:
- where the seams go, so that `bun test` can cover them (see [ticket 04](04-bun-test.md));
- how WXT entrypoints stay thin;
- the folder layout.

Also from [ticket 05](05-ui-stacks.md): happy-dom can't see Tailwind v4 styles or element positions. Decide whether a real-browser test layer is needed, and where it sits.

Also from [ticket 04](04-bun-test.md):
- **Constraints:** keep WXT at the entrypoints; auto-imports off (`imports: false`) with real import paths, or keep `#imports` behind a Bun plugin; read `import.meta.env` in one platform module and pass it in; use injected dependencies as the test seam rather than `mock.module`; run `bun test --isolate`.
- **Bun version:** bump `packageManager` from `bun@1.4.0` to at least 1.4.3, since CI reads that field.
- **Per-browser runs:** inject the platform and run once, or keep separate Chrome and Firefox runs.
- **Coverage:** a policy that accepts no branch coverage.

Also from [ticket 13](13-ui-stack.md): the UI is Svelte 5 + shadcn-svelte / Bits UI ([ADR-0002](../../../docs/adr/0002-svelte-and-bits-ui.md)). The `bun test` setup needs the Svelte plugin and `--conditions browser` from the ticket 05 spike.

Also include:
- **YouTube Music:** its own page adapter, which shares the playlist operations.
- **Modularity:** each feature is an independently loadable unit. A feature that's switched off injects nothing into pages, for example through dynamic content-script registration.

Also from [ticket 11](11-accounts.md): modules for the account reader (main world), the tab registry, the current-account resolver and the private-write guard. A tab only ever receives its own account's setup.

Also from [ticket 26](26-youtube-music-quick-actions.md): the YouTube Music page adapter
- reads availability from each item's menu at hover time;
- checks each action's internals when the page loads;
- serialises queue actions;
- loads only when a YouTube Music feature or playlist shortcuts is on.

The playlist picker loads lazily.

Also from [ticket 10](10-youtube-access.md):
- **The gateway:** one deep module with a `run(job)` interface. Its route table (job → route order) is a data constant.
- **Other modules:** the site core (bridge plus gateway) per site; a registration reconciler in the background; a serving-tab router; a one-at-a-time job queue per tab for YouTube Music queue actions.
- **Teardown:** every feature has one that removes its elements, styles and listeners.
- **Assets:** no web-accessible resources, so in-page assets are inline. WXT's `registration: "runtime"` content-script option likely fits (unverified).
- **Test seams:** recorded responses per job, plus fakes for `scripting.registerContentScripts` and `tabs.query` URL filtering. Check whether WXT's fake browser has them.

Also from [ticket 12](12-adding.md): a single background coordinator orders adds and removals per account, playlist and video. Session memory (undo-skip, recent outcomes) stays in memory only. The private-window write guard covers Missing/Full marks and new-playlist records.

Also from [ticket 07](07-watched.md): the watch tracker is a deep module. A pure core turns readings into counted seconds and the playlists now due, so `bun test` can cover it; a thin player adapter feeds it. Its page script runs on every YouTube page while auto-add is on, to follow the miniplayer.

Also from [ticket 28](28-queue-reorder.md): the YouTube Music queue job queue also handles moves (check the item → fire the drop event → confirm the position). Inserts also turn off the responsive-radio flag.

Also from [ticket 08](08-shortcuts.md) and [ADR-0004](../../../docs/adr/0004-shortcuts-caught-in-page.md): one shortcut engine for both sites. It has a pure matcher (character first, then physical key), pure recorder rules, and a target resolver per site (pointed-at item, whichever moved last, else the current video or playing song). It's testable under `bun test`, with no `commands` fake needed.

Also from [ticket 18](18-breakage.md) and [ADR-0005](../../../docs/adr/0005-breakage-caught-on-device-fixed-by-releases.md):
- **Seams:** the gateway (`run(job)`, `probe()`, a signal sink) and a YouTube page port with four adapters (live, recorded, node, recording).
- **Breakage monitor:** one module in the background. Features declare their required jobs, optional jobs and anchors; the monitor derives each status.
- **Logging:** the page world logs nothing.
- **Watch list:** a module. Runtime probes ship; bundle needles stay in the tools.
- **Fixtures:** the layout plus a privacy lint test.
- **Live-check build:** a separate target, and the release check fails if a store zip contains any of it.
- **Browser tooling:** Playwright works for Chromium only (`channel: "chromium"`); Firefox needs Puppeteer 24.8+ (Firefox 137+) or Selenium.
- **To check:** whether WXT's fake browser covers `action.setBadgeText` and `storage.session`.

Also from [ticket 29](29-youtube-queue-undo.md): the YouTube queue job reads the new entry's `playlistSetVideoId` from the panel data after refresh. Undo removes by it, and overlapping edits are serialised (HTTP 409).

Also from [ticket 24](24-performance-budget.md):
- **One UI kit per site:** a shared kit (`ui-www`, `ui-music`) in its own runtime registration exposes Svelte on a global, and features compile against it. `import()` of shared chunks needs web-accessible resources, so it's out.
- **Feature files:** keep WXT's 3 KB wrapper out of them. Its context also posts a page-visible `window.postMessage` unless that's turned off.
- **Compilation:** page code compiles with `emitCss: false`, and the CSS lives in the JS.
- **The lazy picker** is injected with `scripting.executeScript`.
- **The feature registry** is the single source for both script registration and the size check (`perf-budget.json`).
- **No `wxt:locationchange`:** it polls every second on Firefox before 147.
- **Event budgets:** ≤ 0.1 ms per video tick, key or pointer event, and ≤ 2 ms per navigation. No polling to follow the miniplayer.
- **Tests:** the real-browser layer (Playwright for Chromium, Puppeteer for Firefox) is required to enforce "off means zero", load time, idle cost and teardown.

Also from [ticket 16](16-storage-and-sync.md) and [ADR-0006](../../../docs/adr/0006-local-truth-sync-copies-documents.md):
- **The store:** one deep module in the background with `ready`, `read(view)`, `change(origin, change)` (→ `ok` or a refusal: `private` / `sync-full` / `update-needed`), `subscribe`, `removeSetup` and `clearAll`.
- **Seam:** one port for the three storage areas, with real adapters and a fake sync area enforcing 102,400 / 8,192 / 512 and Chrome's 120 writes a minute and 1,800 an hour. Two fakes on a fake "server" stand in for two browsers.
- **Pure parts:** document codecs, migrations, the private-write table, the budget counter, the chunker and the conflict rule.
- **Guard test:** it fails if anything outside the store calls `storage.*.set`, `remove` or `clear`. Content scripts get a tab view from the background and never read storage.
- **Start-up order:** the migration runs first at background start. The reconciler waits for the store and registers nothing without consent.
- **Watch progress:** written on pause, on leaving the video, when the tab is hidden, and every 60 s. At most 2,000 videos per account and 100 played stretches per video.

## Answer

Resolved 2026-10-19. The user delegated the decisions, so each judgement call names its runner-up and why it lost. This answer folds in every "Also from" note above, the Answers of tickets [04](04-bun-test.md), [07](07-watched.md), [08](08-shortcuts.md), [09](09-where-things-live.md), [10](10-youtube-access.md), [11](11-accounts.md), [12](12-adding.md), [16](16-storage-and-sync.md), [18](18-breakage.md), [24](24-performance-budget.md) and [26](26-youtube-music-quick-actions.md), the amendments from [28](28-queue-reorder.md) and [29](29-youtube-queue-undo.md), and [ticket 25](25-live-checks.md)'s signed-out findings. Two throwaway spikes and a source check back the risky parts, in Chrome and Firefox ([section 13](#13-evidence)). The vocabulary is `codebase-design`'s: **module**, **interface**, **seam**, **adapter**, **depth**.

**In short:**
- **Five runtime contexts:** the background, the page (MAIN) world, the isolated world, the popup, and the extension's own pages (settings and onboarding). Two more targets exist only at build time: the live-check build and the CI watch tools.
- **The page world runs one module, the gateway.** Every feature runs in the isolated world and reaches YouTube's page only through the gateway, so one page port covers everything `bun test` replays (ADR-0005).
- **Two script registrations per site, made at runtime:** `pp-<site>-page` (MAIN: the gateway) and `pp-<site>` (isolated: an ordered list of core, kit and every feature that's on). Page code is WXT *unlisted scripts*, so no WXT content-script wrapper and no manifest `content_scripts` or `web_accessible_resources`.
- **One Svelte copy per page:** the UI kit carries the runtime and features link to it through an isolated-world global (proven in Chromium; the shared global and file order confirmed in Firefox too). The lazy popovers (picker and watch-page menu) carry their own copy with Bits UI.
- **One feature registry** is the single source for script registration, the size check, breakage status, the settings lists and the real-browser tests.
- **The background owns everything that spans tabs or writes storage:** the store, the registrar, the tab router, the add flow and the breakage monitor. Tabs only run jobs and draw.
- **Seams with two or more adapters each:** `PagePort` (live, recorded, node, recording), `StorageAreas` (browser, fake with real quotas), `ScriptingPort`, `TabsPort`, `AccessPort`, `Transport` (runtime, in-memory), `PageChannel` (DOM events, direct) and the UI's `Backend` (browser, fake).
- **Tests:** unit, recorded-response and fake-browser/DOM layers in `bun test`; a real-browser layer on the built extension (Playwright for Chromium, Puppeteer for Firefox); plus ticket 18's daily watch and signed-in live check.
- **Tooling:** Bun 1.4.3, one `bunfig.toml`, four preloads, a 24-line Svelte plugin, `bun test --isolate --conditions=browser`, and CI jobs `check`, `build`, `browser`, plus a scheduled `watch.yml`.

### 1. The contexts at a glance

```
 popup ─────┐  ui.* messages                ┌──────────── background (Chrome service worker / Firefox event page) ───────────┐
 settings ──┼──────────────────────────────▶│ Router ─┬─ Store ───────────── StorageAreas {local, session, sync}            │
 onboarding ┘  storage.local: read-only,    │         ├─ Registrar ───────── ScriptingPort · AccessPort · feature registry   │
               direct, for the first paint  │         ├─ Tabs ────────────── TabsPort   (tab registry, serving tab, account) │
                                            │         ├─ AddFlow ─────────── exec(job) through Tabs                          │
                                            │         ├─ Monitor · Badge ─── action                                          │
                                            │         └─ Playlists · Accounts · Diagnostics                                  │
                                            └──────────────────────────────────▲───┬───────────────────────────────────────────┘
                                                      tab.* (runtime.sendMessage) │   │ bg.* (tabs.sendMessage, frame 0)
 ┌─ a YouTube tab ────────────────────────────────────────────────────────────────┴───▼───────────────────────────────────────┐
 │ ISOLATED world, registration pp-www, injected in this order:                                                              │
 │   core-www.js      SiteCore: ExtLink · PageLink · TabView · FeatureHost · Items · Pointer · Keys                           │
 │   kit-www.js       Kit: the Svelte runtime (linked) · one shadow host · Toaster · Overlay · components · YouTube skin       │
 │   feature-*.js     one file per feature that is on: definePageFeature({ start(ctx) })                                    │
 │   popovers.js      lazy, by scripting.executeScript: picker + watch-page menu (own Svelte + Bits UI)                      │
 │        ▲▼ PageChannel: CustomEvents carrying JSON strings; item jobs are dispatched on the item's element                 │
 │ MAIN world, registration pp-www-page:                                                                                     │
 │   page-www.js      Gateway: route table · lanes · account guard · parsers · effect checks ── PagePort (live) ── YouTube    │
 └────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
 A YouTube Music tab is the same shape: page-music.js, core-music.js, kit-music.js and its features.
```

### 2. The decisions that shape the map

**D1. Only the gateway runs in the page world.**
- Features never ship page-world code. Player readings, item `data`, `ytcfg` and YouTube Music's queue are reached through gateway jobs and streams ([section 3.2](#32-page-world-srcpage)).
- Why: ADR-0005 tests YouTube "through one page port". Feature code in the page would be a second way into YouTube's internals that recorded tests can't replay. It also keeps settings out of the page (ticket 10) and keeps Svelte, whose templates use `innerHTML`, out of the Trusted-Types page world (ticket 05).
- *Runner-up:* a page-world part per feature (for example auto-add's player reader). It lost because it bypasses the page port, adds a registration per feature per world, and pushes settings such as percentages into the page.
- **Consequence:** the site core's page half carries every job of its site, including jobs only some features use. It stays inert until asked. Ticket 24's core budget already counts it that way (the YouTube Music gateway "with the queue-state writes").

**D2. Page code is WXT unlisted scripts, never WXT content scripts.**
- `defineUnlistedScript` builds each file as its own IIFE with a 253 B gzip wrapper (spike A). A `defineContentScript` file carries `ContentScriptContext` (about 3 KB) and posts a page-visible `window.postMessage` (ticket 24).
- The background registers the built files itself, so `registration: "runtime"` isn't needed. That settles ticket 10's open question.
- *Runner-up:* WXT content scripts with `registration: "runtime"`. It lost on the wrapper's weight and its page-visible trace.

**D3. Two registrations per site; the isolated one is an ordered file list.**
- `pp-www-page`: MAIN world, `js: ["page-www.js"]`, `runAt: "document_start"`.
- `pp-www`: isolated world, `js: ["core-www.js", "kit-www.js"?, …the features that are on, in registry order]`, `runAt: "document_idle"`.
- Both match only their site, top frame only, with `persistAcrossSessions: true`. YouTube Music has `pp-music-page` and `pp-music`.
- Switching a feature on or off rewrites `pp-www`'s list with `scripting.updateContentScripts`.
- Why: files in one entry's `js` list run in order (documented by Chrome and MDN, and observed in both browsers), so the kit is always there before a feature reads it. Order between *separate* registrations isn't specified, and compiled Svelte components touch the runtime as soon as their file runs, so "wait on a promise" (ticket 24's idea) can't work for them.
- *Runner-up:* ticket 10's one registration per piece (`core-www`, `ui-www`, `feature-<name>`). It lost on the ordering problem, and because each switch would then mean several API calls instead of one atomic list update.

**D4. In eager page scripts, Svelte is linked, not bundled.**
- The kit bundles Svelte and installs the module namespaces on `globalThis.__pp.svelte`. Feature builds mark `svelte` and `svelte/*` external and map them to that global, using Vite's standard library pattern (`external` plus `output.globals`), through WXT's `vite:build:extendConfig` hook. Spike A: a feature with a component built to 875 B gzip with no Svelte runtime in it.
- Features also import the kit's own components and helpers as `$kit`, linked the same way to `__pp.kit.lib`.
- **The kit exports only the Svelte names page scripts use.** Exporting the whole `svelte/internal/client` namespace cost 32.6 KB gzip; 58 named exports cost 19.8 KB (spike A). So the link plugin records every name the linked builds import, the kit builds last (WXT's `entrypoints:grouped` hook reorders the groups) and exports exactly that set. Dev builds export the full namespace.
- *Runner-up:* the kit owns every in-page component and features call `kit.mount("QuickSave", …)`. No linking is needed and Svelte tree-shakes in one bundle. It lost because a feature's UI would load while that feature is off, and its UI code would live far from its logic.

**D5. The lazy popovers carry their own Svelte copy.**
- `popovers.js` holds the playlist picker and the watch-page button's menu (ticket 09), with Bits UI. It's injected on first use, or on hover intent, by `scripting.executeScript`.
- Why: Bits UI uses many Svelte internals. Linking it to the kit would make the eager kit export them on every page view. Ticket 24 measured the self-contained picker at 46.4 KB and 38 ms to paint, inside its budget.
- It mounts into the kit's shadow host as plain DOM, never as a child component of the kit, because two Svelte copies can't nest components.
- *Runner-up:* link the popovers to the kit's runtime (ticket 24's 38 KB variant). It lost on eager kit weight.

**D6. The site core holds the in-page machinery several features share.**
- That covers item recognition (cards and rows, and ticket 18's self-check), pointer and focus tracking, and the one key listener for every shortcut feature.
- Why: four YouTube features use item recognition, including the card menu, which loads no kit. Two shortcut features share the undo key and the rule "one key, one shortcut, per site", which one listener enforces naturally.
- **"Off costs nothing" is kept by effects:** the core adds no listener, observer or element until a feature that's on asks for one, and its code loads only while some feature on that site is on.
- *Runner-up:* each shortcut feature carries its own listener and matcher, as ticket 24's table assumed. It lost because two listeners would have to coordinate the shared undo key and clashes.

**D7. Everything that spans tabs, or writes storage, runs in the background.**
- The add flow (ticket 12's coordinator), the store (ticket 16), the registrar, the tab router and the breakage monitor all live there. A tab runs jobs on request and draws its own UI.
- *Runner-up:* the add flow in the tab, with only locks in the background. It lost because ticket 12's cross-tab ordering, session skips, recent adds and marks are background state anyway, and a decision split across two contexts can't be tested in one place.

**D8. One-shot messages only: no long-lived ports.**
- Tabs call `runtime.sendMessage`; the background calls `tabs.sendMessage(tabId, msg, { frameId: 0 })`. The background pushes a new tab view to every known tab after a change.
- *Runner-up:* one `runtime.connect` port per tab. It lost because ports keep neither background alive: since Chrome 114 an open port no longer resets the 30 s idle timer, Firefox closes ports when its event page idles, and both disconnect the port. Every tab would need reconnect logic.

**D9. One test run covers both browsers; the platform is injected.**
- Only `src/shared/platform.ts` reads `import.meta.env`. Code that differs per browser takes a `Platform` value, so a test runs both variants side by side.
- *Runner-up:* separate Chrome and Firefox runs with two bunfigs. It lost because it doubles CI time, re-tests what injection already covers, and invites Bun 1.4.0's stale-`define` class of bug. Build-time differences (the manifests) are checked on both builds instead.

**D10. The raw `DATASYNC_ID` never leaves its tab.**
- The isolated core computes the account key (ticket 16's 16-character SHA-256 digest) and sends only that. Gateway answers carry the raw ID, which the core turns into a key before anything leaves the tab.
- This refines ticket 16, which had the background compute the digest. *Runner-up:* ticket 16's version. It lost because the raw ID would cross the messaging channel and sit in background memory for no gain.

### 3. The module map

Each deep module lists its interface, what it hides, where it runs, its seams and adapters, and how it's tested. Signatures are TypeScript and normative in shape. Names of fields are illustrative where ticket 20's spec owns the detail.

#### 3.1 Shared kernel (`src/shared/`)

Plain TypeScript, importable from every context. No `browser`, no DOM side effects, no WXT.

| Module | Interface (abridged) | What it holds |
|---|---|---|
| `platform` | `platform: Platform` with `{ browser: "chrome" \| "firefox", mode, build }` | The only reader of `import.meta.env`. Everything else takes a `Platform`. |
| `contracts/` | The types in [section 6](#6-messaging-contracts): `Job`, `JobResult`, `Stream`, `TabView`, `Change`, `ChangeResult`, `AddRequest`, `AddReport`, `BreakageSignal`, the three message maps, plus a type guard per incoming message | The language every context speaks |
| `rpc` | `createRpc<Map>(transport)` → `call(kind, payload)`, `handle(handlers)`; `Transport` = `{ send, listen }` | Typed request/response over a transport. Adapters: `runtime` (browser messaging) and `memory` (tests wire contexts in one process) |
| `model/` | Document types and codecs: `decodeSettings(raw) → Settings`, same for `Setup`, `Filter`, `Device`; `defaults`; key and ID validators | Ticket 16's shapes; absent means defaults; unknown fields are kept |
| `features/registry` | `features: FeatureDef[]`, `libraries`, helpers `filesFor(site, settings)`, `healthFor(id)` | [Section 4](#4-how-features-plug-in) |
| `rules/channel-filter` | `decide(filter \| undefined, channel: ChannelId \| null) → "pass" \| "filtered" \| "unknown-blocked"` | The channel-filters spec, unchanged |
| `rules/outcomes` | `failureOf(answer) → Failure`, `toastPlan(report, featureFeedback) → ToastPlan` | Ticket 12's failure table and its "shown with feedback off" column, as data |
| `copy/` | `toastText(plan, titles, site) → string` | Ticket 12's and 26's copy rules (quotes, 40-character cuts, lists, "song" on YouTube Music) |
| `keys/` | `match(event: KeyFacts, bindings) → Binding \| null`, `recorder(state, event) → RecorderStep`, `display(key, os)` | Ticket 08's matcher (character first, then physical key) and recorder rules |
| `picker/model.svelte.ts` | `new PickerModel({ source, site, mode })` with `rows`, `query`, `membership`, `tick(id)`, `untick(id)`, `pin(id)`, `create(title, privacy)` | One playlist-picker behaviour for the in-page popovers and the popup |
| `watchlist` | `watch: WatchEntry[]` with each entry's ID, site, dependent jobs and features, and runtime probe | Ticket 18's watch list (the static needles live in `tools/`, never in the package) |

#### 3.2 Page world (`src/page/`)

The only code in YouTube's own JavaScript world. It logs nothing (ticket 18), imports no Svelte, and holds no settings.

**Gateway** (deep): one per tab, created by `page-www.js` or `page-music.js`.

```ts
interface Gateway {
  run<J extends Job>(job: J, ctx?: { target?: Element }): Promise<JobResult<J>> // never throws
  watch<S extends Stream>(stream: S, onData: (d: StreamData<S>) => void): () => void
  probe(): Promise<ProbeReport> // which watch-list entries are present, for breakage and Check now
}
createGateway(opts: { site: Site; routes: RouteTable; page: PagePort; signals: (s: BreakageSignal) => void }): Gateway
```

- **Jobs** cover reads and writes alike, because ticket 10 gives reads routes and fallbacks too: `account`, `accountLabel`, `membership`, `playlists`, `add`, `remove`, `create`, `channelOf`, `resolveChannel`, `videoInfo`, `queueAdd`, `queueUndo`, `openCardMenu`; on YouTube Music also `save`, `unsave`, `like`, `queueInsert`, `queueRemove`, `queueMove`, `queueReinsert`, `nowPlaying`, `itemInfo`, `castState`.
- **Streams:** `player` (ticket 07's readings, on each `timeupdate` of `#movie_player` or `#shorts-player`), `nav` (page type and video, from YouTube's own navigation events), and on YouTube Music `nowPlaying` and `queue`.
- **Hides:**
  - the route table (one constant per site, ticket 10 §6) and its order;
  - when a route qualifies, and "route unavailable" versus "job failed";
  - writes never run twice;
  - the account guard: it trips on the first answer for another `datasyncId` and refuses account jobs from then on;
  - two lanes per tab, each running one job at a time in order: the **app-state lane** (queue edits and likes, which change YouTube's own state in the tab) and the **playlist lane** (playlist reads and writes). Page reads skip the lanes. This serves ticket 10's "one at a time per tab" without a 10 s queue check holding up a picker read;
  - success by effect: YouTube Music queue growth, ticket 28's position check, ticket 29's `playlistSetVideoId` read-back and the HTTP 409 retry, plus turning off the responsive-radio flag after inserts (ticket 28);
  - toast suppression: stripped `commands`, response actions never run;
  - the signed request's `SAPISIDHASH` headers (computed here from the port's cookie read, never stored or passed on);
  - the parsers for every known shape, and which breakage signal to raise.
- **YouTube Music shares the playlist operations:** one gateway engine, the same parsers for membership, saves, create and labels, and the same add flow in the background. Only the route table and the live adapter differ per site.
- **Item jobs are targeted:** the isolated core dispatches the job's event on the card or row element itself, and the gateway reads `event.target` there (spike A: a page-world property on the card was visible to the gateway and not to the isolated world). No marker attributes are written into YouTube's DOM.
- **Seam: `PagePort`** (ticket 18's page port, the gateway's only way into YouTube):

  ```ts
  interface PagePort {
    config(key: string): unknown                            // ytcfg.get, read when the job runs
    cookie(name: string): string | null                     // for the signed request only (www)
    request(path: string, body: unknown, headers: Record<string, string>): Promise<HttpAnswer>
    command(cmd: unknown, target?: Element): Promise<CommandAnswer>  // YouTube's resolver, found by shape (ticket 25)
    serviceRequest(endpoint: unknown): Promise<CommandAnswer>        // yt-service-request
    music: MusicPort                                        // networkManager.fetch, handlers, app.queue, menu item, reorder drop
    read(what: PageRead, target?: Element): unknown         // player response, nav detail, element data, mediaSession, <video> state
    on(event: PageEvent, cb: (detail: unknown) => void): () => void
    has(id: WatchId): boolean
  }
  ```

  | Adapter | Where | What it does |
  |---|---|---|
  | **live** (`live-www.ts`, `live-music.ts`) | production page scripts | One call per operation on `window`, no logic. It locates hooks such as `default_kevlar_base.<key>.instance.resolveCommand` by shape at load (ticket 25). |
  | **recorded** | `bun test` | Replays `fixtures/youtube/**` answers, with small in-memory fakes for page state (YouTube Music's queue, the miniplayer's queue data, a scripted player) |
  | **node** | `tools/watch` (CI static watch) | Plain signed-out `fetch` to youtube.com; every other operation reports "unavailable" |
  | **recording** | live-check build only | Wraps live and captures answers for the fixture import |

- **Tested by:** layer 2 (recorded responses), the full matrix in ticket 18 §2.

**PageChannel, page side** (`page/channel.ts`): `servePage(gateway, { site, build }, win)`.
- It decodes `ppt:req` events, runs the job (with `event.target` as the job's target), answers with `ppt:res` on `document`, forwards stream data and signals, and answers `hello` with the build ID and a snapshot (signed in, account, page type, current video).
- **Stale cores:** a `hello` from a newer build makes an older gateway stop answering. See [section 5.5](#55-switching-injecting-and-updates).
- **Seam:** `PageChannel` has two adapters: DOM `CustomEvent`s in production, and `direct` in tests, which still round-trips through `JSON.stringify` so anything that can't cross the worlds fails in `bun test`.

#### 3.3 Isolated world (`src/site/`)

**SiteCore** (`site/core/`), deep. One per tab, installed by `core-<site>.js` on `globalThis.__pp.core`. Features never import it; they're handed a context.

```ts
interface FeatureContext {
  readonly site: Site
  readonly view: Readable<TabView>                       // this tab's view: features on here, their options, own account's setup and filters, statuses
  readonly scope: Scope                                  // everything the feature adds goes through it; disposed on switch-off
  run<J extends Job>(job: J, opts?: { target?: Element }): Promise<JobResult<J>>   // in-tab job through the gateway
  can(job: JobId): boolean                               // a route for this job exists in this tab (the gateway's probe at load, ticket 26)
  watch<S extends Stream>(stream: S, cb: (d: StreamData<S>) => void): void         // auto-unwatched by scope
  add(req: AddRequest): Promise<AddReport>               // through the background add flow
  undo(handle: UndoHandle): Promise<UndoReport>
  change(c: Change): Promise<ChangeResult>               // e.g. "Don't auto-add this video", Pause
  progress: { load(video: VideoId): Promise<Parts | null>; save(video: VideoId, len: number, parts: Parts): void }  // auto-add only (ticket 16 §7)
  items: Items                                           // pointed-at item, current item, closest card, page-settle check
  keys: Keys                                             // bind(bindings) → auto-unbound by scope
  report(s: FeatureSignal): void                         // anchors, cosmetic gaps → background monitor
  expose(name: string, fn: () => unknown): void          // answers background queries, e.g. the popup's "This video"
  popovers(): Promise<Popovers>                          // lazy: asks the background to inject popovers.js
  kit?: Kit                                              // present when the registry lists "kit" for this feature
}
```

- **Hides:**
  - **ExtLink:** the tab's side of [section 6.2](#62-tab--background): hello, the tab view, pushes, job requests from the background, and detecting an orphaned context after an update.
  - **PageLink:** the isolated side of the page channel, request IDs, timeouts, the hello handshake, and the account-key digest (D10).
  - **FeatureHost:** feature definitions arrive as their files run (`__pp.core.define`). A feature starts when its definition is present *and* the tab view says it's on, and is disposed when the view says off. Defining twice is a no-op, which makes injection idempotent.
  - **Scope:** `on(target, type, fn, opts)`, `observe(el, init, fn)`, `timeout(fn, ms)`, `mount(Component, props, where)`, `add(dispose)`. Disposing the scope removes every element, style, listener, observer and timer the feature made. That is ticket 10's teardown, guaranteed by construction rather than per feature.
  - **Items** (per site: `items-www.ts`, `items-music.ts`): ticket 14's and 27's item selectors, "whichever moved last" (ticket 08), delegated `pointerover`/`focusin` tracking that exists only while some feature tracks, the markup-independent self-check and the page-settle check (ticket 18 §5.1). On YouTube Music, item details come from the gateway's `itemInfo` job, targeted at the row.
  - **Navigation** comes from the gateway's `nav` stream (YouTube's own navigation and player events), never WXT's `wxt:locationchange`, which polls on Firefox before 147 (ticket 24). Nothing in the core polls.
  - **Keys:** one capture-phase `keydown` listener on `window`, present only while some binding exists. It ignores typing, IME, open menus and dialogs, auto-repeat and pending actions; matches with `shared/keys`; calls `preventDefault()` and `stopImmediatePropagation()` on a match. Bindings with the same action ID (the undo key from both shortcut features) count once.
- **Seams:** `Transport` (runtime or memory) for ExtLink, `PageChannel` (DOM or direct) for PageLink. Both have two adapters.
- **Tested by:** layer 3, in happy-dom, with a memory transport and a direct page channel to a real gateway over the recorded page.

**Kit** (`site/kit/`), deep. One per page, installed by `kit-<site>.js` on `globalThis.__pp.kit`.

```ts
interface Kit {
  toast: Toaster    // show(spec): ToastHandle; undoCurrent(); notice(spec) for ticket 18's sticky notice
  overlay: Overlay  // attach(anchor: Element, content): OverlayHandle; one hover/focus overlay per page (ticket 24)
  host: ShadowRoot  // the one open shadow root (isolateEvents: true, ticket 08), for popovers.js to mount into
  lib: KitLib       // the $kit module: components (IconButton with idle/busy/done/failed/unconfirmed, SplitButton, StatusPill, Toast), icons, skin tokens
}
```

- **Hides:**
  - the Svelte runtime and its linked exports ([D4](#2-the-decisions-that-shape-the-map));
  - one shadow host, built with `@webext-core/isolated-element` directly (`mode: "open"`, which isn't its default, and `isolateEvents: true`), since there's no WXT content-script context;
  - the site skin (`--yt-sys-color-baseline--*` with ticket 18's fallback palette and its `cosmetic` signal);
  - moving the host into `document.fullscreenElement` (ticket 14 decides whether toasts show or wait);
  - the toaster's rules: one toast at a time, 6 s, held on hover or focus, held while the tab is hidden, the newest failure kept (tickets 12 and 26).
- **Not in the kit:** Bits UI, Tailwind and shadcn styles (ticket 24).
- **Tested by:** layer 3 (happy-dom and Testing Library) for behaviour; layer 4 for positions, styles and fullscreen.

**Features** (`site/features/<id>/`): each is `definePageFeature({ id, site, start(ctx) })`. `start` uses only the context and `$kit`, and returns nothing; teardown is the scope's.

| Feature (registry ID) | Sites | Deep part, and where its logic sits |
|---|---|---|
| Auto-add (`auto-add`) | www | **Watch tracker** (below), fed by the gateway's `player` stream. Progress is loaded and saved through the background (ticket 16 §7). Due playlists go to `ctx.add`. Exposes `status` for the popup's This video. |
| Playlist shortcuts (`shortcuts`) | www, music | Binds its keys, the picker key and the undo key. Resolves the target with `ctx.items`; calls `ctx.add` or opens the picker. One source, two files (`feature-shortcuts-www`, `feature-shortcuts-music`), because the music file loads only with "Also on YouTube Music". |
| Quick-save (`quick-save`) | www | Split button through the kit's overlay; one click → `ctx.add`; ▾ → popovers; hover on ▾ preloads them |
| Add to queue button (`queue-button`) | www | Overlay button with four states; `queueAdd` targeted at the card; Undo through `queueUndo` |
| Watch-page button (`watch-button`) | www | The pill after Save (ticket 09) showing auto-add's state; its menu is in popovers |
| Right-click card menu (`card-menu`) | www | No kit. A capture `contextmenu` listener; `openCardMenu` targeted at the card |
| Quick actions (`music-actions`) | music | One hover overlay over rows, cards, headers and queue items; availability from `itemInfo` at hover; queue jobs; Save and Like; Undo |
| Quick-action shortcuts (`music-keys`) | music | Binds ticket 26's keys and the undo key; targets via `ctx.items` |
| Settings sync (`sync`) | none | No page part; it's in the registry for the settings lists and first run |

**Watch tracker** (`site/features/auto-add/tracker.ts`), deep and pure.

```ts
createTracker(init: { video: VideoFacts; remembered?: Parts; goals: Goal[]; paused: boolean; skipped: PlaylistId[] }): Tracker
interface Tracker {
  reading(r: Reading): TrackerUpdate   // r: { at, videoId, pos, len, rate, playing, seeking, ad, player: "watch" | "shorts", live flags }
  settings(s: { goals?: Goal[]; paused?: boolean; skipped?: PlaylistId[] }): TrackerUpdate
}
type TrackerUpdate = { state: TrackerState; counted: number; due: PlaylistId[]; persist?: Parts }
```

- **Hides:** all of ticket 07's counting rule (stretches, the 1 s gap, (elapsed × rate) + 1 s, the goal clamp), live and clip and made-for-kids exclusion, length checks and "can't measure", one run per playlist per playback, and when progress should be saved (pause, leaving, hidden, every 60 s).
- The player feed that turns gateway stream data into readings is a thin adapter beside it.
- **Tested by:** layer 1, table-driven, with no DOM.

**Popovers** (`site/popovers/`): `popovers.js`, lazy.
- **Interface:** `openPicker({ ctx, item, anchor, mode: "pick" | "choose" })` and `openWatchMenu({ ctx, anchor })`. Both views are thin; the picker's behaviour is `shared/picker/model.svelte.ts`.
- **Hides:** Bits UI positioning, focus and dismissal inside the kit's shadow root (`BitsConfig defaultPortalTo`), search, membership states, per-row results, the new-playlist form.
- **Tested by:** layer 3 (spike B ran a Bits UI Popover in a shadow root, closed with Escape) and layer 4's first-open timing.

#### 3.4 Background (`src/background/`)

**Store** (deep): ticket 16's module, refined.

```ts
interface Store {
  ready(): Promise<"ok" | "newer-layout">                     // migrations run once per start, first
  read<V extends View>(view: V, args?: ViewArgs<V>): Promise<ViewData<V>>  // settings, device, setup, filters, cache, progress, session, syncStatus, tabView
  change(origin: Origin, change: Change): Promise<ChangeResult>             // ok | { refused: "private" | "sync-full" | "update-needed" | "invalid" }
  subscribe(fn: (e: StoreEvent) => void): () => void                       // which documents changed, edited here or synced in
  clearAll(origin: Origin, opts: { alsoSynced: boolean }): Promise<void>
}
```

- **Change** is one discriminated union for every write: settings edits, setup edits (removing a setup included), filters, cache absorbs, marks, progress, session memory (pause, skips, recent adds, cooldowns, shown-once, breakage, the tab registry), device fields, the sync join choice. Ticket 16's `removeSetup` becomes a change kind, which keeps the interface at five members.
- **Hides:** the storage layout and prefixes, codecs and stamps, migrations from 1.4.5 and 1.5.0, the private-write table, the budget counter, the chunker, tombstones, the replicator (join, conflicts, push scheduling, rate-limit retry), progress pruning and caps, cache freshness.
- **Origin** is computed by the router from `sender`, never taken from a message (ticket 16 §8): `{ kind: "tab", tabId, incognito }`, `{ kind: "ui", windowId, incognito }`, `{ kind: "background" }` or `{ kind: "sync" }`.
- **Seam: `StorageAreas`** `{ local, session, sync }`, each `{ get, set, remove, clear, onChanged }`.
  - Adapters: **browser** (`browser.storage.*`); **fake** (WXT's fake browser for local and session, plus `tests/fakes/sync-area.ts` with ticket 16's quotas, Chrome's write rates and delayed, reordered or dropped delivery); **fake server** joining two or more fake sync areas to stand in for browsers.
- **Tested by:** layer 1 for the pure parts (codecs, migrations, private table, budget, chunker, conflict rule) and layer 3 through the interface over the fakes.

**Registrar** (deep): ticket 10's reconciler.

```ts
interface Registrar {
  reconcile(): Promise<void>                                   // idempotent; serialised; runs on start, store changes, access changes, install/update
  ensure(tabId: number, what: { core?: boolean; popovers?: boolean }): Promise<void>  // on-demand probe, lazy popovers
}
```

- **Hides:** the desired set, which is a pure function `desired(registry, settings, consent, access, schemaOk) → RegisteredScript[]` ([section 5.2](#52-registrations)); the diff against `getRegisteredContentScripts()`; injecting newly-on features (and the core and kit when missing) into open matching tabs; injecting into open tabs after an extension update; Chrome 133's `addHostAccessRequest` on open tabs while a feature for that site is on and access is missing (ticket 09).
- **Order of start-up:** nothing registers before `store.ready()` resolves "ok", and nothing registers without consent (ticket 16).
- **Seams:** `ScriptingPort` (register, update, unregister, list, executeScript) and `AccessPort` (`contains`, `onAdded`, `onRemoved`). Adapters: browser and fake. WXT's fake browser has neither `scripting` nor `permissions` (verified, spike B).
- **Tested by:** layer 1 for `desired` and the diff; layer 3 with the fakes; layer 4 for real registration, order and teardown.

**Tabs** (deep): ticket 11's tab registry and current-account resolver, and ticket 10's serving-tab router.

```ts
interface Tabs {
  seen(tabId: number, info: TabInfo): void                                  // from hello and pings
  accountInView(req: Requester): Promise<AccountInView>                    // ticket 11's order
  runIn(tabId: number, job: Job): Promise<JobResult>                        // the tab an action came from
  serve(job: Job, need: { site: Site; acct?: AcctKey; signedIn?: boolean; req: Requester }): Promise<JobResult | NoTab>
  push(fn: (tabId: number, info: TabInfo) => unknown): Promise<void>        // e.g. a new tab view to every known tab
}
```

- **Hides:** candidate queries by site, window kind (private only for private), discarded and frozen tabs skipped, ordering (active, known account by `lastAccessed`, unknown), 2 s pings, on-demand core injection, account matching, the registry kept in session memory through the store, and private tabs kept in memory only.
- **Seam: `TabsPort`** `{ query(site), get(tabId), send(tabId, msg, timeoutMs), windowOf(windowId) }`. Adapters: browser; fake with `lastAccessed`, `discarded`, `frozen` and `incognito`, whose tabs can be wired to in-process site cores. WXT's fake `tabs.query` matches `url` only by exact string and has no `lastAccessed` (verified, spike B), so it can't stand in here.

**AddFlow** (deep): ticket 12's coordinator.

```ts
interface AddFlow {
  add(req: AddRequest, origin: Origin): Promise<AddReport>         // { outcomes: Record<PlaylistId, Outcome>, toast: ToastPlan | null, undo?: UndoHandle }
  remove(req: RemoveRequest, origin: Origin): Promise<RemoveReport> // the picker's untick (PROVISIONAL in ticket 12)
  undo(handle: UndoHandle, origin: Origin): Promise<UndoReport>
}
```

- **Hides:** ticket 12's order of checks; locks per account, playlist and video; the 60 s memory of recent adds; the 429 pause per account; "already in" from a later add; the 30 s wait after creating a playlist; outcome mapping; Missing and Full marks; shown-once rate limits (the report says whether to toast, stay silent, or log only); undo entries (memory only) and session skips; private-window refusals; Try again.
- **Dependencies:** `exec` (`Tabs.runIn` for an in-tab add, `Tabs.serve` for one from the popup), the store, and the playlists module (membership reads refresh the cache).
- **Tested by:** layer 3 with a scripted `exec`, and end to end with the real gateway over recorded answers.

**Monitor and Badge** (deep): ticket 18's breakage monitor.

```ts
interface Monitor {
  signal(tabId: number, s: BreakageSignal): void
  succeeded(tabId: number, job: JobId): void
  statuses(scope: { tabId?: number; site?: Site }): FeatureStatuses
  subscribe(fn: () => void): () => void
}
```

- **Hides:** `deriveStatus(registry health declarations, signals) → statuses` (pure, table-tested); thresholds (3 timeouts, 2 no-effects, ticket 18's starting values); notice-once memory; signals from private tabs kept in memory only.
- **Badge** is a pure `badgeFor(tab, state) → { text, color, title }` with ticket 09's priority (site access, consent, Missing or Full, not working), plus the PROVISIONAL per-tab tick. It's applied through `browser.action`, which WXT's fake browser implements, so it needs no port.

**Smaller background modules:**
- **Playlists:** `list(acct, { refresh, req })`, `create(...)`, `resolveChannel(input, req)`, `absorb(answer)`. Hides ticket 16 §6's freshness and merge rules.
- **Accounts:** `onSeen(acct, tab)`. Hides the 24 h label check and claiming the 1.x setup after consent (a pure `claim(unclaimed, owned, existing) → { setup, dropped }`).
- **Diagnostics:** `report() → string`, `checkNow() → CheckResult`. Hides ticket 18 §6's never-contains list.
- **Router:** maps each message kind to one module call, validates it with the contract's guard, and computes `Origin` from `sender`.
- **Boot:** registers every listener synchronously in the worker's first turn (an MV3 requirement), and each handler awaits `store.ready()` before doing anything.

#### 3.5 Popup, settings and onboarding (`src/ui/`)

- **Backend** (the UI's one seam):

  ```ts
  interface Backend {
    load(): Promise<UiSnapshot>                          // one storage.local.get for the first view (ticket 24)
    watch(fn: (e: UiEvent) => void): () => void          // storage.onChanged
    change(c: Change): Promise<ChangeResult>             // through the background; the popup adds its window ID
    call<K extends UiCall>(kind: K, args: UiArgs<K>): Promise<UiResult<K>>
    access: { has(site: Site): Promise<boolean>; request(site: Site): Promise<boolean> }  // request() runs first in the click handler
  }
  ```

  Adapters: **browser**, and **fake**: in-memory, scripted, used by component tests and by tickets 15's and 27's prototypes, so a prototype's views become the real ones.
- **Apps:** `popup/` (the switch list eager; rows, This video, pickers and the account view lazy), `settings/` (Diagnostics lazy), `onboarding/` (first run and the 1.4.5 note, ticket 09). They share `ui/components/` (shadcn-svelte, with `tailwind-variants/lite` and `clsx`, ticket 24), one playlist picker on `PickerModel` and one key recorder on `shared/keys`.
- **Reads** go straight to `storage.local`; **writes** go through the background (ticket 16).

#### 3.6 Live-check build and tools

- **Live-check build** (`wxt build --mode livecheck`): adds `src/livecheck/` (the page ticket 25's probe grows into) and wraps the live page adapter in the recording adapter. The `entrypoints:resolved` hook drops livecheck entrypoints in every other mode; the recording adapter sits behind `platform.mode === "livecheck"` so it's removed as dead code; `scripts/check-zip.ts` fails a store zip containing either.
- **`tools/`** (never shipped): `watch/static.ts` (ticket 18's static watch: needles, plus the product's gateway over the node adapter), `watch/browser.ts` (the browser watch), `fixtures/import.ts` (redaction and shape-outline diff), `watch/needles.ts`.

### 4. How features plug in

**The registry** (`src/shared/features/registry.ts`) is a typed data constant:

```ts
type FeatureDef = {
  id: FeatureId                         // "auto-add" | "shortcuts" | "quick-save" | "queue-button" | "watch-button" | "card-menu" | "music-actions" | "music-keys" | "sync"
  setting: SettingsPath                 // where its switch and options live in Settings (ticket 16 §2.4)
  gate?: "musicSection"                 // ticket 09's YouTube Music section switch
  footprint: "none" | "adds-buttons" | "changes-right-click"   // ticket 09's tag
  pages: Partial<Record<Site, {
    file: string                        // the unlisted script, e.g. "feature-quick-save"
    needs: Library[]                    // "kit" (the core is implied)
    lazy?: "popovers"
    when?: (s: Settings) => boolean     // e.g. shortcuts on music only with "Also on YouTube Music"
  }>>
  health: Partial<Record<Site, { required: JobId[]; optional: JobId[]; anchors: AnchorId[] }>>  // ticket 18
}
```

**Consumers, so nothing can disagree:**
- the **Registrar**: which files to register, per site, in registry order;
- **`scripts/check-budget.ts`**: which files make each piece, each feature alone, each site with everything on (`perf-budget.json` holds only the numbers, keyed by registry IDs);
- the **Monitor**: each feature's health declarations;
- **settings, popup and onboarding**: the feature list, sites and footprint tags;
- the **real-browser tests**: "each feature alone" and "everything on";
- a **guard test**: every registry file has `src/entrypoints/<file>.ts`, every page entrypoint is in the registry or is a library, and `perf-budget.json` has exactly the registry's pieces.

**The plug-in contract:**
- A feature's entrypoint is one line: `export default defineUnlistedScript(() => definePageFeature(quickSave))`.
- `start(ctx)` runs when the tab view says the feature is on; everything it adds goes through `ctx.scope`.
- Options changes arrive through `ctx.view`; the feature reacts without a restart.
- Switching off disposes the scope: elements, styles, listeners, observers and timers go. Parsed code stays until reload, as tickets 10 and 24 accept.
- A feature may only reach YouTube through `ctx.run` and `ctx.watch`, and storage only through `ctx.add`, `ctx.change`, `ctx.progress` and its view.

**Adding a feature** touches: a settings entry (ticket 16's `{ on, feedback?, …options }`), a registry entry, `src/site/features/<id>/`, a one-line entrypoint, a `perf-budget.json` row, watch-list entries for any new internal, fixtures for any new job, and its settings row in `ui/`. The guard tests fail until all of them agree.

### 5. Per-site page bundles

#### 5.1 Files

| File | World | Contents | Loads while | Budget, KB gzip (ticket 24, rebalanced) |
|---|---|---|---|---|
| `page-www.js` | MAIN | Gateway, www route table, parsers, live page adapter, page channel | any www feature is on, or the popup's on-demand probe | 5 |
| `core-www.js` | isolated | SiteCore: links, view, host, scope, items, pointer, keys | same | 8 (was "bridge 5") |
| `kit-www.js` | isolated | Svelte runtime (linked exports), shadow host, toaster, overlay, components, YouTube skin, icons | any www feature but the card menu is on | 18 (PROVISIONAL, see below) |
| `feature-auto-add.js` | isolated | tracker, player feed, status | on | 4 |
| `feature-shortcuts-www.js` | isolated | bindings and actions | on | 1 (was 4: the listener moved to the core) |
| `feature-quick-save.js` | isolated | split button | on | 3 |
| `feature-queue-button.js` | isolated | queue button | on | 3 |
| `feature-watch-button.js` | isolated | the pill | on | 5 |
| `feature-card-menu.js` | isolated | contextmenu handler | on | 2 |
| `page-music.js` | MAIN | Gateway, music route table, queue-state code, parsers, live adapter | any music feature or "Also on YouTube Music" is on | 7 |
| `core-music.js` | isolated | as core-www, with music items | same | 8 |
| `kit-music.js` | isolated | as kit-www, with the YouTube Music skin | same | 18 |
| `feature-music-actions.js` | isolated | overlay, availability, actions | on | 6 |
| `feature-music-keys.js` | isolated | bindings | on | 1 (was 3) |
| `feature-shortcuts-music.js` | isolated | bindings and actions | on, with "Also on YouTube Music" | 1 (was 4) |
| `popovers.js` | isolated, lazy | picker and watch-page menu, own Svelte, Bits UI | first open or hover intent | 50 (ticket 24's picker budget; the menu's share is to measure) |

- **Totals with everything on:** YouTube 5 + 8 + 18 + 4 + 1 + 3 + 3 + 5 + 2 = **49**, unchanged. YouTube Music 7 + 8 + 18 + 6 + 1 + 1 = **41** (budget 43).
- **The kit's 18 KB is the tight one.** Spike A's kit with 58 linked Svelte names was 19.8 KB before the toaster and skin. Generating the export list from real use should bring it close to the single-bundle size, but ticket 24 should expect to move up to about 4 KB of headroom into the kit after the first real build. The site totals stay.

#### 5.2 Registrations

| ID | World | `js` | `runAt` | Registered while |
|---|---|---|---|---|
| `pp-www-page` | MAIN | `page-www.js` | `document_start` | consent given, schema ok, www access, and at least one www feature on |
| `pp-www` | ISOLATED | `core-www.js`, then `kit-www.js` if any on feature needs it, then each on feature's file in registry order | `document_idle` | same |
| `pp-music-page` | MAIN | `page-music.js` | `document_start` | consent, schema, music access, and quick actions, quick-action shortcuts (both behind the YouTube Music section switch) or playlist shortcuts with "Also on YouTube Music" on |
| `pp-music` | ISOLATED | `core-music.js`, `kit-music.js`, on features | `document_idle` | same |

- **Matches:** `https://www.youtube.com/*` and `https://music.youtube.com/*`, top frame only, `persistAcrossSessions: true` (ticket 10 §8).
- **Why the page half starts earlier:** it must see the first navigation and player events. It's small and adds only listeners. The isolated half waits for `document_idle` so ticket 24's load-time budget isn't spent during YouTube's own start-up, and it asks the gateway for a snapshot on `hello`, which it needs anyway for tabs injected late.

#### 5.3 Linking

`build/page-link.ts`, used by `wxt.config.ts`:
- **For the eager feature scripts:** through `vite:build:extendConfig`, `rollupOptions.external` matches `svelte`, `svelte/*` and `$kit`; `output.globals` maps them to `__pp.svelte.<key>` and `__pp.kit.lib`. An unknown Svelte specifier fails the build. A transform hook records every name imported from `svelte/internal/client` and `svelte`.
- **For the kits:** `entrypoints:grouped` moves both kit groups to the end, and the kit imports a virtual module generated from the recorded names (production) or the full namespaces (development).
- **For everything else** (the gateway, the cores, `popovers.js`, the popup, settings): nothing changes.
- **Compile options:** `@wxt-dev/module-svelte` with vite-plugin-svelte's `dynamicCompileOptions`, so page code under `src/site/**` compiles with `css: "injected"` (styles land in the shadow root, spike A and B) and our own files get `runes: true`. Forcing runes on `node_modules` breaks Bits UI (spike B). The popup and settings keep emitted CSS files.
- **Checks** (in `scripts/check-budget.ts`, extending ticket 24's list): no Svelte runtime in any page file except the kits and `popovers.js`; no Bits UI outside `popovers.js`; no kit module bundled into a feature file; no `.css` file emitted for page code.

#### 5.4 Shared global

`globalThis.__pp` in the isolated world holds `core`, `kit`, `svelte` and `popovers`. All our isolated scripts in one frame share it: each browser keeps one isolated world per extension per frame, for registered and `executeScript` scripts alike (Chromium's `isolated_world_manager.cc`, Firefox's `ExtensionContent.sys.mjs`, and observed in both). The page world never sees it.

#### 5.5 Switching, injecting and updates

- **Switch on:** the store change reaches the registrar, which updates `pp-<site>` and then injects the missing files into each open matching tab with `executeScript`: the page half (`world: "MAIN"`), then core, kit and the feature, in that order (spike A: the same result as registration). The tab's new view arrives and the host starts the feature.
- **Switch off:** the registrar updates the list; the background pushes the new view; the host disposes the feature's scope. If no feature is left on a site, both registrations go and the core disposes everything it added.
- **On-demand probe** (ticket 10): `Registrar.ensure(tabId, { core: true })` injects only the page half and the core. The core draws nothing.
- **Popovers:** `ctx.popovers()` → `tab.need` → `Registrar.ensure(tabId, { popovers: true })`.
- **After an extension update:** both browsers clear dynamic registrations on every update (Chromium's `user_script_manager.cc`, Firefox's `ExtensionScriptingStore`), so the start-up reconcile registers them again, and the registrar injects into open tabs. A new core announces itself with `ppt:retire` on `document`, which every older core and gateway in the tab hears whatever world it's in; they dispose themselves. An orphaned core also disposes itself the first time `browser.runtime.id` is gone.

### 6. Messaging contracts

All three channels are typed in `src/shared/contracts/` and carried by `shared/rpc`. Every message carries `v` (the contract version) and, where it crosses worlds or an update, `build`.

#### 6.1 Page channel (isolated core ↔ gateway, in one tab)

- **Transport:** `CustomEvent("ppt:req")` from the core and `CustomEvent("ppt:res")` from the gateway, `bubbles` and `composed`, with a JSON **string** as `detail` (ticket 10: no `cloneInto`). A job about an item is dispatched on that item's element; everything else on `document`.

| Request | Answer |
|---|---|
| `hello { build }` | `{ site, build, snapshot: { signedIn, datasyncId \| null, pageType, video? } }` |
| `run { id, job }` | `{ id, result: JobResult }` |
| `watch { id, stream }` / `unwatch { id }` | `stream { id, data }` events until unwatched |
| `probe { id }` | `{ id, report: ProbeReport }` |
| — | unsolicited `signal { BreakageSignal }` |
| `retire { build }` (on `document`) | older cores and gateways stop |

- **Trust:** the core treats every answer as page data. It's parsed, never trusted, and nothing secret is ever sent into the page.

#### 6.2 Tab ↔ background

| Message (tab → background) | Answer | Notes |
|---|---|---|
| `tab.hello { site, build, acct, signedIn }` | `TabView` | registers the tab; `incognito` comes from `sender.tab` |
| `tab.add { AddRequest }` | `AddReport` | `acct` must match the tab registry's |
| `tab.undo { handle }` | `UndoReport` | |
| `tab.change { Change }` | `ChangeResult` | Pause, "Don't auto-add this video", channel filter edits from the watch-page menu |
| `tab.progress.load { video }` / `tab.progress.save { video, len, parts }` | `Parts \| null` / — | refused for private tabs, which keep progress in memory |
| `tab.signals { signals[], successes[] }` | — | batched |
| `tab.need { popovers: true }` | `ok` | |
| `tab.noticeShown { features }` | — | |

| Message (background → tab, frame 0) | Answer | Notes |
|---|---|---|
| `bg.view { TabView }` | — | pushed after any change that alters that tab's view |
| `bg.job { job }` | `JobResult` | add-flow steps and serving-tab jobs |
| `bg.ping` | `{ site, build, acct, signedIn }` | 2 s budget (ticket 10 §5) |
| `bg.query { name }` | whatever the feature exposes | the popup's This video, Playing now |

**TabView** holds: the features on for this site and their options (shared settings), the undo key and other keys, the tab's own account key, setup, filters and session skips (ticket 11: nothing of other accounts), `signedIn`, `private`, `paused`, this tab's feature statuses and due notices, and the `build`.

#### 6.3 UI ↔ background

`ui.change { Change, windowId }`, `ui.accountInView { windowId }`, `ui.playlists { acct, refresh }`, `ui.add { AddRequest, windowId }`, `ui.create { acct, title, privacy, windowId }`, `ui.resolveChannel { input, windowId }`, `ui.thisTab { windowId }` (This video or Playing now, through `bg.query`), `ui.syncJoin { choice }`, `ui.clearAll { alsoSynced }`, `ui.checkNow`, `ui.diagnostics`. The popup sends its window ID because it has no `sender.tab`; settings and onboarding are identified by `sender.tab` (ticket 16 §8).

#### 6.4 Rules for every channel

- **Validation at the receiver:** the background accepts only `sender.id === runtime.id`; tab messages only from frame 0 of a tab; UI messages only from extension pages. Each payload passes its contract guard.
- **Timeouts:** pings 2 s, jobs 10 s (tickets 10, 12, 26). A write that times out is reported, never retried (ticket 10 §7).
- **Versioning:** both ends of every channel ship in one build. `build` mismatches only happen across an update, and the retire rule handles them.
- **Logging:** only the isolated world and the background log (ticket 18), with the extension's name as prefix.

### 7. Thin WXT entrypoints

- **`imports: false`.** Code imports real paths: `wxt/browser` and `wxt/utils/define-*` (verified in WXT 0.21.4's package exports).
- **Every entrypoint is a few lines:** it builds the browser adapters and hands them to a plain module.

```ts
// src/entrypoints/background.ts
import { defineBackground } from "wxt/utils/define-background"
import { browser } from "wxt/browser"
import { boot } from "@/background/boot"
import { browserAdapters } from "@/background/adapters/browser"
import { platform } from "@/shared/platform"
export default defineBackground(() => boot(browserAdapters(browser, platform)))

// src/entrypoints/page-www.ts            (MAIN world, registered at runtime)
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { startPage } from "@/page/start"
export default defineUnlistedScript(() => startPage("www", window))

// src/entrypoints/feature-quick-save.ts
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { definePageFeature } from "@/site/feature"
import { quickSave } from "@/site/features/quick-save/feature"
export default defineUnlistedScript(() => definePageFeature(quickSave))
```

- **The entrypoint list:** `background.ts`; `popup/`, `options/`, `onboarding/` (HTML); `page-www.ts`, `page-music.ts`; `core-www.ts`, `core-music.ts`; `kit-www.ts`, `kit-music.ts`; one per feature file in [section 5.1](#51-files); `popovers.ts`; `livecheck/` (livecheck mode only).
- **`wxt.config.ts`** stays declarative and delegates to `build/`:

```ts
export default defineConfig({
  srcDir: "src",
  imports: false,
  manifestVersion: 3,
  modules: ["@wxt-dev/module-svelte", "@wxt-dev/auto-icons"],
  svelte: { vite: { dynamicCompileOptions: pageCompileOptions } },  // build/page-link.ts
  vite: () => ({ plugins: [tailwindcss()], define: buildDefines() }),
  manifest: ({ browser }) => manifestFor(browser),                    // build/manifest.ts: ticket 10 §11, no content_scripts, no web_accessible_resources
  hooks: {
    "entrypoints:resolved": dropLivecheckUnlessLivecheck,             // build/livecheck.ts
    "entrypoints:grouped": buildKitsLast,                             // build/page-link.ts
    "vite:build:extendConfig": linkPageScripts,                       // build/page-link.ts
  },
})
```

- **Guard tests keep them thin:** `wxt/utils/define-*` only in `src/entrypoints/**`; `wxt/browser` only in `src/entrypoints/**` and `*/adapters/browser*.ts`; no entrypoint over 15 lines.

### 8. Folder layout

```
bunfig.toml  perf-budget.json  wxt.config.ts  package.json  tsconfig.json
build/                    page-link.ts · manifest.ts · livecheck.ts       (imported by wxt.config.ts and scripts)
src/
  entrypoints/            WXT only: background.ts · popup/ · options/ · onboarding/ · page-*.ts · core-*.ts · kit-*.ts · feature-*.ts · popovers.ts · livecheck/
  shared/                 platform · contracts/ · rpc · model/ · features/registry · rules/ · copy/ · keys/ · picker/ · watchlist
  page/                   MAIN world: start · channel · gateway/ (gateway, lanes, guard, sign, effects) · routes/{www,music} · parsers/ · port · adapters/{live-www,live-music,recorded,recording}
  site/                   isolated world:
    core/                 core · ext-link · page-link · view · host · scope · items-www · items-music · pointer · keys · adapters/runtime
    kit/                  kit · index ($kit) · toaster/ · overlay/ · components/*.svelte · skins/{www,music} · icons/
    features/<id>/        feature.ts · *.svelte · pure helpers (auto-add/tracker.ts)
    popovers/             popovers · Picker.svelte · WatchMenu.svelte
    feature.ts            definePageFeature
  background/             boot · router · store/ · registrar/ · tabs/ · adds/ · monitor/ · playlists/ · accounts/ · diagnostics/ · adapters/browser*.ts
  ui/                     backend/{backend,browser,fake} · components/ (ui/ = shadcn-svelte) · popup/ · settings/ · onboarding/ · lib/
  livecheck/              live-check page (livecheck mode only)
tests/
  setup/                  svelte.ts · happydom.ts · fake-browser.ts · testing-library.ts
  fakes/                  sync-area · sync-server · tabs · scripting · access · transport · core
  guards/                 storage-writes · imports · env · page-console · registry · entrypoints · fixtures-privacy · watchlist
  integration/            end-to-end flows across contexts in one process
  browser/                real-browser layer (not run by `bun test`): chromium/ · firefox/ · pages/
fixtures/
  youtube/<job>/<variant>.json      recorded, redacted answers (ticket 18 §2)
  markup/                           card, row, header and like-button snippets
tools/                    watch/ · fixtures/       (never shipped)
scripts/                  check-budget.ts · check-manifest.ts · check-zip.ts · coverage.ts
```

- **Unit tests sit beside their module** (`*.test.ts`). `tests/` holds only setup, fakes, guards, cross-context integration and the browser layer.
- **Import rules** (checked by `tests/guards/imports.test.ts`):

| From | May import |
|---|---|
| `shared/` | `shared/` only (and `svelte` in `picker/`) |
| `page/` | `shared/`, `page/` |
| `site/` | `shared/`, `site/`; `wxt/browser` only in `site/core/adapters/` |
| `background/` | `shared/`, `background/`; `wxt/browser` only in `background/adapters/` |
| `ui/` | `shared/`, `ui/`; `wxt/browser` only in `ui/backend/browser.ts` |
| `entrypoints/` | anything |

- `import.meta.env` only in `shared/platform.ts`; no `console` in `page/`; `storage.*.set`, `remove` and `clear` only in `background/store/` and its adapter (ticket 16's guard).
- **1.x code:** nothing is moved over wholesale. The channel-filter rule, typed-channel parsing and today's queue command are re-homed into `shared/rules`, `background/playlists` and the www route table, with their tests rewritten in `bun:test` against the new interfaces.

### 9. Test layers

| # | Layer | Tools | What it covers | Where | Runs |
|---|---|---|---|---|---|
| 1 | **Unit** | `bun test` | Pure modules: rules, copy, key matcher and recorder, watch tracker, codecs, migrations, private table, budget counter, chunker, conflict rule, registry derivations (`desired`, `deriveStatus`, `badgeFor`), parsers' shape handling | `src/**/*.test.ts` | every push |
| 2 | **Recorded responses** | `bun test`, the recorded `PagePort`, `fixtures/youtube` | The gateway through its interface: route order and fallbacks, writes never twice, the account guard, every known shape, ticket 12's failure mapping, success by effect, which signals are raised; the privacy lint on fixtures | `src/page/**/*.test.ts`, `tests/guards` | every push |
| 3 | **Fake browser and DOM** | `bun test`, WXT's fake browser, `tests/fakes`, happy-dom, Testing Library for Svelte | Background modules through their interfaces over the fakes (store with quota-true sync and two-browser server, registrar, tabs, add flow, monitor); site core, kit and features in happy-dom over a direct page channel to a real gateway; popup and settings components over the fake Backend; cross-context flows wired by the memory transport (for example: a reading crosses the goal → add flow → membership and add in the tab → toast with Undo → undo) | `src/**`, `tests/integration` | every push |
| 4 | **Real browser** | `bun test` with `bunfig.browser.toml`, driving Playwright (bundled Chromium, `channel: "chromium"`, persistent context) and Puppeteer 24.x over WebDriver BiDi (`installExtension`, Firefox release), on the built extension; youtube.com requests are answered from `tests/browser/pages` by `context.route` and `setRequestInterception` | Off means zero (no execution context, node, style, listener or request); each feature alone loads only its files; registration, order and linking; switch on and off in an open tab; teardown (`DOMDebugger.getEventListeners` on Chromium); styles, positions and fullscreen; the popovers' first open; ticket 24's timings at 1.5× in CI | `tests/browser` | every PR, after `build` |
| 5 | **Watch** | Bun scripts; layer 4's tools against live sites, signed out | Ticket 18's static watch and browser watch | `tools/watch` | daily, on demand, release gate |
| 6 | **Signed-in live check** | the live-check build in the developer's own browsers | Ticket 18 §4: every route, quietness, captures | `src/livecheck` | before each release |

- **Fakes we own** (each the second adapter of a real seam): `sync-area` and `sync-server` (ticket 16 §12), `tabs`, `scripting`, `access`, `transport` (memory), and a scripted `core` for feature tests.
- **What WXT's fake browser covers** (checked in spike B): `storage` local, session and sync (no quotas), `runtime`, `tabs` (exact-URL query only, no `lastAccessed`), `windows`, `action` with per-tab badge text, `alarms`, `notifications`. Not `scripting` or `permissions`, which throw. That answers tickets 10's and 18's checks.
- **Coverage policy** (ticket 04 asked for one):
  - Bun reports lines and functions only, never branches. Decision logic is therefore written as data tables (routes, the private table, outcome mapping, status derivation, badge priority) and tested row by row, which turns branches into covered lines.
  - `scripts/coverage.ts` reads `coverage/lcov.info` and fails, naming each file, when a `src/**/*.ts` module is under 80 % of lines or functions, or when no test loaded it at all (Bun only reports loaded files).
  - Excluded: `src/entrypoints/**`, `*/adapters/browser*.ts` and `live-*.ts` (layer 4 covers them), and `*.svelte`, whose line numbers are the compiled output's (spike B). Components stay thin and their logic lives in `.ts`.
  - Bun's own `coverageThreshold` isn't used: it fails per file with no message (spike B).

### 10. Build and tooling

- **Bun:** `"packageManager": "bun@1.4.3"`; CI reads it (ticket 04).
- **`tsconfig.json`:** keeps `@/*` → `src/*` and adds `$kit` → `src/site/kit/index.ts`, so editors, `svelte-check` and `bun test` resolve the kit as source while production builds link it.
- **`bunfig.toml`** (verified in spike B, plus the ignore list):

```toml
[define]
"import.meta.env.BROWSER" = "'chrome'"
"import.meta.env.CHROME" = "true"
"import.meta.env.FIREFOX" = "false"
"import.meta.env.MANIFEST_VERSION" = "3"
"import.meta.env.MODE" = "'test'"
"import.meta.env.PP_BUILD" = "'test'"

[test]
preload = ["./tests/setup/svelte.ts", "./tests/setup/happydom.ts", "./tests/setup/fake-browser.ts", "./tests/setup/testing-library.ts"]
pathIgnorePatterns = ["tests/browser/**", "tools/**", ".output/**"]
coverageReporter = ["text", "lcov"]
coveragePathIgnorePatterns = ["tests/**", "src/entrypoints/**", "**/adapters/browser*.ts", "**/adapters/live-*.ts", "**/*.svelte", "node_modules/**"]
```

- **Preloads, in order:**
  1. `svelte.ts`: the Svelte plugin (below);
  2. `happydom.ts`: `GlobalRegistrator.register({ url: "https://www.youtube.com/watch?v=…" })`;
  3. `fake-browser.ts`: WXT's `fakeBrowser` on `browser` and `chrome`, reset before each test;
  4. `testing-library.ts`: jest-dom matchers and `@testing-library/svelte`'s `cleanup` after each test.
- **The Svelte plugin** (`tests/setup/svelte.ts`, 24 lines, passing in spike B):

```ts
// Compiles .svelte components and .svelte.ts/.js rune modules for bun test.
import { plugin } from "bun"
import { compile, compileModule } from "svelte/compiler"

const ts = new Bun.Transpiler({ loader: "ts" })

plugin({
  name: "svelte",
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
      contents: compile(await Bun.file(path).text(), {
        filename: path, generate: "client", css: "injected", runes: path.includes("/node_modules/") ? undefined : true,
      }).js.code,
      loader: "js",
    }))
    build.onLoad({ filter: /\.svelte\.[jt]s$/ }, async ({ path }) => {
      const src = await Bun.file(path).text()
      return {
        contents: compileModule(path.endsWith(".ts") ? ts.transformSync(src) : src, { filename: path, generate: "client" }).js.code,
        loader: "js",
      }
    })
  },
})
```

- **`--conditions=browser` can't live in `bunfig.toml`** (spike B: every key placement is ignored), so it's in the script. Without it Svelte resolves its server build and `mount()` throws.
- **Scripts:**

| Script | Command |
|---|---|
| `test` | `bun test --isolate --conditions=browser` |
| `test:coverage` | `bun test --isolate --conditions=browser --coverage && bun scripts/coverage.ts` |
| `test:browser` | `bun test --config=bunfig.browser.toml` over `.output/chrome-mv3` and `.output/firefox-mv3` (its own bunfig: no happy-dom or fake-browser preloads, `root = "tests/browser"`, long timeouts) |
| `typecheck` | `svelte-check --tsgo` (TypeScript 7's native checker, covering `.ts` and `.svelte`) |
| `build`, `build:firefox` | `wxt build`, `wxt build -b firefox` |
| `build:livecheck` | `wxt build --mode livecheck` (and `-b firefox`) |
| `check:budget`, `check:manifest`, `check:zip` | `bun scripts/<name>.ts` |
| `watch:static` | `bun tools/watch/static.ts` |

- **TypeScript:** svelte-check 4.7 declares `typescript` `^5 || ^6` and runs TypeScript 7 only through `--tsgo` with both installed. So the dev dependencies are `typescript@~6` (for svelte-check and other tools on the JavaScript API) plus `@typescript/native@npm:typescript@7`, replacing today's lone `typescript@^7`.
- **Dependencies:** drop `vitest`, `@vitest/coverage-v8`, `@vitejs/plugin-react`, React, Base UI, sonner, `idb` and `fake-indexeddb` (nothing uses IndexedDB but the one-time deletion). Add `svelte`, `@wxt-dev/module-svelte`, `bits-ui`, `@webext-core/isolated-element`, `@happy-dom/global-registrator`, `@testing-library/svelte`, `svelte-check`, `playwright`, `puppeteer`.
- **CI (`ci.yml`):**

| Job | Steps |
|---|---|
| `check` | setup-bun from `packageManager` → `bun install --frozen-lockfile` → `typecheck` → `test:coverage` (guards included) |
| `build` | both builds → `check:manifest` (ticket 10 §11 per browser: permissions, hosts, floors, gecko ID, `data_collection_permissions`, no `content_scripts`, no `web_accessible_resources`) → `check:budget` (table to the job summary) → upload both `.output` folders |
| `browser` | needs `build` → `playwright install --with-deps chromium` and Puppeteer's Firefox → `test:browser`, timings at 1.5× ticket 24's budgets |

  The `broker` job goes when ticket 19 retires `server/`.
- **`watch.yml`** (daily schedule plus manual): `static` and `browser-watch` jobs, then a `report` job with `issues: write` that opens, updates or closes the one `youtube-change` issue (ticket 18 §4).
- **`release.yml`** gains, for ticket 19: the watch gate, `check:budget`, `check:zip` (no live-check code), and in the hotfix lane `check:manifest --against <last tag>` (identical apart from `version`).

### 11. Where earlier tickets conflicted

| Question | Earlier proposals | Decided here |
|---|---|---|
| Script IDs and granularity | Ticket 10: `core-www`, `core-music`, `feature-<name>`. Ticket 24: also `ui-www` / `ui-music` waiting on a promise. | Two registrations per site, the isolated one an ordered list (D3). Ticket 10's per-feature registration *behaviour* is kept: a feature's file is in the list only while it's on. |
| Kit sharing | Ticket 24: a global, features "wait on a promise". | A global, guaranteed by order; Svelte linked at build time; the kit's exports generated (D4). |
| WXT content-script wrapper | Ticket 10: `registration: "runtime"` content scripts. Ticket 24: keep the wrapper out. | Unlisted scripts (D2). |
| Picker weight | Ticket 24: 38 KB linked or 50 KB self-contained. | Self-contained `popovers.js`, which also holds the watch-page menu (D5). |
| Key listener and pointer tracking | Ticket 24's table: in playlist shortcuts (4 KB). Ticket 08: "one shortcut engine for both sites". | In the site core (D6); the feature budgets shrink by the same amount. |
| Who digests `DATASYNC_ID` | Ticket 16: the background. | The tab's isolated core (D10). |
| Gateway serialisation | Ticket 10: one job queue per tab for YouTube Music queue actions. Ticket 29: serialise YouTube's queue edits. Ticket 10 §7: one request at a time per tab. | Two lanes per tab: app state and playlists ([3.2](#32-page-world-srcpage)). |
| Page reads | Ticket 18's port: `read(what)`. Ticket 07: a thin player adapter feeding a pure core. | Reads are gateway jobs with routes; continuous readings are gateway streams. The player adapter is a thin feed in the isolated feature, never page code (D1). |
| Teardown | Ticket 10: every feature has one. | The core's scope owns teardown, so a feature can't forget a listener. |
| Per-browser test runs | Ticket 04: open. | One run, injected platform (D9). |

### 12. Judgement calls at a glance

| Decision | Chosen | Runner-up, and why it lost |
|---|---|---|
| Page-world code | The gateway only | Per-feature page parts: bypass the one page port, more registrations, settings in the page |
| Page-script packaging | WXT unlisted scripts | WXT content scripts: 3 KB wrapper and a page-visible `postMessage` |
| Registrations | Two per site, ordered list | One per piece: no ordering guarantee between registrations |
| Sharing Svelte | Link to the kit's runtime, generated exports | Kit owns all components: off features' UI would load |
| Popovers | Own Svelte copy, lazy | Linked to the kit: grows the eager kit for every page |
| Shared in-page machinery | In the site core, inert until asked | Per feature: two listeners coordinating one undo key |
| Cross-tab logic | Background | Add flow in the tab: split decisions, untestable in one place |
| Messaging | One-shot messages, pushed views | Long-lived ports: dropped by idle workers |
| Browser variants in tests | One run, injected platform | Two runs: double time, little extra coverage |
| Account key | Digest made in the tab | Background digest: raw ID crosses the channel |
| Teardown | Scope owned by the core | Per-feature teardown functions: easy to miss one |
| Coverage gate | Own script on lcov, per file, names offenders, catches unloaded files | Bun's `coverageThreshold`: silent per-file failure, blind to unloaded files |
| Coverage of decisions | Decision tables tested row by row | Waiting for branch coverage, which Bun doesn't have |
| UI seam | One `Backend` port with a fake adapter that the prototypes use too | Direct `browser.*` in components: untestable, and prototypes thrown away |

### 13. Evidence

All three are throwaway and outside the repo.

- **Spike A, linking and registration** (WXT 0.21.4, Vite 8.3.4 with Rolldown, Svelte 5.57.2, Chromium 1248 headless):
  - Linking with `external` plus `output.globals` works through `vite:build:extendConfig`; Rolldown accepts a function and dotted names. A feature with a component: 875 B gzip, no runtime inside.
  - The kit with the full `svelte/internal/client` namespace: 32.6 KB gzip; with 58 named exports: 19.8 KB.
  - One isolated registration ran `core`, `kit`, `feature` in list order on `https://www.youtube.com/` served through Playwright's `context.route`. The component mounted in an open shadow root with its `<style>` there and reactivity working. `updateContentScripts` without the feature, then a reload: the feature didn't run.
  - A `CustomEvent` dispatched by the isolated world on a card reached the MAIN world's capture listener with `event.target` as that card (round trip under 0.1 ms).
  - `executeScript` into an open tab, page half first, gave the same result.
  - WXT's unlisted-script wrapper: 253 B gzip, no `postMessage`, nothing visible to the page.
- **Spike B, `bun test`** (Bun 1.4.3, checksum-verified; svelte 5.57.2, bits-ui 2.19.5, wxt 0.21.4, happy-dom 21.0.3, @testing-library/svelte 5.4.2):
  - The bunfig and plugin above: 8 of 8 tests pass under `--isolate`: a runes component with `lang="ts"` in a shadow root (style inside the root); a Bits UI Popover portalled into the root and closed with Escape; fake-browser storage (local, session, sync) and per-tab badge text; `jest.useFakeTimers()` with `flushSync`; a `.svelte.ts` `$state` class.
  - `--conditions` only works on the command line. Without Testing Library's cleanup in a preload, files leak into each other, as with React; Svelte's injected styles in `document.head` also leak without `--isolate`.
  - The suite took about 2 s isolated. Bits UI's `.svelte` files are recompiled per isolated file (about 1.7 s for that file alone), so Bits UI tests should stay few and grouped.
- **Check C, browsers and tools from source, plus a run in Chromium 1248 and Firefox 158** (Puppeteer 24.43.1 over BiDi, Bun 1.4.3):
  - Files in one registration's `js` run in array order (Chrome and MDN docs); order across registrations is unspecified anywhere. `updateContentScripts` is all-or-nothing and applies from the next load.
  - `world: "MAIN"` needs Chrome 102 and Firefox 128; `persistAcrossSessions` works from Firefox 105. Both browsers clear dynamic registrations on every update.
  - One isolated world per extension per frame in both browsers: a file injected later by `executeScript` saw the registered file's `globalThis.__pp`.
  - A `CustomEvent` with a string `detail` crosses worlds in both directions without `cloneInto`, and `event.target` gives the page-world element (Firefox included).
  - Playwright's `context.route` and Puppeteer's `setRequestInterception` both serve fixture HTML at `https://www.youtube.com/…` with our registered scripts injecting; both drivers run under Bun 1.4.3, inside `bun test --isolate` too.
  - WXT 0.21.4: `wxt zip` includes unlisted scripts; `--mode livecheck` sets `import.meta.env.MODE` and writes to `chrome-mv3-livecheck`, so live-check output can't be mistaken for a store build.

### 14. PROVISIONAL

- **The kit's 18 KB** ([section 5.1](#51-files)), until the first real build; ticket 24 adjusts `perf-budget.json`.
- **`popovers.js` at 50 KB with the watch-page menu inside**, until measured.
- **`runAt` values** (`document_start` for the page half, `document_idle` for the isolated list), until layer 4 measures load cost and missed events.
- **Re-injecting into open tabs after an extension update**, and the `ppt:retire` handover, until layer 4 runs an update in both browsers.
- **`svelte-check --tsgo`'s exact flags** with TypeScript 7, until the scaffold runs it.

### 15. For other tickets

- **[14](14-in-page-controls.md) and [27](27-youtube-music-controls.md) (in-page controls):** build controls from the kit's components (`$kit`: IconButton with its five states, SplitButton, StatusPill, Toast) and the one overlay; a feature's own `.svelte` files link to the kit's Svelte. The picker and the watch-page menu are `popovers.js`. Card and row selectors, the self-check and anchor thresholds live in `site/core/items-www.ts` and `items-music.ts`. Everything a control adds goes through `ctx.scope`. Make the rough dev build with the real registrar, not a static content script, so its measurements match production. YouTube Music availability comes from the targeted `itemInfo` job; preload popovers on hover with `ctx.popovers()`.
- **[15](15-popup-and-settings.md) (popup and settings):** build the prototypes on `ui/backend/fake.ts`, so their views carry into the product. First view = one `Backend.load()`. One `PickerModel` and one recorder (`shared/keys`) serve the popup, settings and onboarding. First run and the 1.4.5 note are a separate `onboarding` page.
- **[19](19-upgrade-and-rollout.md) (rollout):** `packageManager: "bun@1.4.3"`; the CI jobs in [section 10](#10-build-and-tooling); drop the `broker` job with `server/`; `release.yml` adds the watch gate, `check:budget`, `check:zip` and the hotfix lane's `check:manifest --against <tag>`. Keep `wxt.config.ts` and `build/` on Node APIs only, so AMO's Node and npm reviewers can rebuild; Bun is needed only for tests and scripts. Both browsers clear registrations on update, so the upgrade test should check that features keep working in already-open tabs.
- **[20](20-write-spec.md) (spec):** sections 1–8 are the spec's architecture, 9 its testing, 10 its build. A suggested build order for `/to-tickets`: scaffold and tooling with the guards → shared kernel and contracts → gateway with recorded fixtures (www) → store and migrations → registrar, tabs, site core and kit → features one at a time → popup, settings and onboarding → YouTube Music → real-browser layer and watch → live-check build.
- **[24](24-performance-budget.md) (budget):** take the rebalanced rows in [section 5.1](#51-files), expect the kit to need headroom, count the watch-page menu inside `popovers.js`, and extend `check-budget.ts` with section 5.3's rules.
- **[25](25-live-checks.md) (live checks):** P2's second half is answered from source: both browsers clear registrations on update, and the start-up reconcile restores them. The probe extension becomes `src/livecheck/` (ticket 18). The resolver found by shape lives in the live adapter's `command()`.
- **[16](16-storage-and-sync.md), [10](10-youtube-access.md), [08](08-shortcuts.md):** the refinements in [section 11](#11-where-earlier-tickets-conflicted) (digest in the tab, registration IDs, the key listener in the core). Nothing in their behaviour changes.

Also from [ticket 19](19-upgrade-and-rollout.md):
- a `beta` build mode;
- extra `check:manifest` checks;
- the AMO metadata script, the sources README and `build-for-amo`;
- Node 24 in release jobs;
- `watch.yml` callable from `release.yml`.

Also from [ticket 14](14-in-page-controls.md):
- **Shadow hosts:** "one shadow host per page" becomes one host for toasts and popovers, one moving overlay, and one host per in-row control.
- **The kit's toast layer** exists only while a feature that needs it runs.
- **Card menu notice:** the card menu loads no kit, so its not-working notice needs the kit injected on demand, or a notice that needs no kit.
- **Escape** is handled inside popovers, because key isolation stops Bits UI from seeing it.
- **Svelte `$state` proxies:** identity comparisons silently fail; add a guard or lint.
- **Kit export list:** the generated list of Svelte exports needs property access, because some runtime names are reserved words.
- **The popovers loader** needs a timeout, a visible failure on click, and a silent mode for hover preloads.

Also from [ticket 27](27-youtube-music-controls.md):
- **The kit's Overlay** needs an in-flow mode (it joins the row's own layout) and a corner mode (cards).
- **Hosts** must stop clicks and pointer events from reaching the page, not just keys.
- **`popovers.js`** needs `strategy: "fixed"` and Bits UI's available-height variable.
- **Proven live:** the gateway jobs that worked on real YouTube Music are listed in its Answer.

Also from [ticket 15](15-popup-and-settings.md):
- The prototype's `ui/` mirrors the module map; take its Change kinds and the `PickerSource` interface.
- **Build rules:** per-page builds (or a popup-only build), first-view chunk grouping, no top-level await in entries (it blanked pages), and first-view icons as inline paths.
- **Component rules:** a component's base never sets a property its variants set, because there's no tailwind-merge; callers add only margins and layout. Switches and checkboxes are controlled wherever a change can be refused. Popovers use `preventScroll`. Two stylesheets per page.
