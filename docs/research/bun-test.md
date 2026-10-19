# Can `bun test` cover a WXT extension?

Research for [ticket 04](../../.scratch/rebuild/issues/04-bun-test.md) of the 2.0 rebuild, 2026-10-19.
Versions: Bun 1.4.0 (what `packageManager` pins) and 1.4.3 (latest), WXT 0.21.4, happy-dom 20.14.5, React 19.3.0, @testing-library/react 16.3.3, user-event 14.6.7, jest-dom 7.0.1, @webext-core/fake-browser 2.0.1.
The spike is in [`bun-test-spike/`](bun-test-spike/); its results are [at the end](#spike).

## Answer

**Yes, it's viable.** `bun test` runs WXT code, `browser.*` against WXT's own fake, and React 19 components through happy-dom and Testing Library. The spike did this with three short preload files and a `bunfig.toml`. Every spike test passed on Bun 1.4.3. On 1.4.0, the Firefox run passed only with the transpiler cache off (see section 4). WXT doesn't help, though: its only test integration is the Vitest plugin, and it closed the one Bun request as "won't fix" ([WXT #1150][wxt-1150]). Its docs say any other runner needs auto-imports turned off, the aliases set up and the extension API mocked by hand ([WXT: unit testing][wxt-unit]). Each of those is small under Bun:

| WXT feature | Under `bun test` |
|---|---|
| `@/`, `~/` aliases | Already work: Bun reads tsconfig `paths` ([Bun: module resolution][bun-resolution]). |
| `browser` / `chrome` | A preload puts `fakeBrowser` on both globals and resets it before each test. |
| `import.meta.env.BROWSER/FIREFOX/...` | `[define]` in bunfig. Use one bunfig per browser. |
| `#imports` | Not resolvable without a plugin. A short `Bun.plugin` `build.module("#imports")` shim works, but it's simpler to import from the real paths instead. |
| Auto-imports | Not resolvable without a plugin. They work only by calling WXT internals and unimport from a runtime `onLoad` hook. Turn them off instead. |
| DOM, React, Testing Library | happy-dom's `GlobalRegistrator` in a preload, jest-dom matchers through `expect.extend`, and RTL cleanup registered in a preload. |
| Module mocks | `mock.module` works, but it is process-wide and outlives its test file unless you run with `--isolate`. |
| Coverage | Built in: lines and functions (no branches), and only for files a test actually loaded. |

**Recommended setup for 2.0**

- Bun **1.4.3 or later**. 1.4.0 reuses stale transpiled files when `define` changes, so the second browser run tests the first browser's code. It also has fake-timer and `--isolate` bugs fixed in 1.4.3 ([Bun 1.4.1][bun-141], [Bun 1.4.3][bun-143]).
- A root `bunfig.toml` with:
  - `[define]` for the WXT globals;
  - `[test] preload` for happy-dom, the fake browser and Testing Library (the spike's [`setup/`](bun-test-spike/setup/));
  - the coverage reporters and ignore patterns.
- A `bunfig.firefox.toml` with the Firefox values, if per-browser runs survive (see constraint 3).
- `bun test --isolate` as the test script, so module and global state can't leak between files.
- A `matchers.d.ts` for the jest-dom types.
- Dev dependencies: add `@happy-dom/global-registrator`; drop `vitest`, `@vitest/coverage-v8`, `@vitejs/plugin-react` (if only tests used it) and `fake-indexeddb` (if nothing uses IndexedDB).

**Design constraints this puts on 2.0**

1. **WXT stays at the edges.** Only entrypoints (`defineBackground`, `defineContentScript`, `createShadowRootUi`, `injectScript`) touch WXT's runtime helpers. Everything worth testing is plain TypeScript that gets its collaborators (storage, messaging, the YouTube client, the clock) passed in.
2. **No auto-imports, and real import paths.** Set `imports: false` in `wxt.config.ts`. Import `browser` from `wxt/browser`, `storage` from `wxt/utils/storage`, and so on. These are the paths `#imports` expands to anyway, and WXT says you don't have to use `#imports` ([WXT blog: `#imports`][wxt-imports-blog]). Tests then need no resolver plugin. The cost is that WXT promises `#imports` won't break when import paths move in a future major, and the real paths carry no such promise. If 2.0 wants `#imports` anyway, the spike's shim works.
3. **Read `import.meta.env` in one place.** Have one small `platform` module read `import.meta.env.FIREFOX` and friends, as literal member expressions. Logic that differs per browser takes the platform as a parameter, so one run can test both browsers' behaviour. Bun replaces only literal `import.meta.env.X` expressions: a destructured or indirect read gets `process.env`, where `FIREFOX=false` is the truthy string `"false"` (spike, and [Bun: environment variables][bun-env]). If the build relies on per-browser dead-code removal, check that it still happens across that module boundary.
4. **Inject dependencies instead of mocking modules.** `mock.module` patches a module for the rest of the process. `mock.restore()` doesn't undo it ([Bun: mocks][bun-mocks]). If the module was already loaded, exports the factory leaves out stay real. Use it only for third-party edges, and run with `--isolate`.
5. **Write the tests in `bun:test`, not Vitest.** Bun turns `import … from "vitest"` into `bun:test` (observed). Its `vi`, though, has none of `vi.mocked`, `vi.stubGlobal`, `vi.hoisted`, `vi.waitFor` or `vi.advanceTimersByTimeAsync` ([bun-types `test.d.ts`][bun-test-dts]), and its mock factories get no `importOriginal`. Those were the only failures left when 1.x's suite ran isolated (spike step 11).
6. **Expect the fake to have gaps.** `fakeBrowser` implements storage (all four areas), runtime, tabs, windows, alarms, notifications, action and part of webNavigation. Everything else throws `MockNotImplementedError`, including `commands`, `contextMenus`, `scripting`, `permissions` and `identity` ([fake-browser docs][fake-apis], package source). 2.0's shortcut and context-menu code needs its own fakes, or has to sit behind a port.

**What can't work**

- **Anything that needs the build.** Vite and WXT plugins don't run under `bun test`:
  - CSS imports load as `{}`, and `?inline` CSS is `{}` instead of a string;
  - `import.meta.glob` is `undefined`;
  - Tailwind isn't applied;
  - `injectScript("/yt-queue-bridge.js")` and `createShadowRootUi` CSS loading expect built output.

  These belong in entrypoints, or in browser-level tests.
- **Real YouTube.** happy-dom isn't Chrome or Firefox, and nothing here loads the extension into a browser. Catching YouTube changes (ticket 18) needs a different tool.
- **WXT's own help.** `WxtVitest` is Vitest-only, and WXT won't add a Bun equivalent ([WXT #1150][wxt-1150]). Getting auto-imports to work means importing WXT internals: `registerWxt` from `wxt/dist/core/wxt.mjs` is outside the package's `exports` and has no types.
- **Branch coverage and coverage of unloaded files.** Bun reports `% Funcs` and `% Lines` only, and only for loaded files ([Bun: coverage][bun-coverage]).

## Detail

### 1. Why `bun test` fails today

Under `bun test`, today's `src/lib/storage.test.ts` dies before any test runs: `Cannot find package '#imports' from '…/src/lib/storage.ts'` (spike step 0). Nothing in Bun knows WXT's virtual module.

`WxtVitest()` is what makes WXT code testable under Vitest. In 0.21.4 it calls `registerWxt("serve")` and returns five Vite plugins (`node_modules/wxt/dist/testing/wxt-vitest-plugin.mjs`; [source][wxt-vitest-src]):

- `globals`: `define`s `import.meta.env.{MANIFEST_VERSION, BROWSER, CHROME, FIREFOX, SAFARI, EDGE, OPERA, COMMAND}` from the config (`core/utils/globals.mjs`).
- `tsconfigPaths`: sets Vite `resolve.alias` from WXT's aliases.
- `resolveAppConfig`: serves `virtual:app-config` from `<srcDir>/app.config.ts`, or `export default {}` when there is none.
- `extensionApiMock`: aliases `wxt/browser` to a module exporting `fakeBrowser`, and adds a setup file that does `vi.stubGlobal("chrome", fakeBrowser)` and `vi.stubGlobal("browser", fakeBrowser)`.
- `UnimportPlugin.vite(wxt.config.imports)`: the auto-import transform, which also rewrites `#imports`, since WXT's config sets `virtualImports: ["#imports"]` (`core/resolve-config.mjs`).

The sections below rebuild each of these for Bun.

### 2. Aliases (`@/`)

Bun resolves imports through `compilerOptions.paths` in `tsconfig.json`, and supports Node-style `#` subpath imports from `package.json` ([Bun: module resolution][bun-resolution]). The root `tsconfig.json` already maps `@`, `@/*`, `~` and `~/*` to `./src`, so `@/lib/storage` resolved with no setup. That held in the spike even for modules outside the current directory. `mock.module("@/lib/storage", …)` resolves the alias the same way, and replaced the module for `src/config.ts`, which imports it as `@/lib/storage` (spike, `isolation/a-mocks.test.ts`). The docs say mock specifiers resolve like an `import` ([Bun: mocks][bun-mocks]).

### 3. `#imports` and auto-imports

`#imports` doesn't exist on disk. WXT's unimport transform splits `import { a, b } from "#imports"` into imports from each real module ([WXT blog: `#imports`][wxt-imports-blog]).

- **A runtime `onResolve` hook can't catch it.** bun-types documents that plugin hooks "only match when the import specifier contains a "." or a ":"" (`Bun.plugin` in [`bun.d.ts`][bun-dts]), and `#imports` has neither. The spike confirmed it: `onResolve({ filter: /^#imports$/ })` was never called.
- **`build.module("#imports", …)` works.** It's Bun's virtual-module API ([`bun.d.ts`][bun-dts]). The spike's [`setup/wxt.ts`](bun-test-spike/setup/wxt.ts) generates the module from the `.wxt/types/imports-module.d.ts` that `wxt prepare` writes: one `export * from "<resolved path>"` per listed module. `export *` carries only values, so the type-only names drop out. Two costs showed up:
  - Re-exporting everything loads `wxt/utils/app-config`, which imports WXT's other virtual module, `virtual:app-config`, so that needed a shim too.
  - Every module in WXT's auto-import directories gets loaded and appears in coverage at about 0% (step 9 first showed `ChannelCard.tsx`, `SettingsPanel.tsx` and the rest).
- **Auto-imports** (`storage`, `browser`, `defineBackground` and React hooks used with no import line) fail with `ReferenceError: storage is not defined` (step 5).
  - unimport's unplugin has a Bun adapter, but it's written for `Bun.build`. It calls `build.onStart`, which a runtime plugin lacks (`TypeError: build.onStart is not a function`; `node_modules/unplugin/dist/index.mjs`, `getBunPlugin`).
  - Calling unimport from a runtime `onLoad` hook does work ([`setup/wxt-unimport.ts`](bun-test-spike/setup/wxt-unimport.ts), step 6). It also rewrites `#imports`. It needs WXT's resolved `imports` config, and the only way to get that is the internal `registerWxt`/`wxt` from `wxt/dist/core/wxt.mjs`. That file is outside the package's `exports`, has no types, and costs about 0.4 s per process: 20 ms for the explicit-imports file against roughly 450 ms with this preload. Under `--isolate` the preload re-runs for every file, so the 1.x suite took about 6–8 s isolated, against 4.8 s for Vitest.
- **Explicit imports need none of this.** [`fixtures/explicit.ts`](bun-test-spike/fixtures/explicit.ts) imports `wxt/browser` and `wxt/utils/storage` directly, and its test passes with nothing but the fake-browser preload (step 4). WXT documents `imports: false`, and says you can keep importing from the submodules ([WXT: auto-imports][wxt-auto], [WXT blog][wxt-imports-blog]).

### 4. `import.meta.env` and per-browser values

Bun treats `import.meta.env` as an alias of `process.env` ([Bun: environment variables][bun-env], [Bun: module resolution][bun-resolution]). So with no setup, `import.meta.env.FIREFOX` is `undefined`, and setting `FIREFOX=false` in the shell makes it the string `"false"`, which is truthy (spike). Vitest has the same trap: `vitest.config.ts` works around it with its own transform, because WxtVitest's `define` is dropped under Vitest.

- **Bun's `define` does it natively.** bunfig's `[define]` replaces identifiers at parse time ([Bun: bunfig][bun-bunfig]), and works on `import.meta.env.X`. The values come out as real booleans and numbers, in test files, `src/` modules and modules outside the working directory (spike `env.test.ts`). It replaces literal member expressions only: `const { FIREFOX } = import.meta.env` still reads `process.env`.
- **Per-browser runs.** Use one bunfig per browser, selected with `bun test --config=bunfig.firefox.toml`. `--config`/`-c` is a global Bun flag (`bun --help`).
  - A command-line `--define` **replaces** the whole bunfig `[define]` table instead of merging with it: with `--define import.meta.env.FIREFOX:true`, `MANIFEST_VERSION` became `undefined` (observed).
  - In-file switches work too: `test.if(import.meta.env.FIREFOX)`.
- **Bun 1.4.0's transpiler cache ignores `define`.**
  - Bun caches the transpiled output of files over 4 KB ([Bun: environment variables][bun-env], `BUN_RUNTIME_TRANSPILER_CACHE_PATH`).
  - On 1.4.0, a Chrome run followed by a Firefox run reused the Chrome build of `src/lib/auth.ts` (7 KB). The Firefox test got `https://test-extension-id.chromiumapp.org/`, and running Firefox first broke the Chrome test the same way (steps 2 and 3 of [`run.sh`](bun-test-spike/run.sh)).
  - `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0` avoids it. 1.4.1 fixed it ("could reuse stale cached output for a file of 4 KiB or more after a bunfig `[define]` … value changed", [Bun 1.4.1][bun-141]), and on 1.4.3 both orders pass.
- **`.env` files.** Bun loads `.env`, `.env.test` and their `.local` variants from the working directory ([Bun: environment variables][bun-env]). WXT's per-browser `.env.firefox` files ([WXT: environment variables][wxt-env]) are not read.

### 5. The fake `browser`

- **`fakeBrowser` works with any runner.** `wxt/testing/fake-browser` re-exports `@webext-core/fake-browser`, a plain in-memory implementation with no test-framework dependency. Its package description reads "Supports all test frameworks". `fakeBrowser.reset()` clears every implemented API.
- **It must be installed in a preload.** `wxt/browser` is `@wxt-dev/browser`, which reads `globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome` once, when it is first evaluated (`node_modules/@wxt-dev/browser/src/index.mjs`). `@wxt-dev/storage` imports that same module. So a preload has to set both globals before any test file imports them. [`setup/fake-browser.ts`](bun-test-spike/setup/fake-browser.ts) does that and resets the fake in a preload-level `beforeEach`, which ran before every test in every file (observed; preload hooks are global, [Bun: test configuration][bun-config], [Bun: parallel & isolated runs][bun-parallel]).
- **The error from WXT #1150 is gone.** That issue failed with "This script should only be loaded in a browser extension", which is `webextension-polyfill`'s check, from WXT 0.19. In 0.21, `wxt/browser` is `@wxt-dev/browser`, whose whole source is the line above, so there is no such check.
- **What's real and what isn't.** `storage` (local, sync, session, managed, plus `onChanged`), `runtime` (`sendMessage` reaches `onMessage` in the same context), `tabs`, `windows`, `alarms`, `notifications`, `action` and part of `webNavigation` are in-memory. Everything else throws `MockNotImplementedError: <api> not implemented: mock the function yourself…` ([fake-browser docs][fake-apis]; `dist/src-*.mjs`). That includes `commands`, `contextMenus`, `scripting`, `permissions`, `identity` and `i18n`.
- **Fake-specific quirks.** After `reset()` no window is focused, so `tabs.query({ currentWindow: true })` throws inside the fake. `windows.update(id, { focused: true })` doesn't set focus. Only `windows.create({ focused: true })` does (spike `explicit-imports.test.ts`). `storage.sync.getBytesInUse` throws, and quotas aren't modelled, which matters for ticket 16's sync design.

### 6. DOM tests: happy-dom, Testing Library, React 19

- **Bun's documented setup works.** It's `@happy-dom/global-registrator` in a preload, plus a Testing Library preload that does `expect.extend(matchers)` from `@testing-library/jest-dom/matchers` ([Bun: DOM testing][bun-dom], [Bun: Testing Library guide][bun-rtl]).
  - `GlobalRegistrator.register()` copies a happy-dom `GlobalWindow`'s properties onto `globalThis` ([happy-dom wiki][happydom-reg]; `lib/GlobalRegistrator.js`).
  - The spike passes `{ url: "https://www.youtube.com/watch?v=…" }` so `location` looks like YouTube.
- **The real 1.x `ThemeProvider` renders.** It's React 19.3 with Base UI. The spike's tests render it, click through `userEvent`, wait with `waitFor`, spy on a storage item with `spyOn` and assert with jest-dom: 4 of 4 pass, with no `act(...)` warnings (`theme-provider.test.tsx`).
- **Preload order matters.** happy-dom must register before anything imports `@testing-library/*`. The Bun guide says to use separate preloads, or `await import()` after `register()` ([Bun: Testing Library guide][bun-rtl]).
- **RTL cleanup has to be in the preload.** The Bun guide calls it optional; in practice it isn't.
  - bun:test's globals (`afterEach`, `beforeAll`, `jest`, …) resolve as bare identifiers in every module, node_modules included, but aren't properties of `globalThis` (observed). So RTL's own `if (typeof afterEach === "function") afterEach(cleanup)` and `IS_REACT_ACT_ENVIRONMENT` setup do run (`@testing-library/react/dist/index.js`).
  - In the default shared registry, though, RTL is evaluated once, so its `afterEach` belongs to whichever test file imported RTL first. In the spike, the next file's tests failed with `Found multiple elements by: [data-testid="resolved"]`; they passed with `--isolate`, or with cleanup registered in a preload.
- **jest-dom types.** A `matchers.d.ts` augmenting `bun:test`'s `Matchers` adds them ([Bun: Testing Library guide][bun-rtl]). `bun run compile` passes with the spike files included.
- **Global stubs.** There's no `vi.stubGlobal`. Assign, and restore in `afterEach`, as the spike does for `window.matchMedia`.
- **If ticket 13 picks another UI stack,** this section's React parts change. The happy-dom and fake-browser parts don't.

### 7. Module mocking and isolation

- **`mock.module` is not scoped to a test file.** `mock.module(specifier, factory)` replaces a module "even if it has already been imported", and updates live bindings. `mock.restore()` "does not reset modules overridden with `mock.module()`" ([Bun: mocks][bun-mocks]).
- **It isn't hoisted** like Vitest's `vi.mock`. Static imports above it have already run their side effects; the docs recommend a preload for mocks that must prevent them ([Bun: mocks][bun-mocks]).
- **On an already-loaded module it patches.** The factory's exports overwrite the existing ones, and the rest stay real: after mocking `@/lib/storage` with only `authServerURL`, `store.playlists` was still the real item. The `mock.module` type docs say an export that didn't exist before "is not added to existing import statements" (bun-types [`test.d.ts`][bun-test-dts]).
- **Leaks across files** (steps 7–8). `isolation/a-mocks.test.ts` mocks `../fixtures/greeting` and `@/lib/storage`, then calls `mock.restore()`. With the default shared registry, `b-real.test.ts` still sees `"mocked"` and `"https://broker.example/"`. With `--isolate`, or `--parallel`, which implies it, both pass.
  - `--isolate` gives each file a new global and clears the ESM and CommonJS registries, then re-runs the preloads ([Bun: parallel & isolated runs][bun-parallel]).
  - It costs about 70 ms a file for the spike's preloads: 0.37–0.40 s shared against 0.78 s isolated for 6 files on 1.4.3.
  - bunfig has no `isolate` key, so it goes in the `test` script.
- **`spyOn` and `mock()` functions** are restored by `mock.restore()` ([Bun: mocks][bun-mocks]). The spike calls it in `afterEach` to stand in for Vitest's `restoreMocks: true`.

### 8. Fake timers

`jest.useFakeTimers()` / `vi.useFakeTimers()` drive `setTimeout`, `setInterval` and `Date` ([Bun: dates and times][bun-dates]).

- **They work with happy-dom registered** (`timers.test.ts`). Bun doesn't replace the timer globals; `globalThis.setTimeout` is the same function before and after `useFakeTimers()` (observed).
- **Testing Library's `waitFor` advances the fake clock itself** ([Bun 1.4][bun-14]). A component whose timer fires at 1000 ms resolved at 1001 ms of fake time, while the whole file took about 0.3 s of real time.
- **1.4.3 fixed a hang** where "`advanceTimersByTime()` and `runOnlyPendingTimers()` never returned" ([Bun 1.4.3][bun-143]). The spike didn't hit it on 1.4.0.
- **Missing:** `advanceTimersByTimeAsync`. Four 1.x tests used it (step 11).

### 9. Coverage

- **Built in.** `bun test --coverage` with `coverageReporter = ["text", "lcov"]` writes `coverage/lcov.info` ([Bun: coverage][bun-coverage]). The spike's table is in step 9.
- **Limits** ([Bun: coverage][bun-coverage]):
  - only `% Funcs` and `% Lines`, no branches;
  - only files some test loaded, with no equivalent of Vitest's `coverage.include` for listing untested files;
  - `coverageThreshold` is enforced only when the `text` reporter is on (outside `--parallel`);
  - Bun accepts a `statements` threshold but ignores it.
- **What shows up in the report:**
  - the preload files;
  - virtual modules (`#imports`, `virtual:app-config`);
  - with the eager `#imports` shim, every auto-import directory.

  Use `coveragePathIgnorePatterns`, for example for the setup files and vendored `src/components/ui/**`.
- **Fixed in 1.4.3:** "`bun test --coverage` counted only the last load of a file loaded more than once", which matters under `--isolate`. 1.4.3 also made `--coverage-reporter=lcov` imply `--coverage` ([Bun 1.4.3][bun-143]).

### 10. 1.x's Vitest suite, unchanged, under `bun test`

As a stress test, the spike ran today's 16 Chrome test files (`src/`, 371 tests) without editing them.

- **Setup:** [`bunfig.compat.toml`](bun-test-spike/bunfig.compat.toml) loads:
  - the same preloads;
  - the unimport plugin;
  - `fake-indexeddb/auto`;
  - a 29-line [`vitest-compat.ts`](bun-test-spike/setup/vitest-compat.ts) adding `vi.mocked` and `vi.stubGlobal` and an `afterEach(mock.restore)`.
- **Shared registry:** 279 pass, 92 fail. The failures come from `vi.mock` factories leaking into later files, for example `store.accessToken.removeValue is not a function`.
- **`--isolate`:** 360 pass, 11 fail, and `options/App.test.tsx` errors before its tests run (2 errors on 1.4.0, 1 on 1.4.3). All of these are Vitest-only APIs: `vi.waitFor` (6), `vi.advanceTimersByTimeAsync` (4), and `importOriginal` in a `vi.mock` factory (the error). For comparison, Vitest runs 421 tests across 18 files in 4.8 s. The 50 not run here are in the Firefox and `server/` files.

So the runner itself blocked none of 1.x's tests. What's left is Vitest-specific API use, and the module-mock style that constraint 4 retires.

### 11. Type checking

The project typechecks with `@types/bun` (TS 7 picks `bun-types/ts7.1`). WXT's `.wxt/types/globals.d.ts` types `import.meta.env.FIREFOX` as `boolean`, and that coexists with Bun's types (`bun run compile` passes with the spike files in the tree).

bun:test's `toEqual(expected: T)` takes the type of the received value. Inline, `expect(await fakeBrowser.storage.sync.get("x")).toEqual({...})` makes tsc pick the wrong `get` overload. Reading into a variable first fixes it. Vitest's looser typing accepts the inline form.

## Spike

Everything is in [`bun-test-spike/`](bun-test-spike/). None of it touches the project's real setup: Vitest only collects `src/**` and `server/**`, and Bun reads a `bunfig.toml` only from the working directory. The one extra dependency was added for the runs and not committed.

| File | What it shows |
|---|---|
| `bunfig.toml`, `bunfig.firefox.toml` | The Chrome and Firefox configs: `[define]` plus preloads |
| `bunfig.minimal.toml` | Explicit imports need only the fake-browser preload |
| `bunfig.parity.toml`, `setup/wxt-unimport.ts`, `parity/` | Auto-imports through unimport as a runtime `onLoad` plugin |
| `bunfig.isolation.toml`, `isolation/` | `mock.module` leaking across files, and `--isolate` fixing it |
| `bunfig.compat.toml`, `setup/vitest-compat.ts` | 1.x's Vitest files, unchanged |
| `setup/happydom.ts`, `setup/fake-browser.ts`, `setup/wxt.ts`, `setup/testing-library.ts` | The preloads (`wxt.ts` adds the `#imports` shim) |
| `env.test.ts`, `storage.test.ts`, `auth.test.ts`, `theme-provider.test.tsx`, `timers.test.ts`, `explicit-imports.test.ts` | Tests, most against real 1.x modules |
| `bunfig.probes.toml`, `probes/` | Assertions behind the "observed" claims: plugin hooks, `vitest` imports, test globals, `define`, CSS and assets |
| `run.sh` | Runs every experiment below (steps 0–12) and prints a summary |

To reproduce from the repo root:

```sh
bun install
bun add -d @happy-dom/global-registrator@20.14.5   # don't commit
sh docs/research/bun-test-spike/run.sh
git checkout -- package.json bun.lock
```

Output on Bun 1.4.0 (condensed):

```
### 0. Baseline: today's storage test, no setup (from the repo root)
error: Cannot find package '#imports' from '…/src/lib/storage.ts'
 0 pass / 1 fail
### 1. Chrome: bunfig.toml
 14 pass / 1 skip / 0 fail     Ran 15 tests across 6 files. [533.00ms]
### 2. Firefox: bunfig.firefox.toml, transpiler cache warm from run 1
Expected: "http://127.0.0.1/mozoauth2/35b64b676900f491c00e7f618d43f7040e88422e"
Received: "https://test-extension-id.chromiumapp.org/"
(fail) getRedirectURI > Firefox build: the loopback form
 13 pass / 1 skip / 1 fail
### 3. Firefox, transpiler cache off
 14 pass / 1 skip / 0 fail
### 4. Explicit imports, fake-browser preload only
 2 pass / 0 fail               Ran 2 tests across 1 file. [20.00ms]
### 5. Auto-imports without the unimport preload
ReferenceError: storage is not defined
 0 pass / 1 fail
### 6. Auto-imports with WXT's unimport config as a runtime plugin
 4 pass / 0 fail
### 7. mock.module across files: shared registry (default)
Expected: "hello"                      Received: "mocked"
Expected: ""                           Received: "https://broker.example/"
 2 pass / 2 fail
### 8. mock.module across files: --isolate
 4 pass / 0 fail
### 9. Coverage
File                                        | % Funcs | % Lines | Uncovered Line #s
All files                                   |   27.44 |   44.28 |
 #imports                                   |  100.00 |  100.00 |
 setup/wxt.ts                               |  100.00 |   96.55 |
 ../../../src/components/theme-provider.tsx |   86.67 |  100.00 |
 ../../../src/lib/auth.ts                   |    9.09 |    9.92 | 27-28,35-41,45,…
 ../../../src/lib/storage.ts                |    0.00 |   93.15 | 177-181
### 10. Today's unchanged Vitest files (src/, Chrome), shared registry
 279 pass / 92 fail / 2 errors   Ran 371 tests across 16 files. [4.83s]
### 11. Same, --isolate
 360 pass / 11 fail / 2 errors   Ran 371 tests across 16 files. [8.16s]
  vi.waitFor is not a function (6) · vi.advanceTimersByTimeAsync is not a function (4)
  importOriginal is not a function (options/App.test.tsx)
```

On Bun 1.4.3, everything matched except:

- step 2 passes (14 pass, 0 fail), since 1.4.1 fixed the cache;
- step 10 has 1 error instead of 2;
- step 11 has 1 error and took 5.90 s.

Step 12 (`probes/`, 7 tests) passes on both versions. Each test asserts one claim:

- **Runtime `onResolve` isn't called for a bare specifier;** `build.module()` serves one.
- **Imports from `vitest` in a test file come back as `bun:test`,** and `vi` has no `mocked`, `stubGlobal`, `hoisted`, `waitFor` or `advanceTimersByTimeAsync`.
- **Test globals resolve as bare identifiers in a non-test module** (`typeof afterEach === "function"`), but `globalThis.afterEach` is `undefined`.
- **`define` doesn't replace destructured or indirect reads** of `import.meta.env`.
- **CSS and asset imports.** `import "…/tailwind.css"` gives `{}`, `?inline` gives `{}`, `?raw` gives the text, and a `.png` import gives its absolute path. `import.meta.glob` is `undefined`.

Other runs, not scripted:

- The lean suite took 0.37–0.40 s shared, 0.78 s with `--isolate` and 0.48–0.50 s with `--parallel` (12 workers) on 1.4.3.
- With happy-dom registered, `jest.useFakeTimers()` leaves `globalThis.setTimeout` the same function, and RTL's `waitFor` resolved a 1000 ms timer at 1001 ms of fake time.
- Without the explicit preload cleanup, `theme-provider.test.tsx` passed alone and failed after another RTL-importing file ("Found multiple elements"). It passed again with `--isolate`.

## Sources

Bun docs are cited from the copy shipped in `node_modules/bun-types/docs` (bun-types 1.4.2), which is the source of the pages at bun.com/docs.

**Bun**

- Docs: [Mocks][bun-mocks], [DOM testing][bun-dom], [Testing Library guide][bun-rtl], [Test configuration][bun-config], [Parallel & isolated runs][bun-parallel], [Code coverage][bun-coverage], [Dates and times][bun-dates], [bunfig.toml][bun-bunfig], [Module resolution][bun-resolution], [Environment variables][bun-env].
- Type docs: [`bun.d.ts`][bun-dts] (`Bun.plugin`, `PluginBuilder.module`) and [`test.d.ts`][bun-test-dts] (`mock.module`, `vi`).
- Release notes:
  - [Bun 1.4][bun-14]: `--isolate`, `--parallel`, fake timers and `waitFor`.
  - [Bun 1.4.1][bun-141]: the stale transpiler cache after a `[define]` change.
  - [Bun 1.4.3][bun-143]: the fake-timer hang, and the `--isolate` and coverage fixes.
- `bun --help` and `bun test --help` from the 1.4.0 binary.

**WXT**

- Docs: [Unit testing][wxt-unit] ("Other Testing Frameworks"), [Auto-imports][wxt-auto], [Environment variables][wxt-env], and the [`#imports` blog post][wxt-imports-blog].
- Source: [`wxt-vitest-plugin.ts`][wxt-vitest-src]. I read it as 0.21.4's `dist/testing/wxt-vitest-plugin.mjs`, along with:
  - `dist/core/builders/vite/plugins/{globals,tsconfigPaths,resolveAppConfig,extensionApiMock}.mjs`;
  - `dist/core/utils/globals.mjs`;
  - `dist/core/resolve-config.mjs`;
  - `dist/builtin-modules/unimport.mjs`.
- Issue [#1150][wxt-1150], "Running tests using Bun fails": closed as not planned and labelled wontfix.
- `@wxt-dev/browser@0.2.7` `src/index.mjs`, read in `node_modules`.

**Others**

- @webext-core/fake-browser: [Implemented APIs][fake-apis], plus the 2.0.1 `dist/` source.
- happy-dom: [Global Registrator wiki page][happydom-reg], plus `@happy-dom/global-registrator@20.14.5` `lib/GlobalRegistrator.js`.
- Read in `node_modules`:
  - `@testing-library/react@16.3.3` `dist/index.js` (auto-cleanup and the act environment);
  - `unimport@6.4.0` `dist/unplugin.mjs`;
  - `unplugin@3.3.0` `dist/index.mjs` (`getBunPlugin`).

[bun-mocks]: https://bun.com/docs/test/mocks
[bun-dom]: https://bun.com/docs/test/dom
[bun-rtl]: https://bun.com/docs/guides/test/testing-library
[bun-config]: https://bun.com/docs/test/configuration
[bun-parallel]: https://bun.com/docs/test/parallel
[bun-coverage]: https://bun.com/docs/test/code-coverage
[bun-dates]: https://bun.com/docs/test/dates-times
[bun-bunfig]: https://bun.com/docs/runtime/bunfig
[bun-resolution]: https://bun.com/docs/runtime/module-resolution
[bun-env]: https://bun.com/docs/runtime/environment-variables
[bun-dts]: https://github.com/oven-sh/bun/blob/bun-v1.4.0/packages/bun-types/bun.d.ts
[bun-test-dts]: https://github.com/oven-sh/bun/blob/bun-v1.4.0/packages/bun-types/test.d.ts
[bun-14]: https://bun.com/blog/bun-v1.4
[bun-141]: https://bun.com/blog/bun-v1.4.1
[bun-143]: https://bun.com/blog/bun-v1.4.3
[wxt-unit]: https://wxt.dev/guide/essentials/unit-testing.html
[wxt-auto]: https://wxt.dev/guide/essentials/config/auto-imports.html
[wxt-env]: https://wxt.dev/guide/essentials/config/environment-variables.html
[wxt-imports-blog]: https://wxt.dev/blog/2024-12-06-using-imports-module.html
[wxt-vitest-src]: https://github.com/wxt-dev/wxt/blob/main/packages/wxt/src/testing/wxt-vitest-plugin.ts
[wxt-1150]: https://github.com/wxt-dev/wxt/issues/1150
[fake-apis]: https://webext-core.aklinker1.io/fake-browser/implemented-apis
[happydom-reg]: https://github.com/capricorn86/happy-dom/wiki/Global-Registrator
