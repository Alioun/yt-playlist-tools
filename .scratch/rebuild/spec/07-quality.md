# 7. Quality: tests, breakage detection, budgets and tooling

This chapter says how 2.0 is built and tested, how it finds out that YouTube or YouTube Music changed something it relies on, how much it may cost a page, and what CI enforces. Related chapters:
- [04-features-accounts-data.md](04-features-accounts-data.md): what the user sees when a feature is **not working** or **partly working** ([§5](04-features-accounts-data.md#5-breakage-status): the notice, badge, popup strip, settings status line and wording), the diagnostics report and **Check now** ([HEALTH-22](04-features-accounts-data.md#55-diagnostics-check-now-and-the-report) to HEALTH-25).
- [02-youtube.md](02-youtube.md) and [03-youtube-music.md](03-youtube-music.md): each site's breakage copy ([YT-BRK-06](02-youtube.md#213-when-youtube-changes-something), [§14](03-youtube-music.md#14-failures-and-breakage)) and its self-checks ([YT-ITEM-07](02-youtube.md#22-cards-the-current-video-and-the-pointed-at-item), [YM-TGT-4](03-youtube-music.md#5-the-playing-song-and-the-pointed-at-item)).
- [05-ui.md](05-ui.md): the UI's own statement of the budgets ([§5.10](05-ui.md#budgets-and-measurements)), its build rules ([§5.12](05-ui.md#512-component-and-build-rules-for-ui-code)) and accessibility ([§5.11](05-ui.md#511-accessibility-as-decided)).
- [06-architecture.md](06-architecture.md): the modules, seams and adapters named here (`Gateway`, `PagePort`, `StorageAreas`, `ScriptingPort`, `TabsPort`, `AccessPort`, `Transport`, `PageChannel`, `Backend`: [§6.4](06-architecture.md#64-the-module-map) and [§6.5](06-architecture.md#65-the-gateway-and-the-page-port)), the feature registry ([§6.6](06-architecture.md#66-the-feature-registry)), the bundles ([§6.7](06-architecture.md#67-per-site-bundles)) and the route tables and live checks ([§6.2](06-architecture.md#62-youtube-access)).
- [08-release.md](08-release.md): `release.yml`, the release gates in full ([§14](08-release.md#14-ci-and-release-workflows)), the release checklist ([§18](08-release.md#18-release-checklist-releasingmd), `RELEASING.md`), the beta, rollbacks ([§8.3](08-release.md#83-rollback-and-fix-forward)) and the upgrade-test harness ([§17](08-release.md#17-upgrade-test-matrix)).

**Conventions.**
- Each requirement has a stable ID (`Q-TOOL-`, `Q-TEST-`, `Q-FIX-`, `Q-WATCH-`, `Q-PERF-`, `Q-CI-`) and is written so a test, a check or a reviewer can say yes or no.
- **KB** means kilobytes of gzip level 9 output of a built file, unless the text says otherwise.
- *(starting value)* marks a number to be tuned once the signed-in live checks have run and after the first weeks of use. Tuning it is a code change, not a spec change.
- **PROVISIONAL** marks a decision that waits on an open input. The input is named inline.
- **Store build** means the production build that goes into a store zip (`wxt build`, `wxt build -b firefox`). **Dev build** means `wxt` in development mode. **Live-check build** means `wxt build --mode livecheck`.
- **Resolutions:** decisions made while the spec was assembled are cited by R-number, from [resolutions.md](resolutions.md). A requirement that a resolution changed keeps its ID and ends with "(R-n)". The user's decisions of 2026-10-20 are R84–R99.
- **The first-run page** is the extension page in `onboarding.html` that holds first run and the upgrade note (R37).

---

## 7.1 Tooling

### 7.1.1 Toolchain

- **Q-TOOL-1.** `package.json` declares `"packageManager": "bun@1.4.3"`. CI installs Bun from that field (`oven-sh/setup-bun@v2`), and no Bun older than 1.4.3 is used anywhere.
  - Why 1.4.3: Bun 1.4.0's transpiler cache ignores `[define]` changes, so a Chrome run followed by a Firefox run tested Chrome's code (fixed in 1.4.1). 1.4.3 also fixes a fake-timer hang (`advanceTimersByTime()` and `runOnlyPendingTimers()` never returned), several `--isolate` bugs, and coverage counting only the last load of a file loaded more than once.
- **Q-TOOL-2.** The stack is WXT, TypeScript and Bun, with Svelte 5 and shadcn-svelte on Bits UI for the UI. Every test is written against `bun:test`. Vitest, `@vitest/coverage-v8` and Vitest-style config are not used.
  - The spikes proved this setup with WXT 0.21.4 (Vite 8.3.4 with Rolldown), Svelte 5.57.2, Bits UI 2.19.5, happy-dom 21.0.3 (`@happy-dom/global-registrator`), `@testing-library/svelte` 5.4.2, Playwright with its bundled Chromium, and Puppeteer 24.43.1 against Firefox 158.
- **Q-TOOL-3.** Tests use only APIs `bun:test` has. Vitest-only APIs don't exist there: `vi.mocked`, `vi.stubGlobal`, `vi.hoisted`, `vi.waitFor`, `vi.advanceTimersByTimeAsync`, and `importOriginal` in mock factories.
  - Globals are stubbed by assignment and restored in `afterEach`.
  - Fake timers: `jest.useFakeTimers()`. Testing Library's `waitFor` advances the fake clock by itself. Svelte state is flushed with `flushSync`.
- **Q-TOOL-4.** `@testing-library/jest-dom`'s matcher types are added through a `matchers.d.ts` that augments `bun:test`'s `Matchers`.

### 7.1.2 WXT stays at the edges

- **Q-TOOL-5.** `wxt.config.ts` sets `imports: false`. Code imports WXT from real paths (`wxt/browser`, `wxt/utils/define-*`, `wxt/utils/storage`) and never from `#imports` or through auto-imports.
  - Why: WXT's only test integration is Vitest's (`WxtVitest`), and WXT closed the Bun request as won't-fix. `#imports` and auto-imports resolve under `bun test` only through untyped WXT internals.
- **Q-TOOL-6.** Only files under `src/entrypoints/**` import `wxt/utils/define-*`. Each entrypoint builds the browser adapters and hands them to a plain module, in at most 15 lines (guarded, Q-TEST-30).
- **Q-TOOL-7.** Tests reach collaborators through injected dependencies (the seams' fake adapters), never through `mock.module` on our own modules. `mock.module` is allowed only for third-party edges.
  - Why: `mock.module` lasts for the whole process, `mock.restore()` doesn't undo it, and it isn't hoisted.

### 7.1.3 The platform module

- **Q-TOOL-8.** `src/shared/platform.ts` is the only file that reads `import.meta.env` (guarded, Q-TEST-30). It reads each value as a literal member expression (`import.meta.env.FIREFOX`), never destructured or indirectly.
  - Why: Bun's `[define]` replaces only literal member expressions. Any other read falls through to `process.env`, where `FIREFOX=false` is the truthy string `"false"`.
- **Q-TOOL-9.** The module exports `platform: Platform`, with `{ browser: "chrome" | "firefox", mode, build }`. Code that behaves differently per browser takes a `Platform` value as a parameter instead of reading the environment.
- **Q-TOOL-10.** One `bun test` run covers both browsers: tests pass each `Platform` value side by side. There is no second bunfig and no second run per browser.
  - Differences that exist only at build time (the manifests) are checked on both builds by `check:manifest` (Q-CI-3).
  - *Runner-up:* separate Chrome and Firefox runs with two bunfigs. It doubles CI time, re-tests what injection already covers, and invites the stale-`define` class of bug.

### 7.1.4 `bunfig.toml`

- **Q-TOOL-11.** The repo root has this `bunfig.toml`:

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

  - A command-line `--define` replaces the whole `[define]` table rather than merging with it, so no script passes `--define`.
- **Q-TOOL-12.** `tsconfig.json` maps `@/*` to `src/*` and `$kit` to `src/site/kit/index.ts`. Bun reads `paths`, so `bun test`, editors and `svelte-check` resolve the kit as source, while store builds link it ([ARC-MOD-12](06-architecture.md#672-linking-svelte)).

### 7.1.5 The preloads

- **Q-TOOL-13.** `bun test` loads exactly four preloads, in this order:

| # | File | What it does | Why the order or the place matters |
|---|---|---|---|
| 1 | `tests/setup/svelte.ts` | Registers the Svelte plugin (Q-TOOL-14) | Must exist before any `.svelte` file is imported |
| 2 | `tests/setup/happydom.ts` | `GlobalRegistrator.register({ url: "https://www.youtube.com/watch?v=…" })`, so `location` looks like YouTube | Must run before anything imports `@testing-library/*` |
| 3 | `tests/setup/fake-browser.ts` | Puts WXT's `fakeBrowser` (`wxt/testing/fake-browser`, which is `@webext-core/fake-browser`) on both `globalThis.browser` and `globalThis.chrome`, and calls `fakeBrowser.reset()` in a preload-level `beforeEach` | `wxt/browser` reads the global once, when it's first evaluated, so the globals must be set before any test imports it. Preload hooks run before every test in every file. |
| 4 | `tests/setup/testing-library.ts` | `expect.extend` with `@testing-library/jest-dom/matchers`, and `afterEach(cleanup)` from `@testing-library/svelte` | Cleanup registered anywhere else leaks components between files |

### 7.1.6 The Svelte test plugin

- **Q-TOOL-14.** `tests/setup/svelte.ts` is this plugin. It compiles `.svelte` components, and `.svelte.ts` / `.svelte.js` rune modules (Bits UI ships rune modules):

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

  - `runes: true` applies only to our own files. Forcing runes on `node_modules` breaks Bits UI. This matches the store build's compile options.
  - `css: "injected"` puts component styles where the component mounts, so a component in a shadow root gets its `<style>` inside the root, as in the product.

### 7.1.7 Flags that can't live in `bunfig.toml`

- **Q-TOOL-15.** Every `bun test` script except `test:browser` passes `--isolate` and `--conditions=browser`.
  - `--isolate` gives each test file a fresh global object and module registry. Without it, `mock.module`, Testing Library's cleanup and Svelte's styles injected into `document.head` leak between files. bunfig has no `isolate` key.
  - `--conditions=browser` makes Svelte resolve its client build. Without it Svelte resolves its server build and `mount()` throws. Every bunfig placement of `conditions` was ignored in the spike, so it lives on the command line.

### 7.1.8 Scripts

- **Q-TOOL-16.** `package.json` has these scripts:

| Script | Command |
|---|---|
| `test` | `bun test --isolate --conditions=browser` |
| `test:coverage` | `bun test --isolate --conditions=browser --coverage && bun scripts/coverage.ts` |
| `test:browser` | `bun test --config=bunfig.browser.toml`, over `.output/chrome-mv3` and `.output/firefox-mv3` |
| `typecheck` | `svelte-check --tsgo` |
| `build`, `build:firefox` | `wxt build`, `wxt build -b firefox` |
| `build:livecheck` | `wxt build --mode livecheck` (and with `-b firefox`) |
| `build:beta` | `wxt build -b firefox --mode beta` ([REL-CI-10](08-release.md#71-firefox)) |
| `zip`, `zip:firefox` | `wxt zip`, `wxt zip -b firefox` (Firefox's also writes the sources zip; [REL-CI-25](08-release.md#142-releaseyml)) |
| `zip:beta` | `wxt zip -b firefox --mode beta` (REL-CI-25) |
| `check:budget`, `check:manifest`, `check:zip` | `bun scripts/<name>.ts` |
| `watch:static` | `bun tools/watch/static.ts` |

  - The beta mode ([REL-CI-10](08-release.md#71-firefox)), `build-for-amo` ([REL-STORE-28](08-release.md#124-the-bun-and-arm64-build)) and `scripts/amo-metadata.ts` ([REL-CI-30](08-release.md#142-releaseyml)) are specified in [08-release.md](08-release.md).
  - A `bun run` script that needs Bun when Bun isn't on `PATH` reaches it through `$npm_execpath`.
- **Q-TOOL-17.** `bunfig.browser.toml` sets `root = "tests/browser"`, loads none of the four preloads above, and sets per-test timeouts long enough for browser launches. `bun test` without `--config` never collects `tests/browser/**` (Q-TOOL-11).

### 7.1.9 Type checking and dependencies

- **Q-TOOL-18.** `typecheck` runs `svelte-check --tsgo`, which checks `.ts` and `.svelte` files with TypeScript 7's native checker. The dev dependencies are `typescript@~6` (svelte-check declares `^5 || ^6` and other tools use the JavaScript API) plus `@typescript/native@npm:typescript@7`, replacing today's lone `typescript@^7`. **PROVISIONAL:** the exact `svelte-check --tsgo` flags, until the scaffold runs it.
- **Q-TOOL-19.** Dependencies:
  - **Removed:** `vitest`, `@vitest/coverage-v8`, `@vitejs/plugin-react`, React, Base UI, sonner, `idb`, `fake-indexeddb`.
  - **Added:** `svelte`, `@wxt-dev/module-svelte`, `bits-ui`, `@webext-core/isolated-element`, `@happy-dom/global-registrator`, `@testing-library/svelte`, `@testing-library/jest-dom`, `svelte-check`, `playwright`, `puppeteer`, `web-ext` (beta signing, [REL-CI-32](08-release.md#142-releaseyml)).
- **Q-TOOL-20.** `wxt.config.ts` and everything under `build/` use Node APIs only, so a store build runs with npm on Node 24, as AMO's reviewers rebuild it ([REL-STORE-27](08-release.md#123-source_code_reviewmd-in-the-sources-zip), [§12.4](08-release.md#124-the-bun-and-arm64-build)). Bun is needed only to install dependencies, run tests and run scripts.

### 7.1.10 What `bun test` can't reach

These go to the real-browser layer (§7.2.5), the watch (§7.5) or the live check (§7.5.6):
- anything that needs the build: CSS imports load as `{}`, `?inline` loads as `{}`, `import.meta.glob` is `undefined`, Tailwind isn't applied, and the registered page scripts and their linking don't exist;
- layout and real shadow-DOM behaviour. happy-dom returns empty rects from `getBoundingClientRect` (so every Floating UI position is 0), `ResizeObserver` does nothing, `@layer` and `@property` are dropped, `showModal()` only sets `open`, and `delegatesFocus` is ignored. A pass in happy-dom doesn't prove a real browser behaves the same;
- real browsers, and real YouTube or YouTube Music;
- branch coverage (§7.4).

---

## 7.2 Test layers

### 7.2.1 Overview

| # | Layer | Runs on | What it covers | Where | Runs |
|---|---|---|---|---|---|
| 1 | Unit | `bun test` | Pure modules | `src/**/*.test.ts`, beside the module | every push and PR |
| 2 | Recorded responses | `bun test`, the recorded `PagePort`, `fixtures/youtube/**` | The gateway through its interface, against every recorded answer | `src/page/**/*.test.ts` | every push and PR |
| 3 | Fake browser and DOM | `bun test`, WXT's fake browser, `tests/fakes/`, happy-dom, Testing Library | Background modules over fakes; site core, kit and features in happy-dom; UI components over the fake `Backend`; cross-context flows | `src/**`, `tests/integration/` | every push and PR |
| 4 | Real browser | `bun test --config=bunfig.browser.toml`, Playwright (Chromium), Puppeteer (Firefox), on the built extension | Off means zero, registration, linking, teardown, styles and positions, updates, timings | `tests/browser/` | every PR, after the `build` job |
| 5 | Watch | Bun scripts; layer 4's drivers against the live sites, signed out | The static watch and the browser watch (§7.5) | `tools/watch/` | daily, on demand, release gate |
| 6 | Signed-in live check | The live-check build in the developer's own browsers | Every route, quietness, writes, captures (§7.5.6) | `src/livecheck/` | before each release, on a red watch, on a user report |

- **Q-TEST-1.** Unit tests sit beside their module as `*.test.ts`. `tests/` holds only `setup/`, `fakes/`, `guards/`, `integration/` and `browser/`.

### 7.2.2 Layer 1: unit

- **Q-TEST-2.** Every pure module has unit tests with no DOM and no fake browser. That covers at least:
  - the channel-filter rule, the outcome and toast rules, and the copy rules;
  - the key matcher and the key recorder;
  - the watch tracker's counting rule (table-driven: stretches, gaps, playback rate, the goal clamp with R27's rows for videos under 3 s, live/clip/made-for-kids exclusion, "can't measure", and which outcomes count as a run: only *added* and *already in*, never *filtered out*, *failed* or a session skip; R23, R43);
  - document codecs, migrations (including the 1.4.5 storage snapshots from the upgrade test, [REL-CHK-16](08-release.md#173-fixtures-signed-paths-and-chrome)), the start-up check that tells a 1.x upgrade from a fresh install, with no `onInstalled` and whatever `schema` says ([ARC-MOD-25](06-architecture.md#69-the-store-module-interface); R64), the private-write table, the sync budget counter, the chunker and the conflict rule;
  - the registry derivations: the registrar's `desired()` and its diff, the monitor's `deriveStatus()`, and `badgeFor()`;
  - each parser's shape handling.
- **Q-TEST-3.** Decision logic is written as data tables and tested row by row: the route tables, the private-write table, the failure and outcome mapping, status derivation and badge priority. Each row is one test case (this is also how decisions get coverage without branch coverage, §7.4).

### 7.2.3 Layer 2: recorded responses

- **Q-TEST-4.** The gateway is tested only through its interface (`run`, `watch`, `probe`), over the **recorded** `PagePort` adapter. The recorded adapter replays `fixtures/youtube/**` and keeps small in-memory fakes for page state: YouTube Music's queue (`app.queue`), the miniplayer's queue data, and a scripted player.
- **Q-TEST-5.** Layer 2 covers, for each site's route table:
  - the route order and every fallback;
  - **route unavailable** (hook missing, throws before sending, no answer in time) versus **job failed** (YouTube answered);
  - **writes never run twice:** a write falls back only when the first route provably sent nothing (hook missing, or a synchronous throw); a write that may have been sent is reported failed or unconfirmed, never retried;
  - **the account guard:** the first answer for another `datasyncId` trips it, and every account job is refused from then on (using derived fixtures with another `datasyncId`);
  - every known answer shape of every job;
  - the failure mapping of the add flow's error replies;
  - success judged by effect: YouTube Music's queue growing, a moved queue item's position, the YouTube queue entry's `playlistSetVideoId` read back after an add, and the HTTP 409 retry;
  - the two lanes per tab (app state and playlists), each running one job at a time in order, with page reads skipping the lanes;
  - which breakage signal each situation raises (§7.5.7).
- **Q-TEST-6.** A table test enumerates every file under `fixtures/youtube/**` and runs it through its job's parser. Each `<job>/<variant>` has an expected result in the table (recognised as a named outcome, or deliberately `unrecognised`). A fixture without an entry fails the suite, so a newly captured shape fails until its parser and expectation are added.
- **Q-TEST-7.** Parsers read only the fields they need and accept every shape in the fixtures. Anything else is **unrecognised**. A parser never guesses: a missing `status` is not success. Layer 2 includes at least one derived "renamed keys" fixture per job that must come out as `unrecognised`.
- **Q-TEST-8.** The static watch's node adapter runs the same gateway (Q-WATCH-9), so a parser change is covered by layer 2 and by the next watch.

### 7.2.4 Layer 3: fake browser and DOM

- **Q-TEST-9.** Background modules are tested through their interfaces over fakes:
  - **Store:** over WXT's fake `storage.local` and `storage.session`, plus our fake sync area and the two-browser fake server (Q-TEST-14).
  - **Registrar:** over the fake `ScriptingPort` and `AccessPort`.
  - **Tabs:** over the fake `TabsPort`, with tabs wired to in-process site cores.
  - **Add flow:** with a scripted `exec`, and end to end with the real gateway over recorded answers.
  - **Monitor:** signals in, statuses out, with the thresholds of §7.5.7.
- **Q-TEST-10.** The site core, the kit and each feature are tested in happy-dom over a `direct` `PageChannel` to a real gateway over the recorded page, with a `memory` transport to the background side. The `direct` channel still round-trips every message through `JSON.stringify`, so anything that can't cross the worlds fails here.
- **Q-TEST-11.** Popup, settings and first-run page components are tested with Testing Library over the fake `Backend` (`src/ui/backend/fake.ts`, the same fake the prototypes used). The first view's `Backend.load()` makes exactly one `storage.local.get` (Q-PERF-34).
- **Q-TEST-12.** Cross-context flows live in `tests/integration/`, with every context wired in one process by the memory transport. At least: a watch-progress reading crosses a playlist's goal → the add flow → membership and add in the tab → a toast with Undo → Undo removes exactly what was added.
- **Q-TEST-13.** Bits UI component tests stay few and grouped into few files, because under `--isolate` every file recompiles Bits UI's `.svelte` files (about 1.7 s per file in the spike).
- **Q-TEST-14.** The fakes we own, each the second adapter of a real seam, live in `tests/fakes/`:

| Fake | Stands in for | Must model |
|---|---|---|
| `sync-area` | `storage.sync` | 102,400 bytes in total (counted the way the store counts them), 8,192 bytes per item, 512 items; Chrome's 120 writes a minute and 1,800 an hour; an atomic multi-key `set`; the quota error by kind; per-key change delivery that can be delayed, reordered or dropped |
| `sync-server` | the browser vendor's sync | Joins two or more `sync-area` fakes so tests can play two browsers: join, conflicts, chunks, uninstall wipe |
| `tabs` | `TabsPort` | URL-pattern queries per site, `lastAccessed`, `discarded`, `frozen`, `incognito`, message timeouts |
| `scripting` | `ScriptingPort` | register, update (all-or-nothing, applies from the next load), unregister, list, `executeScript` |
| `access` | `AccessPort` | `contains`, `onAdded`, `onRemoved` |
| `transport` | `Transport` | the `memory` adapter of `shared/rpc` |
| `core` | the site core, for feature tests | a scripted `FeatureContext` |

- **Q-TEST-15.** WXT's fake browser is used only where it's faithful. Checked in the spikes, it implements `storage` local, session and sync (no quotas; `getBytesInUse` throws), `runtime` (`sendMessage` reaches `onMessage` in the same context), `tabs` (`query` matches `url` only by exact string, no `lastAccessed`, and after `reset()` no window is focused), `windows`, `action` with per-tab badge text, `alarms`, `notifications` and part of `webNavigation`. `scripting`, `permissions`, `commands`, `contextMenus`, `identity` and `i18n` throw `MockNotImplementedError`. So `storage.sync`, `tabs`, `scripting` and `permissions` always go through our own fakes.
- **Q-TEST-47.** **Running-cost soaks** in layer 3, with fake timers (`jest.useFakeTimers()`), a counting transport and the counting storage fakes ([Q-PERF-61](#768-running-cost)):
  1. **Idle hour:** the core, the kit and every www feature in happy-dom, on a watch page and on a grid, with the clock advanced 60 minutes and no events. No timer is left pending, and nothing is sent or stored.
  2. **Playback hour:** a scripted player fires `timeupdate` every 250 ms for 60 minutes, with two pauses, a seek, 10 minutes hidden and two video changes. `tab.progress.save` messages and store writes stay within [Q-PERF-47](#768-running-cost) and [Q-PERF-54](#768-running-cost), and once every goal is reached the tracker's listener is gone ([YT-AA-44](02-youtube.md#2312-what-tracking-costs)).
  3. **A day in the background:** 200 page loads, 4 hours of playback in two tabs, 50 user actions and 20 sync arrivals, replayed through the background over fakes. Routine wakes make no `scripting` call, only [ARC-MOD-39](06-architecture.md#643-background-srcbackground)'s listeners are registered, and writes stay within Q-PERF-54.
  4. **Sync pacing:** 100 edits in 10 s make at most 3 `storage.sync.set()` calls, and an edit that changes nothing makes none ([SYNC-27](04-features-accounts-data.md#32-the-local-copy-comes-first)). (R102)

### 7.2.5 Layer 4: real browser

- **Q-TEST-16.** Layer 4 runs the **store builds** (`.output/chrome-mv3`, `.output/firefox-mv3`) in real browsers:
  - **Chromium:** Playwright with its bundled Chromium (`channel: "chromium"`) in a persistent context, headless included. Branded Chrome dropped `--load-extension` in 137.
  - **Firefox:** Puppeteer 24.8 or later over WebDriver BiDi, with `installExtension` (Firefox 137+), against Firefox release. Playwright can't load Firefox extensions.
- **Q-TEST-17.** Its pages are local fixtures in `tests/browser/pages/`, served at the real `https://www.youtube.com/…` and `https://music.youtube.com/…` URLs by Playwright's `context.route` and Puppeteer's `setRequestInterception`, so the registered scripts match and inject as they do on the live sites. The YouTube pages are shaped like YouTube's (for example 60 `ytd-rich-item-renderer` cards), with a snapshot of YouTube's real `kevlar_base` stylesheet and `<html>` at `font-size: 62.5%`. The YouTube Music pages are shaped like its Home, album, playlist and player pages, with a snapshot of its stylesheet.
- **Q-TEST-18.** Layer 4 checks, in both browsers unless marked Chromium. (R1, R14, R28, R31, R38)
  1. **Off means zero.** With every feature on a site off, no extension execution context appears in the page (Chromium: `Runtime.executionContextCreated`), and no node, style, listener or request of ours is added. `scripting.getRegisteredContentScripts()` is empty before consent. The same holds on music.youtube.com with the YouTube Music section switch off, even with its features and "Also on YouTube Music" on (R1), and with YouTube Music access refused while its features are saved on (R14).
  2. **Each feature alone** loads only its own file, its site's page half and core, and the kit if it draws (Chromium: `Debugger.scriptParsed`). The card menu alone loads no kit, even while its "not working" notice shows ([ARC-MOD-32](06-architecture.md#64-the-module-map), R28).
  3. **Registration, order and linking:** the IDs `pp-<site>-page` (MAIN, `document_start`) and `pp-<site>` (isolated, `document_idle`), the isolated list in order core → kit → features in registry order, and a feature component mounting on the kit's linked Svelte runtime.
  4. **Switching in an open tab:** switching a feature on injects it into open matching tabs without a reload; switching it off removes every element, style, listener, observer and timer it added (Chromium: `DOMDebugger.getEventListeners`); switching everything off leaves zero hosts of ours.
  5. **Extension update with open tabs** (YouTube and YouTube Music tabs open, features on): registrations come back, open tabs are re-injected, the new core's `ppt:retire` makes the old core and gateway dispose themselves, and there are no doubled buttons, toasts or key handling; auto-add keeps counting; fresh tabs get the scripts. Until this passes in both browsers, re-injection after updates and the `ppt:retire` handover stay **PROVISIONAL**.
  6. **`runAt` cost:** load cost and missed first navigation and player events with the page half at `document_start` and the isolated list at `document_idle`. Those values stay **PROVISIONAL** until this has run.
  7. **Styles, positions and fullscreen:** our controls' computed styles and positions at their anchors; the toast layer visible when the page makes `<html>` the fullscreen element; the layer moved into a fullscreen element that doesn't contain `<body>`.
  8. **Isolation and popovers:** the popovers close on Escape while the hosts isolate events (Bits UI's own `document` listener can't hear it), and Escape doesn't reach the page; typing in the picker's search doesn't reach the page's hotkeys; clicks, pointer and mouse down/up and `contextmenu` stop at our hosts.
  9. **Timings and per-card cost** (Chromium): the time budgets of [§7.6.5](#765-in-page-time), gated at 1.5× in CI ([Q-PERF-41](#767-enforcement)). Firefox records the same cases with `performance.mark` for information only (Q-TEST-19).
  10. **Extension pages render:** the built `popup.html`, settings page and first-run page (`onboarding.html`) each render their first view (a known landmark is present and no uncaught error is logged). The first-run page is checked in both its views: first run, and the upgrade note from a seeded 1.x upgrade state (R37). This catches import cycles between code-split groups and top-level await deadlocks, which blanked pages in the prototype while their size numbers still looked fine. It's a real-browser test, not part of `check:budget`, which only measures bytes ([UI-RULE-17](05-ui.md#extension-pages); R52).
  11. **Accessibility:** Q-TEST-20.
- **Q-TEST-19.** On Firefox, which has no Chrome DevTools Protocol, the checks marked Chromium above (execution contexts, `scriptParsed`, `getEventListeners`, `Performance.getMetrics`, CPU throttling) are replaced by DOM, network and registration checks. Firefox gates sizes and behaviour, never time: its timings are recorded with `performance.mark` and reported for information. (R31)
- **Q-TEST-20.** **Accessibility checks** run in layer 4, in both browsers ([UI-RULE-40](05-ui.md#511-accessibility-as-decided), UI-RULE-42):
  - axe-core runs against the popup, settings and the first-run page, and against our in-page hosts on YouTube and YouTube Music (the layer host with a toast and a notice, the overlay, an inline control and an open picker). Any violation fails the run;
  - with reduced motion emulated (`prefers-reduced-motion: reduce`), nothing of ours animates anything but `opacity`: sheets, popovers and toasts fade instead of sliding, and the deep-link ring and pulsing placeholders don't animate beyond opacity ([UI-RULE-42](05-ui.md#511-accessibility-as-decided)).

  The manual screen-reader pass is a release step, not a test (Q-CI-18). (R38)
- **Q-TEST-48.** **Running-cost soak** in layer 4, with everything on ([Q-PERF-61](#768-running-cost)):
  - **The scenario:** the fixture watch page with a real `<video>` (a looping WebM clip behind the fixture's player API) plays for 3 minutes visible and 3 minutes hidden behind another tab; then the grid page sits idle for 60 s.
  - **Chromium:** a trace attributes main-thread time, timers, animation frames, observer callbacks and the longest task to our scripts ([Q-PERF-45](#768-running-cost)). CDP target events count worker starts, an extension page counts writes by area through `storage.onChanged`, and route interception counts requests.
  - **Firefox:** the same counts come from the **counting build**: the store build compiled with `platform.mode === "test"`, which adds counters for starts, messages, writes, timers and observer callbacks behind that flag and nothing else. `check:zip` keeps it out of store zips. Time is recorded with the Firefox Profiler, for information (Q-TEST-19).
  - Counts gate in both browsers; times as [Q-PERF-62](#768-running-cost). (R102)

### 7.2.6 Guard tests

- **Q-TEST-30.** These guard tests in `tests/guards/` run in every `bun test` run. Each fails with the offending file and line:

| Guard | Fails when |
|---|---|
| `storage-writes` | anything outside `src/background/store/` and its storage adapter calls `storage.*.set`, `remove` or `clear` |
| `imports` | a file breaks the import rules: `shared/` imports only `shared/` (and `svelte` in `shared/picker/`); `page/` only `shared/` and `page/`; `site/` only `shared/` and `site/`; `background/` only `shared/` and `background/`; `ui/` only `shared/` and `ui/`; `wxt/browser` only in `src/entrypoints/**`, `site/core/adapters/`, `background/adapters/` and `ui/backend/browser.ts` |
| `env` | `import.meta.env` appears outside `src/shared/platform.ts` |
| `page-console` | `console` appears in `src/page/` (the page world logs nothing) |
| `entrypoints` | `wxt/utils/define-*` appears outside `src/entrypoints/**`, or an entrypoint is over 15 lines |
| `registry` | a registry file has no `src/entrypoints/<file>.ts`; a page entrypoint is neither in the feature registry nor a library; `perf-budget.json` doesn't hold exactly the registry's pieces |
| `fixtures-privacy` | the privacy lint (Q-FIX-12) finds anything |
| `watchlist` | a watch ID used in `src/` or `tools/` isn't in the watch list; an entry has neither a static check nor a runtime probe; anything in `src/` imports from `tools/` |

- **Q-TEST-31.** **No conflicting utilities in UI components.** The extension pages use a `clsx`-only `cn`, with no `tailwind-merge`, so two utilities for one CSS property resolve by Tailwind's CSS order, not by the class string. A test reads every component in `src/ui/components/` and fails if a component's base classes and any of its variants' or sizes' classes set the same CSS property ([UI-RULE-12](05-ui.md#extension-pages)) (for example base `border-transparent` with an outline variant's `border-border`, which left light-mode outline buttons without a border).
- **Q-TEST-32.** **Switches and checkboxes are controlled.** A layer-3 test renders the Switch and Checkbox with a listener that refuses the change, and with one that defers it, and asserts that the control keeps showing the stored state. The generated shadcn-svelte switch flipped itself before asking its parent, so a cancelled change kept showing "on". The places that refuse or defer are consent, the sync join question, a site-access prompt, "sync full", an "update needed" refusal (R13) and a private window ([UI-RULE-13](05-ui.md#extension-pages), [FT-12](04-features-accounts-data.md#12-switching-features)).
- **Q-TEST-33.** **No identity comparisons of `$state`-held objects** in kit and feature code ([UI-RULE-33](05-ui.md#page-ui-youtube-and-youtube-music)): `$state` proxies objects, so `===` against the original silently fails (two bugs in the in-page prototype). Compare by ID or by element. A CI check enforces it on every push and PR. Whether it's a lint rule or a guard test, and its exact pattern, is the build's choice. (R40)
- **Q-TEST-44.** **Ready for translation** ([UI-RULE-43](05-ui.md#extension-pages), [ARC-MOD-35](06-architecture.md#644-popup-settings-and-the-first-run-page-srcui); R93):
  - an `i18n` guard fails on a message key the code uses that `_locales/en/messages.json` lacks, on a key no code uses, and on a placeholder a message and its callers disagree on;
  - a lint flags string literals rendered as text in `src/ui/` and `src/site/` components;
  - layer-3 component tests render the popup's first view, the settings cards and the in-page toasts in a pseudo-locale 40 % longer than English, and assert that nothing is clipped or overlaps.
- **Q-TEST-45.** **The features of 2026-10-20** are tested like every feature, with the browser fakes extended where WXT's fake lacks an API (R84–R92):
  - **Keys from any tab:** a fake `commands` (`onCommand`, `getAll`) drives ARC-ACC-69: the tab order, discarded tabs skipped, no answer while the feature is off or held, the 3 s badge mark, and injection on use;
  - **Save from the browser's menu:** a fake `contextMenus` and `permissions`: entries created only while the feature is on and the permission held, removed with the permission when it's switched off, and the held state after `permissions.onRemoved`;
  - **the picker's untick and its Undo, Recent adds, the settings file** (export, import, every refusal) and **the toolbar marks' priority**, in layers 1 and 3;
  - `check:manifest` asserts the four commands with no `suggested_key`, `optional_permissions: ["contextMenus"]` and `default_locale` (Q-CI-3);
  - the watch list gains entries for `ytmusic-app`'s `handleNavigationEndpoint` and the library toggle's shape, which the four YouTube Music actions use (ARC-REG-09; R85).
- **Q-TEST-46.** **The `running-cost` guard** in `tests/guards/` runs with the others ([Q-PERF-59](#768-running-cost)). It fails, with the file and line, when:
  - `setInterval` or the `alarms` API appears anywhere in `src/`;
  - a `tabs.on*`, `windows.on*`, `webNavigation` or `menus.onShown` listener, or `menus.refresh`, appears anywhere in `src/`;
  - `storage.onChanged`, or an area's own `onChanged`, appears in `src/site/` or `src/page/`;
  - `addEventListener`, `MutationObserver`, `ResizeObserver`, `IntersectionObserver`, `setTimeout` or `requestAnimationFrame` appears in feature or kit code (`src/site/features/`, `src/site/kit/`) instead of going through the core's `Scope` ([UI-RULE-36](05-ui.md#page-ui-youtube-and-youtube-music));
  - an observer is given `document`, `document.documentElement`, `document.body` or the app root (`ytd-app`, `ytmusic-app`) with `subtree: true` ([Q-PERF-27](#764-what-keeps-pages-within-budget), [Q-PERF-49](#768-running-cost)). (R102)

---

## 7.3 Fixtures

### 7.3.1 Layout and contents

- **Q-FIX-1.** Recorded answers live in `fixtures/youtube/<job>/<variant>.json`, one file per job and variant, for example `membership/view-model.json` or `add/missing-playlist.json`. `<job>` is the job's ID in [06's job catalogue](06-architecture.md#625-job-catalogue), and results use its names. Markup snippets live in `fixtures/markup/`. (R34)
- **Q-FIX-2.** Each answer fixture holds: the job, route and site; the raw answer (HTTP status and body, or the page-read value); YouTube's client version; `capturedAt`; `lastConfirmed`; and its provenance.
- **Q-FIX-3.** Provenance is one of:
  - **captured:** recorded live by the live-check build, then redacted;
  - **derived:** a capture with a documented edit, for example another `datasyncId` for the account guard, or renamed keys for "unrecognised";
  - **synthetic:** hand-written from cited evidence where capturing would mean crawling, such as a full playlist or an HTTP 429. A synthetic fixture is replaced once a real one is captured.
- **Q-FIX-4.** Markup snippets cover cards, both YouTube Music like-button anchors, queue items, and album and playlist headers. They feed happy-dom tests of where controls go. Positions and styles are layer 4's and the browser watch's.

### 7.3.2 The minimum set before 2.0 ships

- **Q-FIX-5.** Before 2.0.0 ships, `fixtures/youtube/` holds at least:

| Job group | Jobs ([§6.2.5](06-architecture.md#625-job-catalogue)) | Variants |
|---|---|---|
| Membership | `membership` | both shapes (renderer and view model), Watch Later, each privacy value, paging if the signed-in checks find it, signed out (401); YouTube Music's answer with and without membership |
| Playlist list | `playlists` | lockups, an empty account, signed out |
| Add | `add`, `save` | added (with `setVideoId`); duplicate (www, and YouTube Music's rejection); missing playlist; full playlist; made for kids; signed out (`STATUS_FAILED` with the sign-in popup); rate-limited (429); an account that can't use playlists; account mismatch; unrecognised |
| Undo | `remove`, `unsave` | removed; already gone |
| Create | `create` | created; 429; the public daily cap; no channel; YouTube Music's gated answer; a refused title |
| Account label | `accountLabel` | own account; brand account; no channel; signed out |
| Typed channel | `resolveChannel` | each input form; a redirect hop; a 404; a terminated channel |
| Player and video reads | `videoInfo`, `channelOf`, the `player` and `nav` streams | navigation details (watch and Shorts); player responses for an ordinary video, a live stream, a premiere, a waiting room, post-live, a replay, a clip (`clipConfig`), a made-for-kids video (`PLAYBACK_MODE_PAUSED_ONLY`) and a Shorts ad (`adClientParams.isAd`); `next`; `reel_item_watch`; a collaboration video |
| Queue, YouTube | `queueAdd`, `queueUndo` | the miniplayer's queue data before and after an add; the quiet removal answer |
| Queue, YouTube Music | `queueInsert`, `queueRemove`, `queueRemoveIds`, `queueMove`, `queueReinsert`, `itemInfo` | `get_queue` answers (song, album, playlist); `app.queue` snapshots, including before and after a move; row `data` for a song row, a card, a queue item and a signed-out row |
| More quick actions, YouTube Music (R85) | `library`, `navigate`, `itemInfo` | row and card `data` with the library toggle in both states, a mix endpoint and artist and album browse endpoints; a song with no album |

### 7.3.3 Capture and redaction

- **Q-FIX-6.** Captures come only from the live-check build (§7.5.6), in the developer's signed-in browsers. `tools/fixtures/import.ts` imports them.
- **Q-FIX-7.** Redaction happens at import, before anything is written to the repo:
  - **IDs:** playlist, entry, channel and account IDs map to stable fake IDs, consistently across all fixtures of one import, so cross-references still hold. Fake IDs keep the real shape, for example `PLfixture000000000001`, so a playlist ID still passes the migration's check of at least 16 characters after `PL` ([REL-MIG-14](08-release.md#24-cleaning-typed-playlist-ids)).
  - **Text and tokens:** titles, names, handles, avatar URLs, visitor data and tracking parameters are replaced or stripped.
- **Q-FIX-8.** Cookies and request headers are never captured, not even before redaction. Live-check reports never contain cookie values, auth hashes or the `DATASYNC_ID` value.

### 7.3.4 Refreshing

- **Q-FIX-9.** Every signed-in live check recaptures every job. The import compares **shape outlines** (keys and value types, never values; §7.5.8) with the existing fixtures of that job:
  - same shape: only `lastConfirmed` moves;
  - new shape: it's added as a new variant, and Q-TEST-6 fails until its parser and expectation handle it.
- **Q-FIX-10.** Old shapes stay, because YouTube's A/B tests serve several shapes at once. A shape is removed only on purpose, in the same change as the parser change that drops it.
- **Q-FIX-11.** Refresh triggers: before every release; a red watch; a user report showing an unrecognised shape. Each test run **warns** (never fails) about fixtures not confirmed in the last 90 days *(starting value)* and lists the synthetic ones.

### 7.3.5 The privacy lint

- **Q-FIX-12.** The `fixtures-privacy` guard fails the suite if any committed fixture (everything under `fixtures/`, and the upgrade test's migration snapshots in `src/background/store/fixtures/1.4.5-S{n}.json`, beside the store module that runs the migrations ([REL-CHK-16](08-release.md#173-fixtures-signed-paths-and-chrome), [ARC-MOD-29](06-architecture.md#610-folder-layout)), whose seed IDs are on the allowlist) contains:
  - a cookie name;
  - an `Authorization` value;
  - an e-mail address;
  - an avatar host;
  - a `datasyncId`-shaped value;
  - an ID outside the fixture allowlist.

---

## 7.4 Coverage policy

- **Q-TEST-40.** Bun reports line and function coverage only, never branches, and only for files some test loaded. 2.0 accepts that, and makes up for it with decision tables tested row by row (Q-TEST-3).
- **Q-TEST-41.** `scripts/coverage.ts` reads `coverage/lcov.info` after `test:coverage` and fails, naming each file, when:
  - a `src/**/*.ts` module is under 80 % of lines or under 80 % of functions; or
  - a `src/**/*.ts` module wasn't loaded by any test (it's missing from the report).
- **Q-TEST-42.** Excluded from Q-TEST-41: `src/entrypoints/**`, `**/adapters/browser*.ts` and `**/adapters/live-*.ts` (layer 4 and the watch cover them), and `*.svelte` (Bun reports compiled-output line numbers for them). Components therefore stay thin: their logic lives in `.ts` or `.svelte.ts` modules, which count.
- **Q-TEST-43.** Bun's own `coverageThreshold` isn't used: it fails per file with no message, and can't see unloaded files.

---

## 7.5 Breakage detection

2.0 relies on YouTube and YouTube Music internals that change without notice. It has no server, no telemetry and no remote configuration, so breakage is caught before users notice where possible, detected on the device otherwise, and fixed only by releases.

### 7.5.1 The checks at a glance

| Check | Runs | Signed in? | Catches |
|---|---|---|---|
| Recorded answers (layer 2) | `bun test`, every push and PR | no network | Regressions in logic and parsers, against every known shape and error |
| Static watch | CI: daily, on demand, release gate | No | Watch-list needles in YouTube's and YouTube Music's HTML, bundles, player scripts and CSS (Chrome and Firefox user agents); public jobs through the product's gateway; signed-in endpoints still read as "signed out" |
| Browser watch | CI: daily, on demand, release gate | No | The built extension on the live sites: runtime probes, events, page reads, anchors, theme variables, our controls' styles and positions, signed-out end-to-end queue actions, registration and injected CSS |
| Signed-in live check | The developer's own Chrome and Firefox, from the live-check build | Yes, the developer's | Every job through every shipped route, quietness, real writes on a scratch playlist, induced errors, player checks; recaptures fixtures |
| Check now | The user's browser, from Diagnostics; disabled with "Open YouTube to check" when no YouTube tab is open (R15) | Yes, the user's | Read-only probes plus one read per read job; see [HEALTH-23](04-features-accounts-data.md#55-diagnostics-check-now-and-the-report) |

- **Q-WATCH-1.** No Google account, session cookie or other YouTube credential is ever stored in CI or used by any CI job.
  - *Runner-up:* a test account's cookies in CI secrets for a nightly signed-in check. It lost because Google flags automated sign-ins, session cookies rotate, a stored session is a live credential to guard, and a bot acting on YouTube is the "automated means" 2.0 otherwise avoids.
- **Q-WATCH-2.** The developer uses the extension daily in their own signed-in browsers, which keeps at least one account inside YouTube's live experiments. This is a practice, not a check.

### 7.5.2 The watch list

- **Q-WATCH-3.** One list names everything in YouTube and YouTube Music that 2.0 relies on. It's the module `src/shared/watchlist.ts`, exporting `watch: WatchEntry[]`. Each entry has an ID, its site, the jobs and features that depend on it, and its runtime probe where one is possible.
- **Q-WATCH-4.** **Runtime probes** ship in the gateway (`PagePort.has(watchId)`, `Gateway.probe()`) and in the features' drawing code. **Static checks** (needles) live only in `tools/watch/needles.ts`, keyed by the same IDs, and never ship.
- **Q-WATCH-5.** Needles survive minification: they match only string literals and string-keyed names, using patterns where YouTube's minified names sit beside them. For example, needles like `X.excludeWatchLater=!1` and `_.ne("USER_SESSION_ID")` become patterns that ignore the minified identifier.
- **Q-WATCH-6.** Experiment flags are reported, never failed: `music_web_enable_wiz_miniplayer` (YouTube Music's new player) and `pageid_as_header_web` (how brand accounts are addressed). A change in their signed-out values is reported as an early sign of a rollout.
- **Q-WATCH-7.** Code that comes to rely on a new internal adds its watch-list entry, needle or probe, and fixtures in the same change. Review checks this; the `watchlist` guard (Q-TEST-30) checks that every ID used exists.
- **Q-WATCH-8.** The list holds at least these entries:

| Area | Entries |
|---|---|
| **Both sites** | `ytcfg`: `LOGGED_IN`, `DATASYNC_ID`, the client name and version, visitor data, `SESSION_INDEX`, `DELEGATED_SESSION_ID`, `USER_SESSION_ID`, `WEB_PLAYER_CONTEXT_CONFIGS`. The experiment flags of Q-WATCH-6 (report only). |
| **YouTube requests** | YouTube's command resolver, located by shape at `default_kevlar_base.<minified key>.instance.resolveCommand` (no element carries `resolveCommand` any more) on first use, and how many keys match ([ARC-ACC-13](06-architecture.md#623-the-command-resolver-found-by-shape), R34), with `commandController` (`onSuccess` / `onServerError`). `yt-service-request` and `yt-service-request-completed`. Every job's request path. The three-part auth hash: `SAPISIDHASH`, `SAPISID1PHASH`, `SAPISID3PHASH`, the `_u` part, `X-Goog-AuthUser`, and `X-Goog-PageId` / `onBehalfOfUser`. Both `get_add_to_playlist` shapes: `playlistAddToOptionRenderer` with `containsSelectedVideos`, and `toggleableListItemViewModel` with `saveToPlaylistListEntity`. The `FEplaylist_aggregation` lockups. `edit_playlist` results (`STATUS_*`, `setVideoId`). `createPlaylistServiceEndpoint`. `addToPlaylistCommand` with `PLAYLIST_EDIT_LIST_TYPE_QUEUE`. |
| **YouTube queue** | The miniplayer's queue data; the temporary `TLPQ` queue list; the panel data at `ytd-playlist-panel-renderer.data` / `.polymerController.data`; `yt-playlist-manager`; the `yt-playlist-data-updated` event; `playlistEditEndpoint` `ACTION_REMOVE_VIDEO` by `setVideoId` with the quiet value `params: "IAE%3D"`; `playlistSetVideoId` |
| **YouTube player** | Player ids `movie_player` and `shorts-player`. Methods `getVideoData`, `getCurrentTime`, `getDuration`, `getPresentingPlayerType`, `getPlayerResponse`. Player events `onAdStart`, `onAdEnd`, `onVideoDataChange`. Page events `yt-player-updated` and `yt-navigate-finish`. Markers: `ad-showing`; the `videoDetails` flags `isLive`, `isLiveContent`, `isUpcoming`, `isPostLiveDvr`; `clipConfig`; `adClientParams.isAd`; `PLAYBACK_MODE_PAUSED_ONLY`. |
| **YouTube page** | `ytd-app`. The card selectors: `yt-lockup-view-model` (`a.ytLockupViewModelContentImage`, `yt-thumbnail-view-model`, `a.ytLockupMetadataViewModelTitle`, `.ytLockupMetadataViewModelMenuButton button`); `ytd-video-renderer`, `ytd-rich-grid-media`, `ytd-grid-video-renderer`, `ytd-compact-video-renderer` (`a#thumbnail`, `ytd-thumbnail`, `a#video-title`, `a#video-title-link`, `#menu ytd-menu-renderer yt-icon-button#button button`); `ytd-playlist-panel-video-renderer` (`a#thumbnail`, `#thumbnail-container`, `a#wc-endpoint`, `#video-title`); `ytm-shorts-lockup-view-model` (`a.shortsLockupViewModelHostEndpoint`, `h3 a.shortsLockupViewModelHostOutsideMetadataEndpoint`, `.shortsLockupViewModelHostOutsideMetadataMenu button`). The watch page's action row `ytd-menu-renderer #top-level-buttons-computed` and `#flexible-item-buttons button[aria-label='Save to playlist']`. The Shorts column `reel-action-bar-view-model` and `pivot-button-view-model`. Search's preview layer `#video-preview ytd-video-preview`. YouTube's own hover toggles `[aria-label='Add to queue']`. The theme: `html[dark]` and the `--yt-sys-color-baseline--*` variables. |
| **YouTube Music app** | `ytmusic-app`'s `handleServiceEndpoint`, `handleNavigationEndpoint`, `handlePlaylistEditEndpoint` and `handleCommandWithCommandHandler`. `networkManager.fetch`. `app.queue` (`getItems`, `getCurrentItemIndex`, `removeItem`, `isEmpty`, `store`), `ADD_ITEMS`, `SET_QUEUE_CONTEXT_PARAMS` and `/music/get_queue`. The menu item's behaviour property `ytmusicServiceMenuItemBehavior` on `ytmusic-menu-service-item-renderer`. `queueAddEndpoint` with both insert positions, `removeFromQueueEndpoint`, `addToPlaylistEndpoint`, `likeEndpoint`. The queue panel's `ytmusic-reorderable-list-drop` event and the contents it reads. `navigator.mediaSession` and `#movie_player.getVideoData()`. The cast state at `state.castStatus`. |
| **YouTube Music page** | Song rows `ytmusic-responsive-list-item-renderer` and their `data` (anchor: before `:scope > ytmusic-menu-renderer`). Cards `ytmusic-two-row-item-renderer` with `ytmusic-item-thumbnail-overlay-renderer`. Queue items `ytmusic-player-queue-item` (autoplay ones under `#automix-contents`). Headers `ytmusic-responsive-header-renderer #action-buttons`. Both like-button anchors: `ytmusic-player-bar #like-button-renderer` in `.middle-controls-buttons`, and `ytmusic-miniplayer yt-video-action-bar-view-model` in `.ytMusicMiniPlayerRightSection`. `ytmusic-app[is-miniplayer-enabled]`. The toast's neighbours `tp-yt-paper-toast` and `ytmusic-mealbar-promo-renderer`. The item fields `itemInfo` reads: `musicVideoType`, the browse `pageType`, `watchEndpoint.index`, `selected`. |

### 7.5.3 The static watch

- **Q-WATCH-9.** `tools/watch/static.ts` (run as `watch:static`) is the static watch. Its first version is `docs/research/youtube-requests/bundle-check.mjs` from branch `research/youtube-requests`, grown to read the watch list and to cover YouTube Music and the player script. It:
  1. fetches the www and music page HTML, the app bundles, the player scripts and the CSS, each with a desktop Chrome and a desktop Firefox user agent, because YouTube serves different builds;
  2. checks every needle, the `ytcfg` keys, the player ids, and the experiment flags (report only);
  3. sends the **public jobs** signed out through the **product's own gateway** over the **node** `PagePort` adapter: `resolve_url`, channel `browse`, `next`, `reel_item_watch`, YouTube Music `get_queue`, and the player responses of fixed public videos (an ordinary one, a live stream, a made-for-kids one);
  4. sends the signed-in endpoints signed out, and checks the gateway still reads each answer as "signed out".
- **Q-WATCH-10.** The static watch exits non-zero when red, and writes a JSON artifact. Each miss names its watch-list entry, the features it breaks and the effect, for example "missing the command resolver → add and undo fall back to the service request".
- **Q-WATCH-11.** A run that meets a bot wall or a consent page (common for player requests from CI's datacenter IPs) is **inconclusive** for the checks it blocked, not red.

### 7.5.4 The browser watch

- **Q-WATCH-12.** `tools/watch/browser.ts` runs the built store extension, signed out, with layer 4's drivers, on live YouTube and YouTube Music. It checks:
  - the runtime probes, the navigation and player events, the page reads, and the anchors, on a YouTube channel grid (signed-out home is empty), search, a watch page and a Short, and on YouTube Music's Home, search, an album and a playlist;
  - the theme variables, and our controls' computed styles and positions;
  - end to end, signed out: Add to queue on YouTube; Play next and Add to queue on YouTube Music, confirmed by the queue growing;
  - what only the build shows: registration and injected CSS.
- **Q-WATCH-13.** The browser watch uses a fresh browser profile per theme and a desktop user agent: YouTube ignores `prefers-color-scheme` after the first visit, and treats the `HeadlessChrome` user agent differently.
- **Q-WATCH-14.** The daily browser watch runs in Chromium only. Firefox runs the built extension in the pre-release real-browser check instead: layer 4 in the release's `browser` gate ([REL-CI-27](08-release.md#142-releaseyml)). (R40)

### 7.5.5 Alerting

- **Q-WATCH-15.** When a watch run is red, the `report` job opens one GitHub issue labelled `youtube-change`, or updates it if one is open, listing the misses and the affected features. When both watches are green again, it closes the issue. Three inconclusive days in a row also open the issue.
- **Q-WATCH-16.** A red watch never blocks merging a PR (a YouTube change isn't the PR's fault). It blocks a release, unless that release is the fix: the release gate runs the watch from the release commit's own watch list, so a fix's new needles are what's tested (Q-CI-8).
- **Q-WATCH-17.** GitHub turns off scheduled workflows in a public repo after 60 days without activity. The release checklist confirms that `watch.yml` is enabled and has run on schedule in the last 2 days ([REL-CHK-18](08-release.md#18-release-checklist-releasingmd), [REL-CI-42](08-release.md#144-watchyml)).

### 7.5.6 The signed-in live check and the live-check build

- **Q-WATCH-18.** The live-check build is a separate build target: `wxt build --mode livecheck` (and `-b firefox`), written to `.output/chrome-mv3-livecheck` and `.output/firefox-mv3-livecheck`. It adds:
  - the live-check page, `src/livecheck/`;
  - the **recording** `PagePort` adapter, which wraps the live adapter and captures answers.
- **Q-WATCH-19.** Nothing of the live-check build can reach a store build:
  - the `entrypoints:resolved` hook (`build/livecheck.ts`) drops the livecheck entrypoints in every other mode;
  - the recording adapter sits behind `platform.mode === "livecheck"`, so store builds remove it as dead code;
  - `scripts/check-zip.ts` fails if a store zip contains the live-check page, any `src/livecheck/` code or the recording adapter.
  - The Firefox sources zip keeps `src/livecheck/`, so the sources match the repo; `SOURCE_CODE_REVIEW.md` says what it is ([REL-STORE-32](08-release.md#124-the-bun-and-arm64-build)).
- **Q-WATCH-20.** The live-check page's first version is the probe extension that checked the request routes (`probes/live-checks/` on branch `task/live-checks`), so its checks keep running after 2.0 ships.
- **Q-WATCH-21.** The developer runs the signed-in live check in their own Chrome and Firefox: before every release, hotfixes for our own bugs included (R72), when a watch goes red, and on a user report. It takes a few minutes. It:
  - sends **every job through every shipped route**, forcing each route in turn, which fills the per-job route table (the routes stay **PROVISIONAL** until the first full run, see [06 §6.2.15](06-architecture.md#6215-live-checks-that-settle-the-provisional-rows));
  - checks **quietness:** it watches YouTube's own popup and toast containers during each call;
  - does **real writes** on a private scratch playlist it creates once, using a fixed public video and a fixed public song; it restores likes and removes the queue items it added afterwards;
  - **induces errors:** a duplicate, a made-for-kids video, a deleted playlist;
  - runs the player checks: every reading and marker in the watch list's "YouTube player" row, on the watch player, the miniplayer and the Shorts player;
  - **captures** every job's answers for the fixture import (§7.3.3).
- **Q-WATCH-22.** The live-check build exports a redacted record, `store/live-checks/{version}.json`, holding the extension version, commit, browser and browser version, date, and pass or fail per check, with no values. The release gate reads it ([REL-CI-27](08-release.md#142-releaseyml), `live-check-record`). A patch release may use a `scope: "hotfix"` record that lists only the affected jobs. A fix that affects no YouTube job, such as a bug of our own, still needs a signed-in record: with no affected jobs to list, it runs the full check. No release passes with an empty record. (R72)

### 7.5.7 Runtime breakage signals

The user-facing side is in [04 §5](04-features-accounts-data.md#5-breakage-status): status per feature ([HEALTH-07](04-features-accounts-data.md#52-status)), the notice, the badge, the popup strip and settings' status line ([HEALTH-13](04-features-accounts-data.md#53-where-it-shows) to HEALTH-17), and the wording ([HEALTH-20](04-features-accounts-data.md#54-wording)). Each site's copy is [YT-BRK-06](02-youtube.md#213-when-youtube-changes-something) and [03 §14](03-youtube-music.md#14-failures-and-breakage). This section fixes what raises a signal and the thresholds.

- **Q-WATCH-23.** Signals come from two places and go to one **breakage monitor** in the background: the gateway (routes, answers, page reads) and each feature's drawing code (anchors, theme variables). No feature carries its own breakage logic; each declares its required jobs, optional jobs and anchors in the feature registry, and on YouTube Music the jobs each action needs ([§6.6](06-architecture.md#66-the-feature-registry)). The monitor derives every status from those declarations, one per feature: a YouTube Music feature with some actions unavailable in a tab is *partly working*, and its status detail names those actions ([HEALTH-07](04-features-accounts-data.md#52-status)). Those actions' buttons hide in that tab, but their keys stay caught and answer each press ([YM-KEY-12](03-youtube-music.md#12-keys-quick-action-shortcuts)). (R50, R68)
- **Q-WATCH-24.** These situations raise these signals. The identifiers below are this chapter's, in kebab-case, and [HEALTH-01](04-features-accounts-data.md#51-what-counts-as-breakage) lists them all for users. (R34, R40, R51)

| What happened | What the job does | Signal |
|---|---|---|
| A hook is missing, or throws before sending | Route unavailable: the next shipped route is tried | `missing` or `threw`, with the watch-list ID |
| No answer within the budget | Reads: next route. A write that may have been sent: failed, or unconfirmed. | `timeout`. Makes the job **not working** only after 3 in a row *(starting value)* on that job, while the tab is online and other requests are answered |
| HTTP 400 or 404 to our own request, or 401 or 403 while the page is signed in | Job failed | `rejected` |
| An answer with no recognised shape or `status` | Job failed | `unrecognised`, with the answer's shape outline |
| A recognised answer whose effect never shows (YouTube Music's queue doesn't grow; a moved item isn't where it should be) | Failed | `no-effect`, after 2 in a row *(starting value)* |
| A page anchor is missing where the page clearly has that content | The control isn't drawn | `anchor-missing` |
| A key points at something that looks like a video or song, but no item is recognised there | Nothing is done; the key never falls back to the current video or playing song | `item-unrecognised` |
| Theme variables missing | In-page UI uses the built-in palette, picked by YouTube's dark-mode attribute | `cosmetic` (diagnostics only) |
| Auto-add can't measure a playback (the lengths disagree, for example stitched ads) | That playback isn't counted | `cannot-measure` |
| A route fell back and the job succeeded | Succeeded | `fell-back` (diagnostics only) |
| YouTube or YouTube Music shows its own toast after one of our quiet queue edits (on YouTube, an add or its Undo; on YouTube Music, any queue edit: an insert, a move, a removal, a re-insert, or their Undo) | The edit stands; our own toast for it is suppressed | `quiet-route-noisy`, on both sites: the feature that made the edit is **partly working** (Q-WATCH-28) |
| More than one property of `default_kevlar_base` has the resolver's shape | The first property whose `instance.resolveCommand` is a function is used ([ARC-ACC-13](06-architecture.md#623-the-command-resolver-found-by-shape); R66) | `resolver-ambiguous` (diagnostics only) |
| Signed out, account changed, 429, 5xx, offline, or a recognised `STATUS_FAILED` | As the add and access rules say | none: these aren't breakage |

- **Q-WATCH-25.** **Anchor check.** A feature checks its anchors once the page settles, 3 s after navigation *(starting value)*. It raises `anchor-missing` only when the page shows that kind of content and none of it, or too little, was recognised: at least 6 distinct video links in the main content (not the player, description or comments), with fewer than half of them recognised as cards *(starting values)*. On YouTube Music the same numbers apply to its item links. A YouTube Music player-bar anchor that's missing in the cases [YM-BAR-3](03-youtube-music.md#16-the-player-bar-and-the-wiz-miniplayer) lists (a narrow window, signed out, a new-player bar without its action bar, among others) is not breakage. The users' side is [YT-ITEM-08](02-youtube.md#22-cards-the-current-video-and-the-pointed-at-item), [YM-FAIL-8](03-youtube-music.md#14-failures-and-breakage) and [HEALTH-02](04-features-accounts-data.md#51-what-counts-as-breakage).
- **Q-WATCH-26.** **Key-press self-check.** Before a key falls back from the pointed-at item to the current video or playing song, a markup-independent test asks whether the pointer or focus is on something that looks like an item:
  - YouTube: a link to `/watch?v=` or `/shorts/`, or an element holding exactly one such video link, outside any player (anything inside a player is that player's video);
  - YouTube Music: an ancestor within 6 levels holding exactly one distinct `watch?v=`, `playlist?list=`, `browse/MPRE…` or `browse/VL…` link, or anything inside the queue panel.

  If it says yes but no item was recognised, the key does nothing, the failure toast shows ("Couldn't tell which item you meant. Point at it again, or use the player."), and `item-unrecognised` is raised. The users' side is [YT-ITEM-07](02-youtube.md#22-cards-the-current-video-and-the-pointed-at-item) and [YM-TGT-4](03-youtube-music.md#5-the-playing-song-and-the-pointed-at-item). (R4)
- **Q-WATCH-27.** **Auto-add's "can't measure":** some playbacks unmeasurable makes auto-add partly working; 3 in a row with none measured in between *(starting value)* makes it not working, until the next playback that can be measured.
- **Q-WATCH-28.** **The quiet queue edits:** if YouTube's own toast appears after a quiet YouTube queue edit (the `IAE%3D` value stopped working), or YouTube Music's after any of our queue edits (inserts, moves, removals, re-inserts and their Undo), a `quiet-route-noisy` signal is recorded and the feature that made the edit is *partly working* ([ARC-ACC-34](06-architecture.md#6284-youtubes-queue-quiet-add-confirmation-and-undo), [ARC-ACC-22](06-architecture.md#627-route-table-youtube-music), [YM-FAIL-12](03-youtube-music.md#14-failures-and-breakage)). (R40)
- **Q-WATCH-29.** **Thresholds live in the monitor** as named constants (3 timeouts, 2 no-effects, 3 can't-measure, 3 s settle, 6 links, one half), with a layer-1 test per threshold.
- **Q-WATCH-30.** A tab's status clears when the job next succeeds, or on reload when the probe passes. There's no manual reset ([HEALTH-12](04-features-accounts-data.md#52-status)).

### 7.5.8 What a signal holds

- **Q-WATCH-31.** A signal holds the site, feature, job, route, kind and watch-list ID; a shape outline; YouTube's client version; the page type (watch, Shorts, home, search, YouTube Music browse); and a count with the first and last time seen. It never holds a video, playlist, channel or account ID, a title, a URL or a setting ([HEALTH-03](04-features-accounts-data.md#51-what-counts-as-breakage)).
- **Q-WATCH-32.** A **shape outline** records keys and value types to depth 6, merges array items, and keeps no values. Keys that don't look like schema names become `<key>`. It's capped at 2 KB (uncompressed).
- **Q-WATCH-33.** The monitor keeps signals in `storage.session`: memory only, cleared when the browser closes or the extension updates, reloads or is disabled ([DATA-11](04-features-accounts-data.md#43-storage-layout)). Signals from private tabs stay in memory and never reach any storage area.
- **Q-WATCH-34.** Nothing about breakage ever leaves the browser: no error reporting, analytics or crash upload, opt-in or not. Every fallback and every signal logs one `console.warn` line in the isolated world (route, reason, watch-list ID, with the extension's name as prefix); the page world logs nothing.

---

## 7.6 Performance budgets

### 7.6.1 How the budgets count

- **Q-PERF-1.** **Weight** is the gzip level 9 size of built files. Every weight budget holds for both the Chrome and the Firefox store build (they measured byte for byte the same). Budgets apply to store builds; dev builds aren't checked (their kit exports the whole Svelte namespace, §7.8.1).
- **Q-PERF-2.** **Eager** code loads with the page; **lazy** code loads on first use (the popovers, Diagnostics, the popup's and settings' later parts). Each lazy piece has a weight budget, and the ones a user waits for also have a first-use time budget. The one exception is the first-run page's lazy step 3, which is reported, not gated (Q-PERF-31).
- **Q-PERF-3.** **Time** is main-thread time, net of what the same page costs with nothing of ours injected, measured as the change in the Chrome DevTools Protocol's `Performance.getMetrics` `TaskDuration` across injection plus 400–500 ms of settling, in a fresh page each run. It's measured on the **reference machine** (Ryzen 5 5600X, Chromium 156) at 1× and at 4× CPU throttling; 4× stands in for a slow laptop. Time budgets are gated on Chromium only. Firefox has none of these methods, so it records the same cases with `performance.mark` for information, and is gated on sizes and behaviour (Q-TEST-19). (R31)
- **Q-PERF-4.** In-page CSS ships inside the script (Svelte injects it into our shadow roots), so it counts as JS. Icons are inline SVG paths and count. Fonts cost nothing: in-page UI uses the Roboto and YouTube Sans the site already loads, and bundles none.

### 7.6.2 Off means zero

- **Q-PERF-5.** With every feature on a site off, nothing is registered or injected there: no script in either world, no CSS, no element, no listener, no timer, no request (layer 4, Q-TEST-18 item 1; [FT-15](04-features-accounts-data.md#13-off-costs-nothing)). The YouTube Music section switch off counts as every YouTube Music page entry off, "Also on YouTube Music" included. (R1)
- **Q-PERF-6.** Neither manifest has `content_scripts` or `web_accessible_resources` (`check:manifest` and `check:budget`).
- **Q-PERF-7.** The background only reacts to events: no `setInterval`, and no alarm unless a feature that's on needs a schedule.
- **Q-PERF-8.** With some features on, only their files load, plus what they share: the site's page half and core, and the kit if one of them draws. A switched-off feature's file never loads.
- **Q-PERF-9.** The on-demand probe (for the popup or settings, including the popup's Playing now) is the only code that reaches a page while every feature on that site is off ([FT-16](04-features-accounts-data.md#13-off-costs-nothing), [ARC-MAN-15](06-architecture.md#633-runtime-script-registration)). It runs only when asked, in one tab, draws nothing, and is the page half plus the core, so it has their budgets. Keys from any tab and Save from the browser's menu register nothing either; when used, they inject the page half, core and kit into that one tab, which also have their budgets ([FT-59](04-features-accounts-data.md#13-off-costs-nothing); R88, R91).
- **Q-PERF-10.** Switching a feature off in an open tab removes its elements, styles, listeners, observers and timers at once. Its parsed code stays until the tab reloads, because a browser can't unload a script.
- **Q-PERF-11.** With settings sync off, nothing reads or writes `storage.sync` (layer 3: the fake sync area records zero calls), with exactly two exceptions, which the test allows and each of which has its own layer-3 test ([FT-21](04-features-accounts-data.md#13-off-costs-nothing); R59):
  - at first run, before Agree, one read-only look at the synced copy to pre-tick the features chosen in other browsers; nothing is pushed and the sync switch isn't stored until Agree ([ARC-MSG-12](06-architecture.md#683-ui--background));
  - Clear all data with "Also delete synced settings from all your browsers" ticked.

  The 1.x migration never touches `storage.sync` while sync is off. (R9, R20, R59)

### 7.6.3 In-page weight

Budgets are KB, eager, per page. Each piece counts once per page, however many features use it. The rows are the feature registry's pieces and live in `perf-budget.json` (§7.6.7).

- **Q-PERF-12.** YouTube (`www.youtube.com`), rows set from the measured build (Q-PERF-15). These rows are the authoritative ones; 05 and the other chapters follow them, the watch-page button's 3.5 KB included. (R28, R30, R52)

| File | Contents | Loads while | Budget | Measured, rough build (ticket 14) |
|---|---|---|---|---|
| `page-www.js` (MAIN) | Gateway, route table, parsers, live page adapter, page channel | any www feature is on, or the on-demand probe runs | 5 | 0.69 (a stub gateway; the real one isn't built) |
| `core-www.js` | Site core: links, view, feature host, scope, items, pointer, keys (the undo key included, R2), and the card menu's kit-free notice (about 0.5 KB, R28) | same | 5 | 4.12 (before the notice) |
| `kit-www.js` | Svelte runtime (linked exports), hosts, toaster, overlay, components, YouTube skin, icons | any www feature but the card menu is on | 28 | 27.84 (about 6 % prototype stand-ins) |
| `feature-auto-add.js` | watch tracker, player feed, status | on | 3 | not built |
| `feature-shortcuts-www.js` | bindings and actions (the key listener is in the core) | on | 1 | 0.96 |
| `feature-quick-save.js` | split button | on | 2 | 1.44 |
| `feature-queue-button.js` | queue button | on | 1 | 0.82 |
| `feature-watch-button.js` | the watch-page pill | on | 3.5 | 3.31 |
| `feature-card-menu.js` | `contextmenu` handler, no kit | on | 0.5 | 0.39 |
| **Everything on** | | | **49** (rows sum to 49) | **39.6**, without auto-add and the real gateway |

- **Q-PERF-13.** YouTube Music (`music.youtube.com`), rows set from the measured build (Q-PERF-15). (R1, R30)

| File | Contents | Loads while | Budget | Measured, rough build (ticket 27) |
|---|---|---|---|---|
| `page-music.js` (MAIN) | Gateway, route table, queue-state code, parsers, live adapter | the section switch is on (R1) and any YouTube Music feature, or playlist shortcuts with "Also on YouTube Music", is on; or the on-demand probe runs | 5 | 2.7 (the queue jobs; the playlist jobs weren't built) |
| `core-music.js` | as `core-www.js`, with YouTube Music's items and no card-menu notice | same | 4 | 1.3 (a minimal rough core) |
| `kit-music.js` | as `kit-www.js`, with the YouTube Music skin | same, except the probe | 27 | 26.6 (it also held the controls' components) |
| `feature-music-actions.js` | one hover overlay, availability, actions | on | 5 | 4.6 |
| `feature-music-keys.js` | bindings | on | 1 | not built |
| `feature-shortcuts-music.js` | bindings and actions | on, with "Also on YouTube Music" | 1 | not built |
| **Everything on** | | | **43** (rows sum to 43) | **35.2** |

- **Q-PERF-14.** Lazy, both sites:

| File | Contents | Loads | Budget | Measured, rough builds |
|---|---|---|---|---|
| `popovers.js` | the playlist picker and the watch-page button's menu, with its own Svelte copy and Bits UI; never linked to the kit's Svelte (R29) | on first open, or on hover intent over a Save ▾ or the watch-page pill, by `scripting.executeScript` | 50 | 48.92 (YouTube build, picker only); **54.5, over** (YouTube Music build): Q-PERF-42 applies |

- **Q-PERF-15.** **How the rows were set.** The rough builds put the kit at 27.84 KB (YouTube) and 26.6 KB (YouTube Music) against an 18 KB line: about 72 % of it Svelte's runtime and about 6 % prototype stand-ins, which the real kit drops. The feature files came in far under their rows. So: (R30)
  - **The kit rows** are 28 KB on YouTube and 27 KB on YouTube Music.
  - **The other rows were cut to make room.** A measured piece keeps a little headroom over its rough build. The pieces not built yet keep the most: the real gateways, which replace a stub on YouTube and add the playlist jobs on YouTube Music, and auto-add.
  - **The kit-free notice** (R28) is counted in `core-www.js`.
  - **The site totals don't change:** YouTube 49 KB and YouTube Music 43 KB. On each site the rows add up to the total, so every row passing means the site passes.
  - **Where the rows came from:**

  | Row | Before | Now |
  |---|---|---|
  | `kit-www.js` / `kit-music.js` | 18 / 18 | 28 / 27 |
  | `core-www.js` / `core-music.js` | 8 / 8 | 5 / 4 |
  | `page-music.js` | 7 | 5 |
  | `feature-auto-add.js` | 4 | 3 |
  | `feature-quick-save.js`, `feature-queue-button.js` | 3, 3 | 2, 1 |
  | `feature-watch-button.js` | 5 | 3.5 |
  | `feature-card-menu.js` | 2 | 0.5 |
  | `feature-music-actions.js` | 6 | 5 |
  | `page-www.js`, both shortcut files, `feature-music-keys.js` | 5, 1, 1, 1 | unchanged |

  Once the real gateways and auto-add are built, rows may move again within a site's total (Q-PERF-16).
- **Q-PERF-16.** The site totals, the popup's 40 KB and `popovers.js`'s 50 KB are decided numbers. Rows may be rebalanced within a site total; raising any budget means editing `perf-budget.json` in the same PR, with the reason in the commit message.
- **Q-PERF-17.** YouTube Music's weights are backed by the rough build's measurement (35.2 KB eager). Its **time** budgets are **PROVISIONAL**: they're set by analogy with YouTube and haven't been measured on YouTube Music.
- **Q-PERF-44.** **The decisions of 2026-10-20 change no budget number** ([ticket 24](../issues/24-performance-budget.md); R99):
  - **Four more YouTube Music actions (R85)** add an estimated 1–1.5 KB to `feature-music-actions.js`, four bindings to `feature-music-keys.js`, and the `library` and `navigate` jobs to `page-music.js`. They're rebalanced within YouTube Music's 43 KB (Q-PERF-16). If they still don't fit, their code moves to a lazy file loaded the first time one of them is used. The site total stays 43 KB.
  - **Keys from any tab (R88) and Save from the browser's menu (R91)** have no row: they register nothing, and when used they inject the page half, core and kit, which have rows (Q-PERF-9). Their background code counts toward the background's 25 KB (PROVISIONAL, Q-PERF-31).
  - **Recent adds (R86):** the popup's first view gains only the header button; the sheet is a lazy chunk under the 45 KB lazy budget, expected under 4 KB. The YouTube Music popup's 0.6 KB of headroom is tight, so Q-PERF-32's matching-cut rule applies. Moving copy into `_locales/en/messages.json` (R93), which isn't JavaScript and isn't counted, is expected to cover it.
  - **Save from the browser's menu** adds one row to the popup's YouTube tab; Keys from any tab adds none.
  - **The toolbar tick and "paused" (R92)** are background code only.

### 7.6.4 What keeps pages within budget

- **Q-PERF-18.** One Svelte copy per page: the kit carries the runtime and installs it on the isolated-world global; eager feature files link to it and contain no Svelte runtime. In store builds the kit exports exactly the Svelte names the linked builds import, generated at build time, with property access (some runtime names are reserved words, such as `$.if`).
- **Q-PERF-19.** Bits UI is only in `popovers.js`, which loads on first use (or hover intent), never with the page. Eager in-page UI is plain Svelte with a hand-written site skin.
  - *Runner-up:* eager Bits UI everywhere. Its floating layer costs about 32 KB and 16 ms at 1× (75 ms at 4×) on every page load, for a picker most page views never open.
- **Q-PERF-20.** No Tailwind and no shadcn styles in page scripts. Nothing of ours reaches the page's `<head>` (Tailwind's `@property` rules would).
- **Q-PERF-21.** Page code compiles with `css: "injected"`: no page script emits a `.css` file, and there are no web-accessible resources. The popup, settings and the first-run page keep CSS files.
- **Q-PERF-22.** The toast is hand-written (about 3 KB in the kit), not svelte-sonner (15 KB and 7 ms more at load).
- **Q-PERF-23.** Thumbnail, row, card and queue-item buttons use one moving overlay host per page, never a host per card. The host count per page is constant: one layer host, one overlay host, and one inline host per in-flow control (the watch-page pill, the Shorts button, YouTube Music's header and player-bar Save).
  - Measured with 60 cards: a shadow root per card cost 16.7 / 76.0 ms and left 487 nodes; one overlay cost 11.1 / 51.2 ms and left 26 nodes.
- **Q-PERF-24.** Page code is built as WXT unlisted scripts (a 253 B wrapper), never WXT content scripts (about 3 KB of `ContentScriptContext` per file, plus a page-visible `window.postMessage`).
- **Q-PERF-25.** Nothing of ours polls: no `setInterval`, timer chains, `requestAnimationFrame` loops or polling, and no WXT `wxt:locationchange` (it polls every second on Firefox before 147). Navigation comes from YouTube's and YouTube Music's own navigation events through the gateway's `nav` stream.
- **Q-PERF-26.** Pointer and focus tracking use delegated `pointerover` and `focusin` on the document, never `pointermove`, and read layout only when the pointed-at item changes.
- **Q-PERF-27.** No observer watches the whole document: no `MutationObserver` with `subtree: true` on `document`, `document.documentElement` or `document.body`. An observer watches one container (attribute-only observers, such as the one mirroring `<html dark>` onto our hosts, are allowed). Each handler takes ≤ 1 ms per batch.

### 7.6.5 In-page time

- **Q-PERF-28.** At page load (from injection until settled, real extension, isolated world):

| Case | Budget 1× / 4× | Measured |
|---|---|---|
| Everything on, one site | 18 / 80 ms | stand-in 13.8 / 59.3 ms, without the real site core |
| One drawing feature alone, with core and kit | 15 / 60 ms | Svelte button 11.7 / 47.3 ms |
| The card menu alone (no kit; its notice is the core's, R28) | 8 / 30 ms | 5.7 / 23.6 ms |
| *For comparison: 1.5.0's content script* | | *55.0 / 250.7 ms* |

  - **Longest task:** no task over 50 ms at 1×.
  - **Drawn quickly:** from script start to UI drawn ≤ 20 ms at 1× (the kit's layer drew in 10–14 ms on live YouTube).
- **Q-PERF-29.** At first use:

| Case | Budget | Measured |
|---|---|---|
| `popovers.js` picker, from click to painted, with no hover preload, background awake | 60 / 200 ms | 38.3 / 157.7 ms (budget harness); 96–115 ms at 1× (YouTube rough build, headless); 32–45 ms (YouTube Music rough build) |
| A picker already loaded opens | 32 ms at 1× (two frames) | 13–17 ms (YouTube Music rough build) |

  - The budget is measured without the hover preload, because the picker key opens it with no hover. The preload only makes the common case feel faster. (R29)
  - The time a sleeping service worker or event page takes to wake isn't included and hasn't been measured.
- **Q-PERF-30.** While the page is in use, at 1×:
  - **Idle costs nothing:** five idle seconds with everything on show no script activity of ours. [Q-PERF-46](#768-running-cost) extends this to 60 s, hidden tabs and playback (R101).
  - Auto-add's `timeupdate` handler (about 4 calls a second while playing): ≤ 0.1 ms per call.
  - The key listener, for a key that matches nothing: ≤ 0.1 ms.
  - Pointer and focus tracking: ≤ 0.1 ms per event.
  - In-app navigation, all features together: ≤ 2 ms.
  - Breakage probes: run once per page load and when a feature is about to act, ≤ 1 ms in total.
  - **Per card: constant.** With 24 cards and with 120, we add the same number of elements, shadow roots and listeners.
  - **Memory (PROVISIONAL):** ≤ 500 KB of isolated-world JS heap with everything on (the eager stand-in measured 301–314 KB; 1.5.0 measures 709 KB).

### 7.6.6 Popup, settings, the first-run page and background

- **Q-PERF-31.** Budgets ([05 §5.10](05-ui.md#budgets-and-measurements) states the same for the UI). (R40)

| | Budget | Measured |
|---|---|---|
| **Popup, initial load on YouTube** (what `popup.html` loads before any click) | 40 KB JS + 8 KB CSS | 35.8 + 7.7 KB |
| **Popup, initial load on YouTube Music** (the first view plus the YouTube Music tab chunk, which loads before the first frame there) | 40 KB JS + 8 KB CSS | 39.4 + 7.7 KB (0.6 KB headroom) |
| **Popup, each lazy chunk** | 45 KB | auto-add part 22.2, shortcuts part 5.2, This video's details 4.8, the picker sheet 4.2 |
| **Popup, first frame, cold** (first open in a fresh profile) | 60 / 220 ms | 42 / 151 ms on YouTube, 42 / 144 ms on YouTube Music (development machine, **PROVISIONAL** until measured on the reference machine) |
| **Popup, first frame, warm** (later opens) | 40 / 100 ms | 30.1 / 75.5 ms (switch list, budget harness) |
| **Popup, picker open including its first load** | 50 / 160 ms | 30.1 / 132.8 ms |
| **Settings, initial = the first frame** | 60 KB JS + 10 KB CSS; first frame within 100 ms cold at 1× | 38.8 + 8.5 KB |
| **Settings, each lazy section** (Diagnostics included) | 45 KB | shortcuts 33.5, auto-add 25.9, privacy 11.5 |
| **First-run page, first frame** (`onboarding.html`, in both its views: first run and the upgrade note, R37) | 30 KB JS; its CSS and the lazy step 3 are reported, not gated (R47) | 23.2 + 8.2 KB; step 3 +39.1 KB |
| **Background** (**PROVISIONAL**) | 25 KB, with no UI code | 1.5.0: 7.5 KB |

- **Q-PERF-32.** The popup's budget stays 40 KB on both sites. To keep the YouTube Music popup inside it, banner copy loads only when a banner shows. Any addition to the YouTube Music popup's first view needs a matching cut.
- **Q-PERF-33.** Settings' 60 KB is the first frame only. The shown section's options load right after the first frame, without a click; every other section loads when opened. Each is a lazy section ([UI-SET-06](05-ui.md#frame)).
- **Q-PERF-34.** The popup paints from storage: its first frame needs one `storage.local.get` for everything the first view shows. It never waits on a YouTube tab or the network first.
- **Q-PERF-35.** Extension-page build rules. [05 §5.12](05-ui.md#extension-pages) states them for the UI: rules 1–3 are UI-RULE-14 to UI-RULE-16, rule 5 is UI-RULE-19, rule 6 UI-RULE-20, rule 7 UI-RULE-12 and UI-RULE-21, and rule 8 UI-RULE-21 with 05 §5.11's [UI-RULE-05](05-ui.md#511-accessibility-as-decided). Rule 4 is the popup's [UI-POP-03](05-ui.md#frame-and-first-view), in 05 §5.2.
  1. Each extension page (popup, settings, the first-run page) is built on its own, or the popup gets its own build. A multi-page build shares chunks and put about 10 KB of settings-only Svelte runtime into the popup.
  2. Each page's first view is one chunk (Rolldown `codeSplitting.groups` with `tags: ["$initial"]`). Code-split groups never import each other: a cycle let the HTML run the wrong chunk first and the page rendered blank.
  3. No top-level `await` in an entry whose chunk lazy chunks import: the first-view chunk waited on a lazy chunk that waited on it, and the page rendered blank.
  4. Nothing lazy is modulepreloaded from the page's HTML.
  5. First-view icons are inline path data; the mark is the packaged SVG in an `<img>`; Lucide's components appear only in lazy parts.
  6. Two stylesheets per page: the first view's, and one that loads with the lazy parts. They share Tailwind's layers by name.
  7. Class helpers: `cn` is `clsx` only (no `tailwind-merge`); Button's variants are a lookup; `tailwind-variants/lite` is used only in components no first view uses. Callers add only margins and layout (Q-TEST-31).
  8. Switch and tabs are hand-written; Bits UI is used only for what floats or traps focus (popover, dialog, checkbox, slider, radio).

  Rules 1–3 are what Q-TEST-18 item 10 and the size check guard; the rest are reviewed.

### 7.6.7 Enforcement

- **Q-PERF-36.** `perf-budget.json` at the repo root holds every weight and time budget above, per browser build, keyed by the feature registry's IDs and the library names (`page`, `core`, `kit`, `popovers`). It holds only numbers: which files make up each piece, which features draw, and each feature's site come from the feature registry, the same one the background uses to register scripts, so the check and the extension can't disagree. The `registry` guard (Q-TEST-30) fails if the file's pieces and the registry's differ.
- **Q-PERF-37.** `scripts/check-budget.ts` (`check:budget`) gzips every built file at level 9 and checks:
  - each piece;
  - each feature alone, with its page half, core and kit;
  - each site with everything on;
  - each lazy chunk, including `popovers.js`;
  - the popup's initial load on each site (Q-PERF-31), settings' first frame and the first-run page's first frame, found by following each HTML's scripts and modulepreloads and each chunk's static imports. (R40)
- **Q-PERF-38.** `check:budget` also fails if:
  - a manifest has `content_scripts` or `web_accessible_resources`;
  - a page script emits a `.css` file;
  - a page file other than `kit-www.js`, `kit-music.js` and `popovers.js` contains Svelte's runtime;
  - a file other than `popovers.js` contains Bits UI;
  - a feature file contains kit code instead of linking to it.
- **Q-PERF-39.** `check:budget` writes a table of every checked size, with the change from `main`, to the job summary (`$GITHUB_STEP_SUMMARY`), and fails on any overrun. Bytes are deterministic, so this gate is hard and never flakes.
- **Q-PERF-40.** The timing test is part of layer 4 (Q-TEST-18 item 9). With everything on it measures load time, script start to UI drawn, heap, the longest task, five idle seconds, the per-card comparison (24 vs 120 cards) and per-event costs (synthetic `timeupdate`, key and pointer events). It also measures each feature alone, the card menu alone, the picker's first open with no hover preload, and the popup's and settings' first frames (navigation start to the first frame after mount, at a 340 px viewport, as a real `chrome-extension://` page; window creation isn't included). The gated figures come from Chromium; Firefox's `performance.mark` figures are reported beside them (Q-TEST-19). (R29, R31)
- **Q-PERF-41.** **Time is a soft gate, on Chromium.** In CI the timing test runs unthrottled in Chromium, takes the median of 10 runs, and fails only above 1.5× a budget; heap is gated the same way. Before each release the developer runs it at 1× and 4× on the reference machine and records the figures in the release PR ([REL-CHK-20](08-release.md#18-release-checklist-releasingmd)): Chromium's must be within budget, and Firefox's `performance.mark` figures are recorded for information only. (R31)
  - *Runner-up:* hard time gates in CI. They'd make builds flaky on shared runners.
- **Q-PERF-42.** **The picker-overrun rule.** `popovers.js` must meet its 50 KB and its first-open time budget, measured with no hover preload, on both sites. If a store build overruns either:
  1. first, trim the picker's use of Bits UI;
  2. if it still overruns, replace Bits UI in the picker with the browser's Popover API, hand-written positioning and a hand-written listbox (the floating part estimated at about 5 KB).

  `popovers.js` is never linked to the kit's Svelte runtime (ADR-0008, [ARC-MOD-18](06-architecture.md#674-lazy-popovers)): that would make the eager kit export the Svelte names Bits UI needs on every page. The hover-intent preload stays in either case. (R29)
- **Q-PERF-43.** **Real pages.** The fixture pages could flatter us, so the same measurements are also run on a real signed-in YouTube home page and watch page. **PROVISIONAL:** the rough build measured only signed out; the signed-in run is still owed.

### 7.6.8 Running cost

§7.6.5 budgets what a page pays when our code loads. This section budgets what 2.0 costs while it runs, with everything on: in YouTube's and YouTube Music's pages, in the background, in storage and on the network. The rules are [ADR-0012](../../../docs/adr/0012-automatic-work-is-event-driven-scoped-and-paced.md)'s. The evidence and measurements are in [`docs/research/running-costs.md`](../../../docs/research/running-costs.md) ([ticket 33](../issues/33-resource-mindful-defaults.md)). (R100, R101)

- **Q-PERF-45. How running cost counts.**
  - **Our time** is main-thread time in our scripts. In Chromium it's read from a trace: script, timer and observer callbacks attributed to `chrome-extension://<id>/` URLs, with the layout and style work they cause. Long Animation Frames can't be used, because it doesn't attribute isolated-world code. In Firefox it's the Firefox Profiler's `moz-extension` samples, for information.
  - A **wake** is a start of the service worker (Chrome) or event page (Firefox). A **write** is one `set`, `remove` or `clear` call. A **message** is one `runtime.sendMessage` or `tabs.sendMessage`.
  - **Counts** (wakes, writes, messages, timers, records, requests) are exact, and gated in both browsers. **Times** are the reference machine's at 1×, gated in Chromium as Q-PERF-41 says.
  - Per-minute figures are medians over a scenario's runs.
- **Q-PERF-46. Idle costs nothing.** With everything on, a page left alone for 60 s, visible or hidden, with nothing playing, shows no script time, timer, animation frame, idle callback, observer callback, message or storage call of ours, and the background doesn't wake. This extends Q-PERF-30's five idle seconds. (R101)
- **Q-PERF-47. Playback.** On a watch page playing a video, with everything on and auto-add counting it, per minute of playback:

| Case | Our main-thread time, 1× | Timers of ours fired | Messages to the background | Storage writes |
|---|---|---|---|---|
| Visible | ≤ 30 ms | 0 | ≤ 1 | ≤ 1 |
| Hidden behind another tab | ≤ 30 ms | 0 | ≤ 1 | ≤ 1 |
| Every goal reached, or auto-add off | ≤ 2 ms | 0 | 0 | 0 |

  - Messages and writes average about one every 5 minutes while a video simply plays ([DATA-27](04-features-accounts-data.md#46-watch-progress)).
  - *For scale:* YouTube itself spent about 1,070 ms of main-thread time a minute on a watch page while it played visible (258 ms of it script), and about 585 ms hidden. A stand-in tracker took 7–18 ms a minute, visible or hidden, so 30 ms leaves room for the page-world reads and the crossing it didn't have, and stays under 3 % of YouTube's own visible cost ([ticket 33](../issues/33-resource-mindful-defaults.md)). (R101)
- **Q-PERF-48. No long task of ours.** No task that runs our code takes 50 ms or more at 1×, at load or later. One callback of ours in a page (an event handler, observer callback, message handler or timer) takes at most 5 ms at 1×. Longer work is cut into pieces of at most 5 ms that yield in between, with `scheduler.yield()` where it exists (Chrome 129+, Firefox 142+) and a 0 ms timeout elsewhere, and it stops while the tab is hidden. (R101)
- **Q-PERF-49. Observers,** beyond Q-PERF-27:
  - an observer is connected only on the page types its feature acts on, and disconnects while the tab is hidden;
  - attribute observers name their attributes (`attributeFilter`);
  - no subtree observer on the app root (`ytd-app`, `ytmusic-app`) either, which is the whole page in practice. The YouTube Music rough build had one, re-syncing its header and player-bar controls on every change: it was the only work of ours while nothing was clicked, about 6–7 ms a minute during playback;
  - an observer watches a container's own children (`childList` without `subtree`) unless it must go deeper. On a channel grid, a scroll that loaded 30 more cards gave the grid container's own children 2–3 records, a whole-document child-list observer about 177, and about 470 with attributes. Our observers together receive at most 10 records a minute during steady playback and at most 20 per page of cards loaded *(starting values)*;
  - a ResizeObserver watches only our own hosts or one anchor, and resize and scroll work runs at most once per animation frame ([UI-RULE-44](05-ui.md#page-ui-youtube-and-youtube-music)). (R101, R115)
- **Q-PERF-50. Hidden tabs.** In a hidden tab only auto-add's counting runs, while a video it counts plays ([FT-62](04-features-accounts-data.md#13-off-costs-nothing)). No layout read, DOM write, observer, anchor check or toast timer of ours runs there. A hidden tab playing nothing shows no activity of ours at all. (R104)
- **Q-PERF-51. Background wakes:**

| Situation | Wakes allowed |
|---|---|
| Nothing happens on YouTube or YouTube Music: no page loads, no input, nothing playing with auto-add on | 0 |
| Anything in a tab of another site | 0 |
| A YouTube or YouTube Music page load | ≤ 1 (`tab.hello`) |
| An in-app navigation | 0, or 1 to clear that tab's toolbar tick ([ARC-MOD-38](06-architecture.md#643-background-srcbackground)) |
| A minute of playback with auto-add on | ≤ 1, and about 0.2 while a video simply plays |
| A user action: a click, key, popup open, browser-menu click or command | What the action needs |

  (R105, R110)
- **Q-PERF-52. Work per wake.** A routine wake (`tab.hello`, a progress save, signals) makes at most 2 storage reads before it handles its event and at most 1 write, and no `scripting` call when the desired set hasn't changed ([ARC-MOD-37](06-architecture.md#643-background-srcbackground)). It handles its event within 10 ms of background time at 1×, not counting the browser's own start of the worker. A cold start measured about 25 ms from message to answer (23–41 ms), against 1.4 ms warm. (R109)
- **Q-PERF-53. Background timers and alarms:** no interval, no alarm, and one-shot follow-ups only, each at most 25 s ([ARC-MOD-39](06-architecture.md#643-background-srcbackground)). (R103)
- **Q-PERF-54. Storage:**

| Area | Allowed |
|---|---|
| `storage.local` | Idle: no write. Playback with auto-add on: at most 1 write a minute per playing tab, and none when nothing new was played ([DATA-27](04-features-accounts-data.md#46-watch-progress)). A progress save rewrites one shard ([DATA-56](04-features-accounts-data.md#46-watch-progress)): writing a 57 KB record blocked the caller for about 4 ms and took 12 ms to land, against 0.1 ms and 1 ms for a 147-byte key. Every other write follows a user action or an outcome, and only when the value changed ([DATA-57](04-features-accounts-data.md#45-caches-and-expiry)) |
| `storage.session` | At most 1 write per page load (the tab registry), and at most 1 every 10 s for signals ([HEALTH-28](04-features-accounts-data.md#51-what-counts-as-breakage)) |
| `storage.sync` | Only after a local change to a synced document: one `set()` per push, so at most 12 a minute ([SYNC-06, SYNC-27](04-features-accounts-data.md#32-the-local-copy-comes-first)) |

  - No page script registers `storage.onChanged`, for any area: every listening context gets its own copy of every change, content scripts in every tab included. In a burst of 20 writes of a 57 KB record, each of three listening tabs spent 144–223 ms of main-thread time, against under 3 ms for a 147-byte key.
  - The background listens only to `storage.sync.onChanged` (SYNC-27). Extension pages listen to `storage.local.onChanged` and skip progress, cache and registry keys. (R108)
- **Q-PERF-55. Requests nobody asked for.** 2.0 sends a request to YouTube or YouTube Music only for a user action, with these exceptions, each bounded:
  1. auto-add, when a goal is reached: one membership read for every due playlist, then the adds ([YT-ADD-06](02-youtube.md#251-order-and-membership)), at most once per playlist per playback;
  2. the account label check: at most once per account per 24 h ([ACC-18](04-features-accounts-data.md#23-which-account-is-shown));
  3. claiming the unclaimed 1.x setup: one playlist-list read per account, at most once per browser session ([ACC-46](04-features-accounts-data.md#26-the-unclaimed-setup-and-claiming));
  4. automatic gathering into a playlist, if the user picks it ([ticket 31](../issues/31-gathertube.md)), within Q-PERF-58.

  Nothing else fetches by itself: no prefetch, no cache refreshed on a timer, nothing read from YouTube to keep something current. Refreshing a stale list when a view opens follows the user's open (ARC-ACC-43). (R116)
- **Q-PERF-56. Memory.**
  - In a page, Q-PERF-30's 500 KB of isolated-world heap still holds after 30 minutes with 500 cards scrolled past. The in-page prototype held about 115–135 KB of its own on a watch page ([ticket 33](../issues/33-resource-mindful-defaults.md)). Per-item state is capped ([UI-RULE-44](05-ui.md#page-ui-youtube-and-youtube-music)), and the tracker holds only the current video.
  - The background holds nothing between wakes that it can't rebuild from storage. `storage.session` stays under 1 MB: at most 200 tabs in the registry ([ARC-ACC-70](06-architecture.md#6211-serving-tab-routing)), 200 signals ([HEALTH-28](04-features-accounts-data.md#51-what-counts-as-breakage)) and 50 recent adds (R86).
  - `storage.local` stays under 5 MB, half of Chrome's 10 MB, with progress capped by [DATA-26](04-features-accounts-data.md#46-watch-progress). (R101)
- **Q-PERF-57. Tabs that need nothing.** Automatic work never wakes, reloads, activates, injects into or messages a discarded or frozen tab, and never touches a tab of another site. Injecting into several open tabs goes one tab at a time ([ARC-MAN-22](06-architecture.md#633-runtime-script-registration), [ARC-ACC-56](06-architecture.md#6211-serving-tab-routing)). (R104, R109)
- **Q-PERF-58. Automatic triggers.** Any automatic option, ticket 31's automatic gathering first, meets these before it's accepted, whichever trigger the user picks. (R117)
  1. **Events only.** No alarm, interval or timer that checks tabs. A condition over time, such as "left unvisited for an hour", is evaluated when something else already wakes the background (a YouTube tab's `tab.hello`, the popup opening, the browser starting), from `Tab.lastAccessed`.
  2. **No browser-wide listener,** and no new permission with an install warning: no `tabs.on*` or `windows.on*` listener in either browser, and no `webNavigation`. New YouTube tabs are learnt from our own page code in them: the site core's `tab.hello` says whether the page started hidden. While the option is on, that's all the page code it loads.
  3. **Reads tabs, never wakes them.** It reads only the tabs' own fields, through `tabs.query({ windowId, url })` with host access: URL, title, index, `lastAccessed` and `discarded`. That's all GatherTube's sort orders use. It never messages, injects into, activates, reloads or un-discards a gathered tab.
  4. **One gather per burst.** Tabs that arrive together are gathered once, after a quiet second with no new one (a one-shot timer, ARC-MOD-39), and at most once a minute per window *(starting values)*.
  5. **Bounded requests.** Into YouTube's queue: no request of ours, because it opens YouTube's own `watch_videos` page. Into a playlist: through the add flow, from one serving tab, never a request per gathered tab.
  6. **Closing is one call:** one `tabs.remove` with every gathered ID.
  7. **Off costs nothing:** while the option is off, it has no listener, permission, page code, storage key or timer of its own.
  8. **Budget:** with 50 YouTube tabs in the window, a gather takes at most 20 ms of background time at 1×, not counting the request. It adds no wake beyond the `tab.hello` each new YouTube tab already sends, and none for tabs of other sites.

  Closing a window fails rules 2 and 3: by then the browser reports only the window's ID, so every YouTube tab's URL would have to be tracked all along, and nothing can be sent while the browser quits.

**Enforcement**

- **Q-PERF-59. Guards:** the `running-cost` guard ([Q-TEST-46](#726-guard-tests)) runs in every `bun test` run. (R102)
- **Q-PERF-60. `check:runtime`** (`scripts/check-runtime.ts`), the size check's sibling, reads both store builds and fails if:
  - any built file calls `setInterval` or the `alarms` API;
  - the built background's `addListener` calls aren't exactly [ARC-MOD-39](06-architecture.md#643-background-srcbackground)'s list;
  - any built file, dependencies included, listens to `tabs.on*`, `windows.on*`, `webNavigation` or `menus.onShown`, or calls `menus.refresh`;
  - a page file registers `storage.onChanged` for any area.

  It's deterministic, so it's a hard gate, like `check:budget` (Q-CI-19). (R102)
- **Q-PERF-61. Soaks:** layer 3's ([Q-TEST-47](#724-layer-3-fake-browser-and-dom)) on every push, and layer 4's ([Q-TEST-48](#725-layer-4-real-browser)) on every PR and release. (R102)
- **Q-PERF-62. Gates:** counts are hard gates in both browsers, because they don't depend on the machine. Times are gated at 1.5× in Chromium CI and checked exactly on the reference machine before each release, as Q-PERF-41 says. (R102)
- **Q-PERF-63. The release check** ([REL-CHK-27](08-release.md#18-release-checklist-releasingmd)). `RELEASING.md` scripts a 15-minute session, signed in, with the store build on the reference machine:
  - one YouTube tab playing a long video that auto-add counts, hidden behind a second YouTube tab on a channel grid; one YouTube Music tab playing, hidden;
  - after 5 minutes: the popup opened twice, two saves by key, one feature switched off and on again; then 10 minutes untouched.

  Chrome: Task Manager's CPU time, Idle wake ups and Memory footprint for the extension and each tab, read at the start and the end, with the worker's DevTools closed (they keep it alive). Firefox: a Firefox Profiler capture of the session, filtered to `moz-extension`. The same session then runs with the extension disabled. The release PR gets the table. Budgets, as *starting values*: each YouTube or YouTube Music tab's CPU time at most 5 % above the run without the extension (Q-PERF-47's 30 ms a minute is under 3 % of YouTube's own), its memory footprint at most 5 MB above, and the extension's own row at most 2 s of CPU time over the session. A figure over budget blocks the tag. A figure over 1.5× the previous release's is explained in the PR before tagging. (R102)
- **Q-PERF-64. Firefox's slow-extension warning.** The live-check build's page listens to `runtime.onPerformanceWarning` (Firefox 124+) during its run, and fails the run if it fires: Firefox fires it, and tells the user "… is slowing down Firefox", when a content script hangs. Store builds don't listen. (R102)

---

## 7.7 CI jobs and the hotfix lane

### 7.7.1 `ci.yml`

- **Q-CI-1.** `ci.yml` runs on every push and PR with these jobs:

| Job | Steps |
|---|---|
| `check` | `setup-bun` from `packageManager` → `bun install --frozen-lockfile` → `typecheck` → `test:coverage` (guards included) → check that the Bun version in `SOURCE_CODE_REVIEW.md` and in the `build-for-amo` script equals `packageManager`'s |
| `build` | `build` and `build:firefox` → `check:manifest` on both → `check:manifest --report-against <last release tag>` (report only: writes any manifest difference from the last release to the job summary) → `check:budget` (table to the job summary) → upload both `.output` folders |
| `browser` | needs `build` → `playwright install --with-deps chromium` and Puppeteer's Firefox → `test:browser` in both, with axe-core (Q-TEST-20), and timings gated at 1.5× in Chromium only (R31, R38) |
| `sources` | pushes to `main` only, on `ubuntu-24.04-arm`: builds the Firefox sources zip and rebuilds it as `SOURCE_CODE_REVIEW.md` says, on Node 24, so ARM64 drift shows before a release |

- **Q-CI-2.** The old `broker` job goes with `server/`, and the Vitest and `jq` checks go, replaced by `check` and `build`.
- **Q-CI-3.** `check:manifest` (`scripts/check-manifest.ts`) fails unless each built manifest has exactly:
  - **both:** `manifest_version` 3; `permissions` `["storage", "scripting"]`; no `content_scripts`; no `web_accessible_resources`; `commands` holding `_execute_action` and keys from any tab's three commands, none with a `suggested_key` (R88); `optional_permissions` exactly `["contextMenus"]` (R91); `default_locale` `"en"` (R93); no `update_url` unless the build mode is `beta`, whose Firefox build carries exactly the beta `update_url` ([REL-CI-10](08-release.md#71-firefox)); `version` equal to `package.json`'s;
  - **Chrome:** `host_permissions` `["https://www.youtube.com/*"]`; `optional_host_permissions` `["https://music.youtube.com/*"]`; `minimum_chrome_version` `"121"`;
  - **Firefox:** `host_permissions` `["*://*.youtube.com/*"]`; `browser_specific_settings.gecko.id` `{cc70cd21-2cc6-444b-bd89-496909346091}`; `strict_min_version` `"140.0"`; `data_collection_permissions` `{ "required": ["none"] }` (R83; [08 §13](08-release.md#13-if-an-amo-reviewer-objects) keeps a fallback ready if an AMO reviewer objects).

  The full manifest outline is [06 §6.3.1](06-architecture.md#631-manifest-per-browser) (ARC-MAN-01); `check:manifest` asserts it. [REL-CI-20](08-release.md#141-ciyml) states the same rules for the release.
- **Q-CI-19.** The `build` job runs `check:runtime` ([Q-PERF-60](#768-running-cost)) on both store builds right after `check:budget`, and fails on any finding. `release.yml`'s `budget` gate runs it too, on the release's own artifacts (Q-CI-6). (R102)

### 7.7.2 `watch.yml`

- **Q-CI-4.** `watch.yml` is triggered by a daily schedule, by `workflow_dispatch`, and by `workflow_call` (so the release workflow can run it as a gate). Its jobs:
  - `static`: `watch:static`, uploading the JSON artifact;
  - `browser-watch`: runs `tools/watch/browser.ts` against a store build. On the schedule and on demand it builds one. Called from `release.yml`, it downloads the release's own artifacts and doesn't rebuild, so it tests what ships (Q-CI-6; R61);
  - `report`: needs both, has `issues: write`, and opens, updates or closes the one `youtube-change` issue (Q-WATCH-15).
- **Q-CI-5.** Each watch job ends green, red or inconclusive (Q-WATCH-11), and the run summary says which and why.

### 7.7.3 Release gates (summary)

`release.yml` is specified in [08 §14.2](08-release.md#142-releaseyml), with its gate table in [REL-CI-27](08-release.md#142-releaseyml). The gates this chapter defines are:

- **Q-CI-6.** Every gate runs on the exact files that ship: `release.yml` builds once and every gate downloads those artifacts ([REL-CI-26](08-release.md#142-releaseyml)).
- **Q-CI-7.** `budget`: `check:budget` on the store builds. `zip`: `check:zip` (Q-WATCH-19). `browser`: layer 4 on the store builds, in Chromium and Firefox, with timings gated at 1.5× in Chromium only, as in `ci.yml` (Q-PERF-41); this is Firefox's pre-release real-browser check (Q-WATCH-14). `manifest`: `check:manifest`. (R31, R40)
- **Q-CI-8.** `watch`: `watch.yml` through `workflow_call`, from the release commit's watch list, with `browser-watch` on the release's artifacts (Q-CI-4; R61). `static` must be green and `browser-watch` green or inconclusive. A red `static` passes only with the `allow_red_watch` input and a reason, which the summary records.
- **Q-CI-9.** `live-check-record`: `store/live-checks/{version}.json` exists, covers Chrome and Firefox, has no failures, and is dated within 7 days of the tag (a `scope: "hotfix"` record for patch releases). Every release needs one, hotfixes for our own bugs included, and an empty record never passes (Q-WATCH-22; R72).
- **Q-CI-18.** Not a gate, but a release step: before each release the developer does a manual screen-reader pass of the popup and settings, as an item in the release checklist ([UI-RULE-41](05-ui.md#511-accessibility-as-decided), [08 §18](08-release.md#18-release-checklist-releasingmd)). The automated checks are Q-TEST-20. (R38)

### 7.7.4 The hotfix lane

The hotfix lane is the fast way to ship a fix. Its usual case is "YouTube changed something", but it takes any fix, our own bugs included (R62). Fixes reach users only as store releases: there is no remote configuration, selector list, endpoint map, experiment flag or kill switch, and nothing fetched changes behaviour. Every fallback ships in the package.

- **Q-CI-10.** A hotfix is a branch `hotfix/X.Y.Z` from the last release tag. CI runs on its PRs as usual.
- **Q-CI-11.** A hotfix changes only what the fix needs: for a YouTube change, the broken route, parser or anchor, plus its fixtures and watch-list entry; for a bug of our own, the faulty code and its tests. (R62)
  - It changes no permission, disclosure, consent version or data schema, and no user-visible behaviour beyond the fix.
  - No dependency bumps and no refactors. (Chrome reviews significant code changes more closely, and AMO's queue ranks by the size of the change.)
- **Q-CI-12.** A hotfix is a patch version bump, and only hotfixes are patch releases.
- **Q-CI-13.** `hotfix-freeze` ([REL-CI-38](08-release.md#143-the-hotfix-lane)) runs for every patch release and fails unless:
  - `check:manifest --against v{previous}` finds both manifests identical to the previous release's apart from `version`, reading the old manifests from that release's GitHub Release assets;
  - `git diff --quiet {previous tag} -- store/listing store/cws-dashboard.md store/notes/reviewer-full.md site/privacy` passes;
  - the consent version constant is unchanged;
  - the storage layout version the build writes (`schema`, [DATA-46](04-features-accounts-data.md#410-schema-versions-and-migrations)) is unchanged. (R62)
- **Q-CI-14.** A hotfix's gates are `bun test`, the static watch green with the fix's new needles (if it has any), and a hotfix-scope live-check record for the affected jobs in both browsers, plus the usual release gates. A fix of our own that affects no YouTube job still runs the signed-in live check, in full (Q-WATCH-22; R72).
- **Q-CI-15.** A hotfix is submitted to both stores in one run, through the per-store switches. Chrome publishes on approval (`DEFAULT_PUBLISH`, never `skipReview`, which Chrome's API v2 allows only for declarativeNetRequest-only updates). The reviewer notes use the hotfix template ([REL-STORE-22](08-release.md#121-reviewer-notes-approval_notes)).
  - **During the 2.0.0 soak** the Chrome item is staged by hand. A Chrome resubmission then is done by hand in the dashboard, as Public with staged publishing, not by the run ([08 §18](08-release.md#18-release-checklist-releasingmd), "The 2.0 launch, once"). (R21)
- **Q-CI-16.** Afterwards the version is commented on the issue it fixes, the `youtube-change` issue for a YouTube change ("Firefox users get it within about a day; Chrome users after review"), and the branch is merged back to `main` ([REL-CI-41](08-release.md#143-the-hotfix-lane)).
- **Q-CI-17.** A release that itself breaks something is rolled back in the store dashboards first, then fixed forward. 2.0.0 on AMO is the exception: it's fixed forward. The rollback rules are [REL-CHK-05](08-release.md#83-rollback-and-fix-forward) to REL-CHK-10.

---

## 7.8 Developer workflow

### 7.8.1 Dev builds

- **Q-TOOL-30.** In dev builds the kit exports the whole Svelte namespace instead of the generated list, so any feature can link while code changes (a dev kit measured 44.9 KB). Budgets apply only to store builds.
- **Q-TOOL-31.** Any rough or prototype build used to measure in-page cost uses the real registrar and runtime registration, never a static content script, so its numbers match production.
- **Q-TOOL-32.** `vite dev` for the extension pages needs `svelte` excluded from SSR pre-bundling (vite-plugin-svelte 7 with Rolldown 1.2 breaks otherwise).

### 7.8.2 Reloads with runtime-registered scripts

Page scripts aren't manifest content scripts, so WXT's dev mode doesn't know to refresh them in open tabs. 2.0 relies on its own update path instead.

- **Q-TOOL-33.** A rebuild needs no manual tab reload. Reloading the extension takes the same path as a store update: dynamic registrations are cleared, the background's start-up reconcile registers them again and injects the current files into open YouTube and YouTube Music tabs, and the new core's `ppt:retire` makes the old core and gateway in those tabs dispose themselves. An orphaned core also disposes itself the first time `browser.runtime.id` is gone. There is no separate dev-only reload mechanism.
- **Q-TOOL-36.** Both browsers are known to clear registrations on every update. That reloading an unpacked or temporary extension does the same is verified while the project is scaffolded, in both browsers, before feature work starts; layer 4's update test (Q-TEST-18 item 5) settles the store-update case. If a dev reload behaves differently, the finding is recorded here and tabs are reloaded by hand until a fix lands. (R40)

### 7.8.3 The test compile cache

- **Q-TOOL-34.** Under `--isolate`, the Svelte plugin recompiles every `.svelte` file each test file imports, including Bits UI's (about 1.7 s for one Bits UI file in the spike; the whole spike suite took about 2 s). Until a cache exists, Bits UI tests stay few and grouped (Q-TEST-13).
- **Q-TOOL-35.** Once the whole `bun test` suite takes more than 60 s, the plugin gains an on-disk compile cache keyed by a hash of the source text, the Svelte version and the compile options, kept under `node_modules/.cache/`. (R40)

---

## 7.9 Not decided

Every item that was listed here has been settled; see [Resolved during assembly](#resolved-during-assembly). PROVISIONAL marks that wait on the signed-in live checks or the name stay where they are. AMO's reply no longer waits: R83 settled it.

---

## Conflicts found

### Still open

None remain after all three rounds of resolutions (R1–R40, R41–R67, then R68–R77); see [Resolved during assembly](#resolved-during-assembly). Where the topic is this chapter's own (budgets, test placement and breakage-signal identifiers), the other chapters follow this one. Live checks and the name stay PROVISIONAL where they're marked; R83 settled AMO's reply.

### Resolved during assembly

From "Not decided":
- Accessibility testing: axe-core in layer 4 for the popup, settings, the first-run page and the in-page hosts, a reduced-motion check (Q-TEST-20), and a manual screen-reader pass before release (Q-CI-18): R38.
- The kit's rebalanced rows (Q-PERF-12, Q-PERF-13, Q-PERF-15): R30.
- The signal kind for YouTube's own toast after a quiet queue edit is `quiet-route-noisy` (Q-WATCH-24, Q-WATCH-28): R40.
- The browser watch runs daily in Chromium only; Firefox runs in the pre-release real-browser check (Q-WATCH-14): R40.
- The `$state` identity guard is a CI check, lint or test as the build chooses (Q-TEST-33): R40.
- The test compile cache comes once the suite takes more than 60 s (Q-TOOL-35): R40.
- The first-run page's budget is 30 KB for the first frame (Q-PERF-31): R40.
- The first-run page's 30 KB counts JavaScript; its CSS is reported, not gated (Q-PERF-31): R47.

From "Conflicts found":
- The kit's row against its measured size: rows set to 28 and 27 KB, the other rows cut, totals unchanged (Q-PERF-15): R30.
- Linking `popovers.js` to the kit is rejected; the fix is to trim Bits UI, then use the Popover API (Q-PERF-42): R29.
- The picker's first-open budget measures the no-preload case (Q-PERF-29): R29.
- Timing on Firefox: time is gated on Chromium only; Firefox gates sizes and behaviour and records `performance.mark` timings (Q-PERF-3, Q-PERF-41, Q-TEST-19): R31.
- The card menu's "not working" notice is kit-free, in the site core, so "card menu alone" needs no exception (Q-TEST-18 item 2, Q-PERF-28): R28.
- 08's release checklist (was Still open 1): §18 and [REL-CHK-20](08-release.md#18-release-checklist-releasingmd) gate Chromium's timings and record Firefox's, and the checklist has the manual screen-reader pass (Q-PERF-41, Q-CI-18): R31, R38.
- Signal identifiers in 04 (was Still open 3): [HEALTH-01](04-features-accounts-data.md#51-what-counts-as-breakage) now uses this chapter's kebab-case identifiers and lists them all, `fell-back`, `quiet-route-noisy` on both sites and `resolver-ambiguous` included (Q-WATCH-24): R51.
- Who checks that built pages render (was Still open 4): a real-browser test (Q-TEST-18 item 10), as [UI-RULE-17](05-ui.md#extension-pages) now says: R52.
- The watch-page button's eager row (was Still open 5): 3.5 KB, in [05 §5.10](05-ui.md#budgets-and-measurements) too (Q-PERF-12): R52.
- Status per action on YouTube Music (was Still open 6): status stays per feature, and a feature with some actions unavailable is *partly working*, its status detail naming them (Q-WATCH-23): R50.
- The browser watch called from `release.yml` tests the release's own artifacts and doesn't rebuild (Q-CI-4, Q-CI-8), as [REL-CI-42](08-release.md#144-watchyml) now says: R61.
- The hotfix lane takes any fix, our own bugs included, within R62's limits (§7.7.4, Q-CI-11, Q-CI-13), as [REL-CI-38](08-release.md#143-the-hotfix-lane) and REL-CI-39 now say: R62.
- `storage.sync` while sync is off: exactly two calls are allowed, and the test allows them (Q-PERF-11): R59.
- An ambiguous resolver uses the first property whose `resolveCommand` is a function (Q-WATCH-24): R66.

Also applied here: R43 (what counts as a run: Q-TEST-2) and R64 (the upgrade-or-fresh-install check: Q-TEST-2).

Third round:
- **Chrome hotfixes during the soak** (was Still open 1): [REL-CI-34](08-release.md#142-releaseyml) and [REL-CI-40](08-release.md#143-the-hotfix-lane) now carry Q-CI-15's exception: during the 2.0.0 soak, a Chrome resubmission is done by hand in the dashboard, as Public with staged publishing (R21). Fixed in 08.
- **The live-check record for a fix of our own** (08's Not pinned down): every release needs a signed-in record, hotfixes for our own bugs included; a fix that affects no YouTube job runs the full check, and no empty record passes (Q-WATCH-21, Q-WATCH-22, Q-CI-9, Q-CI-14): R72.
- **The upgrade view's budget and first-view test** (08's Not pinned down): the first-run page's 30 KB and its first-view render test cover both its views, first run and the upgrade note, because they're one page (Q-PERF-31, Q-TEST-18 item 10; R37, R40, R47). Fixed in 07.
- **The upgrade snapshots' path** (08's Not pinned down): `src/background/store/fixtures/1.4.5-S{n}.json`, beside the store module that runs the migrations (Q-FIX-12), as [REL-CHK-16](08-release.md#173-fixtures-signed-paths-and-chrome) now says. Fixed in 07 and 08.
- **Script names** (08's Not pinned down): `build:beta`, `zip`, `zip:firefox` and `zip:beta` are in Q-TOOL-16's table, and `web-ext` is a dependency (Q-TOOL-19), for 08's beta build ([REL-CI-10](08-release.md#71-firefox)), zips ([REL-CI-25](08-release.md#142-releaseyml)) and beta signing ([REL-CI-32](08-release.md#142-releaseyml)). Fixed in 07.
- **`quiet-route-noisy` on YouTube Music** covers every queue edit there, moves and re-inserts included, as [ARC-ACC-22](06-architecture.md#627-route-table-youtube-music) and [YM-FAIL-12](03-youtube-music.md#14-failures-and-breakage) say (Q-WATCH-24, Q-WATCH-28). Fixed in 07.
- **When the monitor's signals are cleared** matches [DATA-11](04-features-accounts-data.md#43-storage-layout): when the browser closes or the extension updates, reloads or is disabled (Q-WATCH-33). Fixed in 07.
- **Links into 05 and within this chapter:** Q-PERF-35 now links UI-POP-03's and UI-RULE-05's own sections, and Q-TEST-18 item 9 links Q-PERF-41's. Fixed in 07; [05's Conflicts found](05-ui.md#conflicts-found) raised the first.

Also applied, third round: R68 (an unavailable action's keys stay caught and answer: Q-WATCH-23) and R72 (Q-WATCH-21, Q-WATCH-22, Q-CI-9, Q-CI-14). The other third-round resolutions don't touch this chapter's topics.

After the spec ([R83](resolutions.md#after-the-spec-firefox-prompts-and-data-collection-r83)):
- **Firefox's `data_collection_permissions`** (was PROVISIONAL on AMO's reply, ticket 23): `{ "required": ["none"] }` is settled, and `check:manifest` asserts it (Q-CI-3). [08 §13](08-release.md#13-if-an-amo-reviewer-objects) keeps the fallback if an AMO reviewer objects: R83.

The user's decisions of 2026-10-20 ([R84–R99](resolutions.md#the-users-decisions-of-2026-10-20-r84r99)):
- **Budgets:** no number changes; how each decision fits is Q-PERF-44, and Q-PERF-9 covers injection on use (R99).
- **Tests and fixtures** for the new features, the untick and the toolbar marks: Q-TEST-45 and Q-FIX-5's new row (R84 to R92).
- **Ready for translation:** Q-TEST-44 (R93).

R94 to R98 change nothing this chapter states.
