# What's the performance budget for the popup and the in-page script?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)

## Question

2.0 must not be bloated, and a feature that's switched off should cost nothing. Set budgets for:
- **Popup:** how fast it must open. It's about 60 ms today; Svelte rendered 35–40% faster than React in [ticket 05](05-ui-stacks.md)'s benchmark.
- **In-page weight:** how much JS and CSS each feature may add to YouTube and YouTube Music pages, and in total with everything on. Today's content script adds 88 KB gzip of JS and 10 KB of CSS.
- **Off means zero:** a page with every page-changing feature off gets nothing injected beyond what the remaining features strictly need.
- **Enforcement:** how the budgets are enforced, for example a size check in CI.

## Answer

Resolved 2026-10-19. The user delegated the decisions, so each judgement call names its runner-up and why it lost. The numbers come from a throwaway build made for this ticket: WXT 0.21.4, Svelte 5.57.2, Bits UI 2.19.5 and shadcn-svelte's current components, measured against today's 1.5.0 build ([Method](#method)). It takes in the notes from tickets [07](07-watched.md), [08](08-shortcuts.md), [10](10-youtube-access.md), [18](18-breakage.md) and [26](26-youtube-music-quick-actions.md), resolved alongside it.

**In short:**
- A site where every feature is off gets nothing.
- With everything on:
  - a YouTube page gets at most 49 KB gzip of JS, CSS included. Today it gets 88 KB of JS plus 10 KB of CSS, for fewer features.
  - a YouTube Music page gets at most 43 KB.
  - the work done at page load drops from 55 ms of main-thread time today to at most 18 ms (251 → 80 ms at 4× CPU throttling).
- The popup must show its first frame within 60 ms of a cold open. Today's takes 84 ms.
- These numbers hold only if:
  - each page loads one copy of Svelte;
  - Bits UI's popovers and menus load on first use;
  - in-page UI uses no Tailwind;
  - the popup keeps its picker lazy and uses lighter class helpers than shadcn ships.
- CI enforces the bytes on every build. A real-browser test enforces "off means zero" and the timings.

### How the budget counts

- **Weight** is gzip (level 9) bytes of built files. Every budget holds for both the Chrome and the Firefox build; they measured byte for byte the same.
  - Why gzip: every earlier figure on the map is gzip, including today's 88 KB and ticket 05's table. Minified size tracks it at about 3:1 in every build here, so one number per file is enough.
  - Runner-up: minified bytes, which are closer to parse cost. It lost only on continuity, since gzip already tracks it.
- **Eager or lazy.** Eager code loads with the page. Lazy code loads on first use: the playlist picker (ticket 26), Diagnostics (ticket 18) and the popup's views. Each gets a weight budget, and lazy code also gets a budget for how long its first use takes.
- **Time** is main-thread time, net of what an empty page costs.
  - It's measured on the reference machine (Ryzen 5 5600X, Chromium 156) at 1× and at 4× CPU throttling; 4× stands in for a slow laptop.
  - In-page figures come from the real-extension harness ([Method](#method)), which is also how they're enforced.
- **CSS, icons and fonts:**
  - In-page CSS ships inside the script, and Svelte injects it into our shadow root. So page scripts have no CSS files and no web-accessible resources (ticket 10), and the CSS counts as JS.
  - Icons are inline SVG and count too.
  - Fonts cost nothing: in-page UI uses the Roboto and YouTube Sans that YouTube already loads, and bundles none.
- **For scale:** YouTube's own main script is 2.5 MB gzip and its stylesheet 358 KB. The scale doesn't relax anything, because the budget is about what we add.

### Off means zero

- **Every feature on a site off:**
  - Nothing is registered or injected there: no script in either world, no CSS, no element, no listener, no timer, no request.
  - The manifest has no `content_scripts` and no `web_accessible_resources` (ticket 10).
  - The background only reacts to events: no `setInterval`, and no alarm unless a feature that's on needs a schedule.
- **Some features on:**
  - Only those features' files load, plus whatever they share: the site core (ticket 10), and the UI kit if one of them draws.
  - A switched-off feature's files never load.
- **The on-demand probe** (ticket 10) is the only code that reaches a YouTube page while every feature is off.
  - It runs only after the popup or settings asks, in one tab, and draws nothing.
  - It's the site core file, so it has the core's budget.
- **Switching a feature off** in an open tab removes its elements, styles, listeners and observers at once.
  - Its parsed code stays in memory until the tab reloads, because a browser can't unload a script.
- **Settings sync off** means no `storage.sync` reads or writes.

### In-page weight

Budgets are in KB gzip, eager, and apply per page. Each piece counts once per page, however many features use it.

**YouTube (www.youtube.com)**

| Piece | Loads while | Budget |
|---|---|---|
| Site core: isolated bridge, MAIN-world gateway, page adapter, breakage probes (tickets 10, 18) | any YouTube feature is on | 10 (bridge 5, gateway 5) |
| UI kit: Svelte runtime, one shadow host, YouTube skin, the toast with its action, inline icons | a feature that draws or reports is on (every feature but the card menu) | 18 |
| Auto-add: watch tracker and player adapter (ticket 07) | on | 4 |
| Playlist shortcuts: one key listener, pointer and focus tracking (ticket 08) | on | 4 |
| Add to queue button | on | 3 |
| Thumbnail quick-save: the button only; the picker is lazy | on | 3 |
| Right-click card menu: no UI kit | on | 2 |
| Watch-page controls (ticket 09) | on | 5 |
| **Everything on** | | **49** |

**YouTube Music (music.youtube.com).** PROVISIONAL: sized by analogy with YouTube, because no YouTube Music fixture was measured.

| Piece | Loads while | Budget |
|---|---|---|
| Site core: bridge, gateway with the queue-state writes, YouTube Music page adapter, probes | a YouTube Music feature or playlist shortcuts is on (ticket 26) | 12 (bridge 5, gateway 7) |
| UI kit (as above) | any of those is on | 18 |
| Quick actions: inline buttons through one hover overlay | on | 6 |
| Quick-action shortcuts | on | 3 |
| Playlist shortcuts (the same module as YouTube's) | on | 4 |
| **Everything on** | | **43** |

**Lazy, both sites**

| Piece | Loads | Budget |
|---|---|---|
| Playlist picker: Bits UI popover or menu, list, membership states | at its first open in a tab | 50 as its own script carrying Svelte; 38 if it reuses the page's runtime |

**What the numbers rest on** (measured, KB gzip):

| Build | JS |
|---|---|
| WXT's content-script wrapper with a hand-made button, no framework | 3.2 |
| Svelte 5 plus one component, in a shadow root | 12.4 |
| The same through WXT's `createShadowRootUi` | 15.3 |
| … plus a hand-written toast with Undo | 18.2 |
| **Everything on, eager, one Svelte copy:** queue overlay, quick-save button and toast, with stand-ins for the watch tracker and key matcher | **20.6** |
| svelte-sonner's toaster instead of the hand-written toast | 33.3 |
| Bits UI Tooltip / Popover / DropdownMenu with a Svelte button | 47.4 / 48.0 / 51.8 |
| The lazy picker as its own script: Bits UI Popover with 21 rows and its own Svelte copy | 46.4 |
| shadcn-svelte Popover and Command with Tailwind, in a shadow root | 79.5, plus 7.9 CSS |
| **Today's content script (1.5.0)** | **88.0, plus 10.1 CSS** and the 1.0 KB bridge |

- **Where the weight goes:**
  - Svelte's runtime is about 9 KB.
  - WXT's wrapper is about 3 KB, and its shadow-root helper about 2 KB.
  - Bits UI's floating layer (Floating UI, focus scope, dismissal, tabbable) adds about 32 KB.
- **The headroom** between the stand-in's 20.6 KB and the 49 KB budget is for the real site core, the gateway's request code and the real feature logic, none of which the stand-ins include.

### In-page time

**At page load** (from injection until settled, real extension, isolated world):

| Case | Budget 1× / 4× | Measured 1× / 4× |
|---|---|---|
| Everything on, one site | 18 / 80 ms | stand-in 13.8 / 59.3 ms, without the real site core |
| One drawing feature alone, with core and kit | 15 / 60 ms | Svelte button 11.7 / 47.3 ms |
| The card menu alone (no UI kit) | 8 / 30 ms | WXT wrapper and button 5.7 / 23.6 ms |
| **Today's content script, for comparison** | | **55.0 / 250.7 ms** |

- **Longest task:** no task over 50 ms at 1×.
- **Drawn quickly:** from script start to UI drawn takes ≤ 20 ms at 1×. The stand-in took 13.5 ms.

**At first use:**

| Case | Budget 1× / 4× | Measured 1× / 4× |
|---|---|---|
| Lazy picker, from click to painted (background awake) | 60 / 200 ms | 38.3 / 157.7 ms, injected through `scripting.executeScript` |
| A picker that's already loaded opens | 32 ms at 1× (two frames) | not measured in a page; the popup's 51-row picker opened in 26 ms |

**While the page is in use** (set from first principles, not yet measured):
- **Idle costs nothing.** When nothing happens, our scripts run nothing: no `setInterval`, no timer chains, no `requestAnimationFrame` loops, no polling.
  - That includes WXT's `wxt:locationchange`. It polls every second on Firefox before 147 (no Navigation API), and ticket 10's floor is Firefox 140.
  - Use YouTube's and YouTube Music's own navigation events instead.
- **Per event**, at 1×:
  - Auto-add's `timeupdate` handler (about 4 calls a second while playing, ticket 07): ≤ 0.1 ms.
  - The shortcut key listener, for a key that doesn't match (ticket 08): ≤ 0.1 ms.
  - Pointer and focus tracking: ≤ 0.1 ms per event.
    - It uses delegated `pointerover`/`focusin` on the document, never `pointermove`.
    - It reads layout only when the pointed-at item changes.
  - In-app navigation, all features together: ≤ 2 ms.
- **Per card: constant.** What we add doesn't grow with the number of cards: one overlay host and delegated listeners.
  - Measured with 60 cards: one shadow root per card cost 16.7 / 76.0 ms and left 487 nodes. A single overlay cost 11.1 / 51.2 ms and left 26 nodes.
  - The per-card cost would also grow as YouTube's grid scrolls.
- **Observers:** none on the whole document. An observer watches one container, and its handler takes ≤ 1 ms per batch.
- **Breakage probes** (ticket 18) run once per page load, and when a feature is about to act. They cost ≤ 1 ms in total.
- **Memory** (PROVISIONAL): ≤ 500 KB of isolated-world JS heap with everything on. The eager stand-in measured 301–314 KB, eager Bits UI 877 KB, and today 709 KB.

### Popup and settings

| | Budget | Measured |
|---|---|---|
| **Popup, initial load** (what `popup.html` loads before any click) | 40 KB JS + 8 KB CSS | 9 feature switches: 33.8 KB. The same plus shadcn's Button and a lazy picker: 51.6 KB. With an eager Bits picker and Command: 78.1 KB. **Today: 117.9 + 7.5 KB** |
| **Popup, each lazy chunk** (picker, Command search, account view…) | 45 KB | Popover + Command picker chunk: 28.8 KB |
| **Popup, first frame, cold** (first open in a fresh profile) | 60 / 220 ms | switch list 49.7 / 197.6 ms. With a lazy picker and shadcn's helpers 63.1 / 278.1 ms. With an eager picker 72.2 / 338.8 ms. **Today 83.7 / 292.5 ms** |
| **Popup, first frame, warm** (later opens) | 40 / 100 ms | switch list 30.1 / 75.5 ms. With a lazy picker 33.5 / 88.9 ms. With an eager picker 34.0 / 98.4 ms. **Today 36.4 / 141.7 ms** |
| **Popup, picker open including its first load** | 50 / 160 ms | 30.1 / 132.8 ms |
| **Settings page, initial** (PROVISIONAL until ticket 15's prototype) | 60 KB JS + 10 KB CSS; first frame 100 ms cold at 1× | |
| **Settings, each lazy section**, Diagnostics included (ticket 18) | 45 KB | |
| **Background** (PROVISIONAL) | 25 KB, no UI code | today 7.5 KB |

- **The popup paints from storage.** Its first frame needs one `storage.get` for everything the first view shows. It never waits on a YouTube tab or the network first; ticket 10's cached data and its timestamp come from storage.
- **Nothing lazy is preloaded.** `popup.html` doesn't modulepreload a lazy chunk; today's build preloads SettingsPanel.
- **What the measurements show:**
  - **Svelte alone doesn't make the popup faster.** With shadcn's Popover and Command loaded up front, the cold Svelte popup is faster than today's at 1× (72 vs 84 ms), but slower at 4× (339 vs 293 ms).
  - **The gain comes from loading less up front.** Ticket 05's gain appears only when the first view is the switch list and everything else loads on demand.
  - **Later opens are 20–47 ms faster at 1×**, and every variant, today's included, then lands at 30–36 ms. The browser probably caches compiled code (UNVERIFIED). So the cold open is where weight shows, and the case to budget for.

### Judgement calls

1. **In pages, Bits UI loads on first use, never with the page.**
   - Eager in-page UI is plain Svelte components with the YouTube skin. Popovers, menus and the picker load on first use and bring Bits UI with them.
   - Why: Bits UI's floating layer would cost about 32 KB, plus 16 ms at 1× (75 ms at 4×), on every page load, for a picker most page views never open. It also fits ticket 26's lazy picker.
   - Runner-up: eager Bits UI everywhere, with one component model. It lost on that cost.
   - Second runner-up: no Bits UI in pages at all, using the browser's Popover API and hand-written positioning (estimated at about 5 KB). It lost because ticket 13 wants one primitives layer, and loading on first use already keeps Bits UI off the page load. It remains the fallback if the picker misses its first-use budget.
2. **One Svelte copy per page.** Features that draw share one UI kit; they don't each carry Svelte.
   - Why: each extra copy of Svelte plus the shadow-root helper costs about 12 KB and 6 ms at 1× (24 ms at 4×). YouTube has five drawing features, so separate copies would add about 48 KB and break the total.
   - Runner-up: each `feature-<name>` script self-contained, the simplest reading of ticket 10. It lost on that cost. How the kit is shared is ticket 17's to decide (see below).
3. **No Tailwind and no shadcn styles in page scripts.** In-page CSS is a hand-written YouTube skin inside each component.
   - Why: shadcn's Popover and Command with Tailwind in a shadow root cost 79.5 KB of JS, 7.9 KB of CSS and 46 ms at 1×. Tailwind's `@property` rules would also be hoisted into YouTube's `<head>`, which leaves a trace on the page. This rule closes that open question from ticket 13.
   - Runner-up: Tailwind with only the utilities used. It lost because shadcn's component classes need Tailwind's base layer and `@property` rules anyway.
4. **A hand-written toast instead of svelte-sonner.**
   - svelte-sonner costs 15 KB and 7 ms more at load than a hand-written toast with Undo, and ticket 12's rules (one toast at a time, hold on hover, wait while hidden) need custom handling anyway.
   - Runner-up: svelte-sonner, for its polish. It lost on cost.
5. **One overlay host for thumbnail and row buttons, not one per card.**
   - Why: its cost stays constant, while per-card hosts grow with scrolling.
   - Runner-up: a host per card, which is simpler to hit-test and reach by Tab. It lost on cost, and that leaves keyboard reach for ticket 14 to solve.
6. **CSS ships inside the JS** (`emitCss: false`, so Svelte injects each component's CSS into the shadow root).
   - Runner-up: WXT's `cssInjectionMode: "ui"`. It lost because it makes every stylesheet a web-accessible resource, which ticket 10 forbids, and it adds a fetch (about 2 ms).
7. **The popup's 40 KB initial budget forces a choice about shadcn's helpers.**
   - shadcn-svelte's styling helpers weigh more than Svelte itself:
     - `tailwind-variants`, used by Button: 12.7 KB;
     - `cn`, which does class merging: 10.8 KB.
   - Lighter replacements fit the budget:
     - `tailwind-variants/lite`: 3.7 KB;
     - `clsx`: 0.2 KB.

     With these, callers must not override a component's classes with conflicting ones.
   - Runner-up: a 55 KB budget that keeps shadcn's helpers as shipped. It lost on cost. Adding shadcn's Button (and with it `tailwind-variants`) plus two icons to the switch list cost 17.8 KB, and 13 ms more on a cold open at 1× (80 ms at 4×). That's mostly for class merging the popup barely needs.
   - Ticket 15 decides how to stay within the budget.
8. **Bytes are a hard gate; time is a soft one.**
   - Byte checks are exact, so CI fails on any overrun.
   - Timing on shared CI runners is noisy, so CI fails only at 1.5× a time budget. The exact figures are checked on the reference machine before each release.
   - Runner-up: hard gates on time. It lost because they'd make builds flaky.

### Enforcement

1. **Budget file.**
   - `perf-budget.json` at the repo root lists every budget above, per browser build.
   - The feature list comes from the feature registry that the background also uses to register scripts (ticket 17). It records each feature's files and site and whether it draws, so the check and the extension can't disagree.
   - Raising a budget means editing this file in the same PR, with the reason in the commit message.
2. **CI size check** (`scripts/check-budget.ts`, Bun), run in `ci.yml` after both builds:
   - It gzips every built file and checks:
     - each piece;
     - each feature alone, with its core and kit;
     - each site with everything on;
     - each lazy chunk;
     - the popup's and settings page's initial load, found by following the HTML's scripts and modulepreloads and each chunk's static imports.
   - It writes a table with the change from `main` to the job summary (`$GITHUB_STEP_SUMMARY`), and fails on any overrun.
   - It also fails if:
     - the manifest has `content_scripts` or `web_accessible_resources`;
     - a page script emits a `.css` file;
     - a page script outside the UI kit contains Svelte's runtime;
     - a page script that isn't a lazy chunk contains Bits UI.
   - Bytes are deterministic, so this gate never flakes.
3. **Real-browser budget test.**
   - It runs the built extension in Chromium through Playwright, and in Firefox through Puppeteer's WebDriver BiDi `installExtension` (ticket 18).
   - Its pages are local fixtures shaped like YouTube and YouTube Music, with a snapshot of their real stylesheet. It checks:
     - **Everything off:** no extension execution context appears in the page (Chrome DevTools Protocol `Runtime.executionContextCreated`), and no node, style or request is added.
     - **Each feature alone:** only that feature's files, its site core and the UI kit run (`Debugger.scriptParsed`).
     - **Everything on:**
       - load time, the time from script start to UI drawn, heap, and the longest task;
       - five idle seconds with no script activity of ours;
       - constant cost per card, comparing 24 cards with 120;
       - per-event costs, using synthetic `timeupdate`, key and pointer events.
     - **Switching off in an open tab:** every element and listener goes, checked through the DOM and `DOMDebugger.getEventListeners`.
     - **The lazy picker's first open.**
   - It belongs in ticket 17's real-browser layer and can share ticket 18's browser-watch setup.
4. **Time gates:**
   - CI runs the test unthrottled, takes the median of 10 runs, and fails at 1.5× a budget.
   - The release checklist (ticket 19) runs it at 1× and 4× on the reference machine, on both browsers, and records the figures.
5. **Real pages:** during ticket 14's rough dev build on real YouTube, run the same measurements on a signed-in home page and watch page, to confirm the fixture isn't flattering us.

### For other tickets

- **17 (modules):**
  - **Share one UI kit per page.** WXT builds every content script as a self-contained IIFE with no shared chunks, so each would otherwise carry its own Svelte.
    - Suggested: give the kit its own registration per site (`ui-www`, `ui-music`). Register it while any drawing feature on that site is on.
    - It exposes the Svelte runtime and kit on a global in the isolated world. Feature files are compiled with Svelte external, mapped to that global, and wait on a promise there, so the order of registrations doesn't matter.
    - Runner-up: ES-module chunks loaded with `import()`. It needs web-accessible resources, which ticket 10 forbids.
  - **Keep WXT's wrapper out of feature files.** The 2–6 KB feature budgets leave no room for WXT's 3 KB `defineContentScript` wrapper in each file.
    - WXT's `ContentScriptContext` also posts a page-visible `window.postMessage` at start unless that is turned off. It's a small trace.
  - Compile page code with `emitCss: false`; the popup and settings keep CSS files.
  - Load the lazy picker with `scripting.executeScript` from the background.
  - Make the feature registry the single source for both registration and the budget check.
  - The budget needs the real-browser layer.
- **13 and 14 (UI):**
  - Eager in-page UI is plain Svelte with the YouTube skin; popovers and menus load on first use.
  - Keep one shadow host per page for all in-page UI. It measured slightly cheaper than one per feature, about 4 ms at 4×.
  - Use one overlay host for thumbnail buttons; keyboard reach (Tab order) needs a design, for example inserting the host after the focused card link on `focusin`.
  - The toast is hand-written, about 3 KB on top of the kit.
  - No Tailwind in pages, so no `@property` reaches YouTube's `<head>`.
  - ADR-0002 could gain one consequence line: "In YouTube and YouTube Music pages, Bits UI loads only on first use."
- **15 (popup and settings):**
  - The first view is the switch list, painted from one storage read.
  - Pickers, Command search and the account and settings views load lazily.
  - Use `tailwind-variants/lite` and `clsx`, or stay within 40 KB another way.
  - Diagnostics is a lazy settings section.
- **26 and 27 (YouTube Music):**
  - Use one hover overlay per page, not buttons on every row.
  - The picker has the 60 ms first-use budget. Injecting it when the pointer reaches Save (hover intent) would hide that latency.
- **07, 08:** the per-event budgets above, and no polling to follow the miniplayer.
- **09:** watch-page controls get 5 KB eager; any popover there is lazy.
- **10:** the site core is 10 KB on YouTube and 12 KB on YouTube Music, and the probe is the same file.
- **19:** the release checklist runs the timing test on the reference machine in both browsers, and `release.yml` runs the size check too.

### Method

- **Build:**
  - A throwaway WXT 0.21.4 project (Vite 8.3.4) with Svelte 5.57.2 through `@wxt-dev/module-svelte` 2.0.5.
  - Bits UI 2.19.5, svelte-sonner 1.2.1, shadcn-svelte's registry components as of 2026-10-19 (`cn` 0.3.3, `tailwind-variants` 3.3.1), and Tailwind 4.3.3.
  - Built with Bun 1.4.3, checksum-verified, for Chrome MV3; a Firefox MV3 build of five variants gave the same bytes.
  - Each variant is its own entrypoint, so WXT builds it as its own IIFE, as 2.0's page scripts will be. Popup variants were built one per build, so they didn't share chunks.
  - Today's figures come from the 1.5.0 build at `301ae51` (ticket 05's scratch build).
- **Sizes:** gzip level 9 of each emitted file. Package shares come from a Vite plugin that sums each module's `renderedLength`.
- **In-page timing:**
  - The page is a fixture of 60 YouTube-style cards (`ytd-rich-item-renderer`), with YouTube's real `kevlar_base` stylesheet (3.2 MB, fetched 2026-10-19) and `<html>` at `font-size: 62.5%`.
  - Two harnesses:
    - **Real extension** (full Chromium 156, new headless): the extension is loaded, and each script is injected into the isolated world with `scripting.executeScript`. 10 runs at 1× and 8 at 4×.
    - **Stub harness** (headless shell): each built script runs in the main world with a stub `chrome` object. 15 runs at 1× and 10 at 4×. It's used for the variants not run in the real extension (svelte-sonner, Tailwind, Bits UI eager with a toast).
  - Each run uses a fresh page. "Time" is the change in the Chrome DevTools Protocol's `Performance.getMetrics` `TaskDuration` across injection plus 400–500 ms of settling, net of the same with nothing injected.
  - The real extension is 1–6 ms slower than the stub harness at 1×, because of the isolated world and the message to the service worker.
- **Popup timing:**
  - Ticket 05's measure: from navigation start to the first frame after the app's mount, at a 340 px viewport, as a real `chrome-extension://` page.
  - **Cold** is the first open in a fresh profile (10 profiles at 1×, 8 at 4×). **Warm** is a later open in the same profile.
  - Window creation for a real popup can't be timed headless and isn't included.
- **Lazy picker:** the eager quick-save button sends a message on click; the background injects the picker with `scripting.executeScript`; the picker reports when it has painted.
- **Not measured:** Firefox timing (sizes only), a real signed-in YouTube page, YouTube Music, a settings page, the background, per-event costs, and the time for the service worker or event page to wake before a first picker open.

Also from [ticket 17](17-modules.md), after resolution:
- **Rebalanced rows:** core 5 → 8 KB, playlist shortcuts 4 → 1 KB, quick-action shortcuts 3 → 1 KB. Site totals unchanged.
- **The kit's 18 KB** probably needs about 4 KB of headroom (PROVISIONAL), and the watch-page menu counts inside `popovers.js` (50 KB).
- **New size-check rules:** Svelte only in the kits and `popovers.js`, Bits UI only in `popovers.js`, no kit code inside feature files.

Also from [ticket 19](19-upgrade-and-rollout.md): the size check runs on the exact store builds.

Also from [ticket 14](14-in-page-controls.md)'s real-YouTube build:
- **Up front:** everything is 39.6 KB gzip (about 43.6 KB with auto-add), within the 49 KB site total.
- **The kit:** 27.8 KB against its 18 KB line, 72 % of it the Svelte runtime, so the site's rows need rebalancing.
- **The picker's first open:** 96–115 ms against 60 ms (headless). Hover preload was added but not re-measured.

Also from [ticket 27](27-youtube-music-controls.md): YouTube Music's eager weight is 35.2 KB, within its 43 KB. The lazy picker is 54.5 KB, over its 50 KB (ticket 14 also measured a 96–115 ms first open against 60 ms). Decision for the spec: the picker must meet its budget. If the build overruns, first link `popovers.js` to the kit's Svelte runtime; failing that, replace Bits UI in the picker with the native Popover API and a hand-written listbox.

Also from [ticket 15](15-popup-and-settings.md):
- **Popup first view (gzip):** YouTube 35.8 KB, YouTube Music 39.4 KB (against 40 KB, with banner copy to go lazy), CSS 7.7 KB.
- **Settings first frame:** 38.8 KB.
- **Onboarding:** 23.2 KB.
- **Cold first frame:** about 42 ms (about 150 ms at 4× slowdown), measured off the reference machine.

## Settled by the user (2026-10-20)

**No budget number changes** after the user's decisions ([R99](../spec/resolutions.md#the-users-decisions-of-2026-10-20-r84r99); spec 07 Q-PERF-44):
- **Four more YouTube Music actions** (R85): about 1–1.5 KB more in `feature-music-actions.js`, a few bindings and two small jobs, rebalanced within YouTube Music's 43 KB; if they don't fit, their code loads on first use.
- **Keys from any tab and Save from the browser's menu** (R88, R91): nothing eager on any page; on use they inject the page half, core and kit, which have budgets, and their background code counts toward the 25 KB background.
- **Recent adds** (R86): only a header button in the popup's first view, and a lazy sheet. The YouTube Music popup's 0.6 KB headroom stays tight, so the matching-cut rule applies; moving copy into `messages.json` (R93) is expected to cover it.
- **The toolbar tick and "paused"** (R92): background only.
