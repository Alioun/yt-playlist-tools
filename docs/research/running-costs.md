# What may automatic work cost the browser?

Research for wayfinder ticket 33 (`.scratch/rebuild/issues/33-resource-mindful-defaults.md`), done on 2026-10-20. [Ticket 24](../../.scratch/rebuild/issues/24-performance-budget.md) budgets what 2.0 costs when a page **loads**. This note budgets what it costs while it **runs**: on YouTube's main thread, in the background, in storage, on the network, and in tabs that don't need it.

The user's requirement (2026-10-20): "with all of the automatic options added the default should be very mindful of browser resources and should never ever degrade the performance of the browser".

**Citation keys**
- **[BG n]** and **[PG n]** are the numbered facts in §1, each with its primary source: Chrome for Developers, MDN, the HTML and W3C specs, Chromium's source (`chromium.googlesource.com/chromium/src/+/main/…`) and Firefox's (`searchfox.org/firefox-main/source/…`), all read on 2026-10-20. "(source)" means a reading of the code, not documentation.
- **[M n]** are this note's own measurements (§2).
- **Spec IDs** (`YT-*`, `YM-*`, `ARC-*`, `DATA-*`, `Q-*`, `R-n`) are in `.scratch/rebuild/spec/`.
- **UNVERIFIED** marks a claim no source states; **[inference]** marks this note's reasoning.

## Answer

- **The principle** ([ADR-0012](../adr/0012-automatic-work-is-event-driven-scoped-and-paced.md)): automatic work runs only on an event it needs, only in the tabs that need it, and never on a clock. Hot events never become messages or writes. No task of ours reaches 50 ms. Every rule has a number and a check; anything that can't meet one needs a measured exception.
- **Why the browsers won't do it for us:**
  - Chrome wakes the service worker for every unfiltered tab or window event, in every tab, even tabs the extension can't access [BG 4]. One such listener got 7 events per YouTube page load, 6 per in-app navigation and 3–4 per page load on other sites, at about 25 ms per cold wake [M 6].
  - A playing YouTube tab isn't throttled in the background in either browser, and `timeupdate` keeps its 250 ms cadence there [PG 2, PG 3, M 3].
  - `storage.onChanged` is copied into every listening content script: in a burst, a 57 KB write cost each listening tab 7–11 ms [BG 18, M 4].
  - Firefox's `menus.onShown` wakes the background on every right-click anywhere [BG 23].
  - Long Animation Frames can't see isolated-world code, and Firefox has no long-task API, so our cost is measured from traces and profiles [PG 9].
- **What 2.0 costs today, measured:** prototype A did nothing at all while idle, visible or hidden, and its worker never woke [M 2]. Prototype B did nothing while idle, but spent 7–15 ms a minute during YouTube Music playback through a subtree observer on the whole app, which the budgets now forbid [M 7]. A stand-in tracker cost 7–18 ms a minute of playback, visible or hidden, against YouTube's own 1,070 ms visible and 585 ms hidden [M 1, M 4].
- **Budgets** (07 §7.6.8, Q-PERF-45 to Q-PERF-58), with everything on:

  | What | Budget |
  |---|---|
  | An idle page, visible or hidden, for 60 s | Nothing of ours runs; the background doesn't wake |
  | Our main-thread time per minute of playback, visible or hidden | ≤ 30 ms; ≤ 2 ms once every goal is reached |
  | Any task with our code / any one callback of ours | < 50 ms / ≤ 5 ms |
  | Observer records | ≤ 10 a minute during playback; ≤ 20 per page of cards loaded |
  | Background wakes | 0 while nothing happens on YouTube and for any other site's tab; ≤ 1 per YouTube page load; about one every 5 minutes of playback |
  | Work per routine wake | ≤ 2 reads, ≤ 1 write, no registration, ≤ 10 ms |
  | Timers and alarms | No interval, no alarm; one-shot follow-ups of ≤ 25 s |
  | Storage writes | `local`: ≤ 1 a minute per playing tab, one shard per save; `session`: ≤ 1 per page load, signals ≤ 1 per 10 s; `sync`: ≤ 12 a minute |
  | `storage.onChanged` in pages | None |
  | Requests nobody clicked for | 4 named and bounded: auto-add at a goal, the 24 h label check, the claim check, gathering into a playlist |
  | Memory | ≤ 500 KB isolated-world heap after 30 minutes; `storage.session` < 1 MB; `storage.local` < 5 MB |
  | Discarded, frozen and other sites' tabs | Never woken, reloaded, injected into or messaged |

- **Defaults that change** (R105–R116): progress saved at checkpoints and at most every 5 minutes of playback, one shard at a time, instead of the whole record every 60 s; the tracker stops once every goal is reached; progress pruned when written, not read on every wake; routine starts register nothing; injection into open tabs paced, skipping discarded and frozen tabs; hidden tabs run only the counting; "paused" on the toolbar uses the tab-less value; no `menus.onShown`; YouTube Music's growth check backs off; the claim check runs once per account per session; views pushed only where they can change; signals batched.
- **Enforcement** (R102): a `running-cost` guard and layer-3 soaks in `bun test`; `check:runtime` beside the size check; a layer-4 soak in both browsers, with counts as hard gates and times soft; a 15-minute check in both browsers before each release; the live-check build fails if Firefox calls us slow.
- **For ticket 31** (R117, Q-PERF-58): a background-opened YouTube tab, detected by our own page code, and a tab-count threshold both fit. "Unvisited for a while" fits, but fires at the next event, not on time. Closing a window can't fit.

---

## 1. What things cost: the evidence

### 1.1 The background

- **[BG 1] Chrome's service worker stops after 30 s idle.** "After 30 seconds of inactivity. Receiving an event or calling an extension API resets this timer." It's also stopped when one event or API call runs over 5 minutes. Extension API calls reset the timer since Chrome 110, port messages since 114 ("Opening a port no longer resets the timers"). [Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- **[BG 2] Browser start doesn't start the worker.** "When a user profile starts, the runtime.onStartup event fires but no service worker events are invoked." (same page)
- **[BG 3] A cold start has no published cost for extension workers** (UNVERIFIED). Google's nearest figure is for web service workers: "usually around 50ms… On mobile… 250ms". [web.dev, navigation preload](https://web.dev/blog/navigation-preload). §2 measures ours.
- **[BG 4] Filters are checked before waking, but `tabs.onUpdated` has none in Chrome.**
  - Docs: "A service worker need not be woken up to handle events it doesn't care about." [Events](https://developer.chrome.com/docs/extensions/reference/api/events)
  - Source: `EventListenerMap::GetEventListeners` matches filtered events and returns every listener for unfiltered ones (`extensions/browser/event_listener_map.cc`). `tabs.json` declares no filters, and `WillDispatchTabUpdatedEvent` always returns true, so a tab the extension has no access to still wakes it, with an empty `changeInfo` (`chrome/browser/extensions/api/tabs/tabs_event_router.cc`).
  - Google's own advice: "This event will be called on every navigation on every tab. Instead, use webNavigation.onCompleted with a filter." [Events in service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events)
  - The same holds for every other unfiltered tab and window event: `tabs.onCreated`, `onActivated`, `onRemoved`, `onMoved`, `windows.onCreated`, `onRemoved`, `onFocusChanged` [inference from the same code path].
- **[BG 5] How often `tabs.onUpdated` fires.** Chromium's own test expects, for one full load, `{status:'loading',url}`, `{status:'complete'}`, then `{favIconUrl}` and/or `{title}`; for a same-document navigation, `loading` and `complete`. Audible, muted, pinned, group, discard and freeze changes fire it too (`chrome/test/data/extensions/api_test/tabs/on_updated/test.js`). So one YouTube in-app navigation is at least 2 events plus title changes; [M 6] counts them.
- **[BG 6] Firefox's background is an event page that idles out after 30 s** (default 30,000 ms, clamped to 100 ms – 5 min, `toolkit/components/extensions/parent/ext-backgroundPage.js`). Events and, since Firefox 121, API calls reset it ([bug 1844041](https://bugzilla.mozilla.org/show_bug.cgi?id=1844041)). "Message ports cannot prevent an event page from shutting down." [MDN, background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts). Firefox has no extension service worker (`extensions.backgroundServiceWorker.enabled` is false); WXT emits `background.scripts` for Firefox MV3.
- **[BG 7] Firefox can filter `tabs.onUpdated`** with `urls`, `properties`, `tabId` and `windowId` (Firefox 61; `"url"` as a property since 88). The filter runs in the parent before the page wakes, and naming `properties` detaches the observers it doesn't need (`browser/components/extensions/parent/ext-tabs.js`). `urls` works with host permission alone. [MDN, tabs.onUpdated](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onUpdated)
- **[BG 8] `webNavigation` filters by URL before waking, but its permission warns.** Chrome shows "Read your browsing history" ([permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)), and adding it in an update disables the extension "until the user accepts the new permission" ([permission warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)). Firefox shows "Access browser activity during navigation".
- **[BG 9] Any message wakes the background, listener or not.** Chrome queues a wake for every `runtime.sendMessage` (`MaybeAddPendingLazyContextOpenChannelTask`, `extensions/browser/api/messaging/message_service.cc`). Firefox "unconditionally wakes up the event page" ([bug 1852317](https://bugzilla.mozilla.org/show_bug.cgi?id=1852317), open).
- **[BG 10] Timers don't keep the background alive.** Only events and API calls reset the idle timer [BG 1, BG 6], so a `setTimeout` longer than the idle window can be lost when the worker stops [inference].
- **[BG 11] Alarms.** Chrome's docs say at most once every 30 s, but Chrome 153's source lowered the floor to 1 s (`kMV3ReleaseDelayMinimum`, `extensions/browser/api/alarms/alarms_api_constants.h`). Alarms persist across sessions from Chrome 150. Firefox has no minimum, and alarms don't survive a browser restart. Every alarm wakes the background. [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms), [MDN alarms](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms)

### 1.2 Tabs and windows, with host permissions only

- **[BG 12] `tabs.query({url})` works without the `tabs` permission** in both browsers, for hosts the extension may access: Chrome ignores the URL "if the extension does not have the "tabs" permission or host permissions for the page" ([tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)); Firefox since 86 ([MDN, permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions)). `url`, `title` and `favIconUrl` are exposed for those tabs only.
- **[BG 13] Fields 2.0 can rely on at its floors:** `lastAccessed` (Chrome 121, Firefox 56), `discarded` (54/57), `autoDiscardable` (54/116), `frozen` (Chrome 132, none in Firefox). `tabs.onCreated` may fire before the URL is set; `openerTabId` is "only present if the opener tab still exists". `windows.onRemoved` passes only the window's ID. (MDN compat data)
- **[BG 14] Reading a discarded tab never reloads it.** "Discarded tabs… are reloaded when activated"; `tabs.query` only reads. Firefox: "No receivers in discarded tabs, so bail early to keep the browser lazy." (`ExtensionParent.sys.mjs`). Whether a message to a Chrome tab frozen by Energy Saver queues or fails is UNVERIFIED, so every message to a tab needs a timeout.
- **[BG 15] Chrome freezes CPU-hungry background tabs on Energy Saver** (Chrome 133+): tabs "hidden and silent for more than five minutes" that use over 5 % CPU in the background (`freezing_high_cpu_proportion` = 0.05, `components/performance_manager/features.cc`). Our code in a hidden tab counts toward that 5 %. [Freezing on Energy Saver](https://developer.chrome.com/blog/freezing-on-energy-saver)

### 1.3 Storage

- **[BG 16] `storage.sync` quotas (Chrome):** 102,400 bytes, 8,192 per item, 512 items, **120 writes a minute and 1,800 an hour**. The limits count `set`, `remove` and `clear` calls, so one multi-key `set` counts once. [storage](https://developer.chrome.com/docs/extensions/reference/api/storage). Firefox enforces the byte and item quotas (since 79) but not the write rates, and syncs "every 10 minutes or whenever the user selects Sync Now". [MDN, storage.sync](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync)
- **[BG 17] `storage.local`:** 10 MB in Chrome (more with `unlimitedStorage`); IndexedDB-backed in Firefox since 66. In Chrome each `set()` is one LevelDB write batch and unchanged values are skipped (`components/value_store/leveldb_value_store.cc`). Firefox may fire `onChanged` even when nothing changed ([bug 1833153](https://bugzilla.mozilla.org/show_bug.cgi?id=1833153)).
- **[BG 18] `storage.onChanged` reaches every listening content script, in every tab.** In Chrome, `local` and `sync` default to "trusted and untrusted contexts", so each content-script context with a listener gets its own cross-process copy of every change; the source notes "copying `changes` can be expensive" (`extensions/browser/api/storage/storage_frontend.cc`). Firefox does the same per context. Per-area listeners exist (Chrome 73, Firefox 101); with both kinds registered, the event is delivered twice.
- **[BG 19] `storage.session` stays out of content scripts:** "By default, it's not exposed to content scripts" in Chrome; never in Firefox (115+). 10 MB.

### 1.4 The toolbar icon, the browser menu, commands and registrations

- **[BG 20] Per-tab icon state clears itself.** Chrome's docs: a tab's value "Automatically resets when the tab is closed". Chrome's source also clears it on every cross-document navigation, but not on `pushState` (`ExtensionActionRunner::DidFinishNavigation`, `chrome/browser/extensions/extension_action_runner.cc`). Firefox: "The text is reset when the user navigates this tab to a new page", also not on `pushState` (`ext-browser.js`). A value set **without** a tab ID applies to every tab that has no value of its own.
- **[BG 21] `setIcon` cost differs by browser.** Chrome fetches and decodes a `path` on every call but passes `imageData` through; Firefox PNG-encodes `imageData` on every call but passes `path` through (`set_icon.js`; `Schemas.sys.mjs`). A badge (`setBadgeText`, `setBadgeBackgroundColor`) avoids both.
- **[BG 22] Browser-menu entries cost nothing until clicked.** They live in the browser process, which evaluates `contexts`, `documentUrlPatterns` and `targetUrlPatterns`; only a click dispatches `onClicked`. Both browsers persist them across restarts and drop them on an extension update, so they're created in `runtime.onInstalled` (`chrome/browser/extensions/menu_manager.cc`; [MDN, menus.create](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/menus/create)).
- **[BG 23] Firefox's `menus.onShown` wakes the event page on every right-click anywhere** in a non-private window, because it's a primed persistent event fired to every subscriber (`browser/components/extensions/parent/ext-menus.js`). So does using `menus.refresh()` with it.
- **[BG 24] Browser commands cost nothing until pressed.** Accelerators live in the browser; a press dispatches `onCommand` (`extension_keybinding_registry.cc`). Chrome allows four suggested keys; a command with no key costs nothing. [commands](https://developer.chrome.com/docs/extensions/reference/api/commands)
- **[BG 25] Registered page scripts survive restarts and are cleared on update** in both browsers (`extensions/browser/user_script_manager.cc`; `ExtensionScriptingStore.sys.mjs`). Every registration or update re-serialises **all** of the extension's scripts and sends them to **every** renderer process (`extensions/browser/user_script_loader.cc`). Registering again on each worker start is therefore real work across the browser, and fails anyway for existing IDs.
- **[BG 26] A registered script costs only where a matching page loads.** Discarded tabs pay nothing until they reload; other renderers hold a read-only shared-memory copy (same file).

### 1.5 In YouTube's page

- **[PG 1] `timeupdate` fires every 250 ms in both browsers** while media time moves. Spec: "every 15 to 250ms"; Chromium `kMaxTimeupdateEventFrequency = base::Milliseconds(250)` (`html_media_element.cc`); Firefox `TIMEUPDATE_MS 250` (`HTMLMediaElement.h`).
- **[PG 2] Media events aren't throttled in hidden tabs.** Chromium puts them on a pausable, not a throttleable, queue: "Media events should not be deferred to ensure that media playback is smooth." (`frame_scheduler_impl.cc`). Firefox's throttling only covers timers, and Firefox 158 kept firing `timeupdate` 3.6 times a second in a hidden tab [M 8]. Chromium did the same [M 3].
- **[PG 3] A tab playing sound is barely throttled.** Chrome throttles hidden-tab timers to once a second, and to once a minute after the tab is hidden and silent (the grace period is now 60 s for loaded pages, `features.h`), but not while audio plays or has played in the last 30 s. Firefox treats a window playing audio as active and doesn't throttle it (`TimeoutManager.cpp`). [Timer throttling in Chrome 88](https://developer.chrome.com/blog/timer-throttling-in-chrome-88). So a YouTube tab playing in the background runs our timers at full rate: pausing work there is our job, not the browser's.
- **[PG 4] Content scripts share the page's throttling.** Isolated worlds run on the page's main thread with the page's timer queues (`V8BindingDesign.md`, `dom_timer.cc`; Firefox's sandbox uses the page window as prototype).
- **[PG 5] `requestAnimationFrame` doesn't run in hidden tabs** (HTML's "update the rendering" skips hidden documents).
- **[PG 6] Idle callbacks stop in hidden tabs.** Chrome ends idle periods 10 s after the renderer is hidden (`kEndIdleWhenHiddenDelayMillis = 10000`); with a `timeout`, an idle callback becomes a throttleable timer. Firefox runs background idle callbacks through background-throttled timers (at least 1 s apart). [requestIdleCallback](https://w3c.github.io/requestidlecallback/) caps an idle period at 50 ms.
- **[PG 7] `scheduler.yield()` and `scheduler.postTask()`** are in Chrome 129 / 94 but only from Firefox 142, so on Firefox 140–141 a fallback is needed (MDN compat data).
- **[PG 8] Long tasks and responsiveness.** A long task "exceeds 50ms" ([Long Tasks](https://w3c.github.io/longtasks/)). RAIL: "process user input events within 50 ms" and "perform work during idle time in 50 ms or less"; of a 16 ms frame the page has "about 10 ms" ([RAIL](https://web.dev/articles/rail)). INP is good at ≤ 200 ms ([INP](https://web.dev/articles/inp)).
- **[PG 9] Neither long-task API sees our code.** Long Animation Frames (Chrome 123) says "extension code running in an isolated world won't have script attribution in long animation frames, even if they impact the duration of one" ([LoAF](https://developer.chrome.com/docs/web-platform/long-animation-frames)). Firefox has neither Long Tasks nor LoAF. So our cost must be measured from outside: Chromium traces, or the Firefox Profiler.
- **[PG 10] A `MutationObserver` on the whole document makes the browser record every change on YouTube.** For each mutation the browser walks the node's ancestors and gives each interested observer a new record ([DOM, queue a mutation record](https://dom.spec.whatwg.org/#queueing-a-mutation-record)). Chromium skips that walk while nothing in the document observes that kind of mutation (`MayHaveMutationObserversOfType`), so our observer switches it on for the whole page. `attributeFilter` avoids records for other attributes. No vendor guidance gives a figure; [M 5] measures YouTube's rates.
- **[PG 11] Input listeners.** `pointermove` and other continuous events are aligned to animation frames since Chrome 60; "Avoid long-running input handlers; they can block scrolling", and "Do not make style changes in input handlers" ([debounce your input handlers](https://web.dev/articles/debounce-your-input-handlers)). IntersectionObserver replaces scroll handlers ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)). ResizeObserver runs inside the rendering step and can loop ([Resize Observer](https://drafts.csswg.org/resize-observer/)).
- **[PG 12] Visibility.** `visibilitychange` to hidden is "a good point … to stop UI updates and stop any tasks" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event)). `pagehide` is the reliable last event; `unload` no longer fires by default in Chrome 155 and blocks the back/forward cache in Firefox. `freeze`/`resume` are Chrome-only ([Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)).
- **[PG 13] Back/forward cache.** Since Chrome 123 a page with an open extension port is cached and the port closed, with `onDisconnect` ([bfcache and extension messaging](https://developer.chrome.com/blog/bfcache-extension-messaging-changes)). Sending a message to a cached frame still evicts it (`kExtensionSentMessageToCachedFrame`, `disabled_reason_id.h`). Firefox drops messages to cached contexts.

### 1.6 What users and stores see

- **[BG 27] Mozilla's policy:** "Add-ons must not negatively impact the performance or stability of Firefox." ([Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)). The Chrome Web Store has no general performance rule; its best practices warn that code which breaks the back/forward cache risks "substantially slowing down your users" ([best practices](https://developer.chrome.com/docs/webstore/best-practices)).
- **[BG 28] Firefox names slow extensions.** A content script running 5 s (`dom.max_ext_content_script_run_time`) while the user tries to interact shows "“%1$S” is slowing down %2$S. To speed up your browser, stop that extension." and fires `runtime.onPerformanceWarning` (Firefox 124+) (`XPCJSContext.cpp`, `browser.properties`).
- **[BG 29] Chrome's Task Manager shows the extension's own row** (Memory footprint, CPU, Idle wake ups, Network, Keepalive count), with content scripts counted in their tab's row. Inspecting the worker in DevTools keeps it alive, which skews any check ([debugging](https://developer.chrome.com/docs/extensions/get-started/tutorial/debug)). Firefox's `about:processes` lumps all extensions into one row; the Firefox Profiler's `moz-extension` filter isolates ours ([reporting a performance problem](https://firefox-source-docs.mozilla.org/performance/reporting_a_performance_problem.html)).

### 1.7 How to measure it

- **[PG 14] Chromium:** CDP `Performance.getMetrics` gives page-wide `TaskDuration`, `ScriptDuration` and heap, good only for with/without comparisons. Traces (`devtools.timeline`, `disabled-by-default-devtools.timeline.stack`) record `FunctionCall` and `EvaluateScript` with the script URL, and `TimerInstall`, `TimerFire`, `RequestAnimationFrame` and idle callbacks, so script time and timers can be attributed to `chrome-extension://<id>/` URLs. Playwright gives CDP and tracing on Chromium only.
- **[PG 15] Firefox:** no CDP, and WebDriver BiDi has no tracing. The Firefox Profiler can run headless (`MOZ_PROFILER_STARTUP`, `MOZ_PROFILER_SHUTDOWN`) and shows content scripts as "Content Script <name>" samples on the tab's main thread. Puppeteer installs extensions over BiDi (`webExtension.install`, Firefox 137+).
- **[PG 16] Memory per world can't be read directly.** `Runtime.getHeapUsage` reports the whole isolate; `performance.measureUserAgentSpecificMemory()` needs cross-origin isolation, which YouTube doesn't have.

---

## 2. Measurements

Measured on 2026-10-20, signed out, on real youtube.com unless marked. The throwaway scripts aren't kept; the method is described here so the numbers can be redone.

**Set-up.**
- AMD Ryzen 5 5600X (the reference machine's CPU model) under WSL2 Linux, 12 threads; Chrome for Testing 156.0.8078.4 (Playwright's `chromium-1248`), new headless.
- The browser was started **without** Playwright's default switches, so background throttling applied, and "hidden" means a real second tab brought to the front (`visibilityState` is `hidden`; the YouTube tab stays audible, so the browser doesn't throttle its timers [PG 3]).
- Times are CDP `Performance.getMetrics` deltas (page-wide, so only good for with/without comparisons) and Chromium traces attributed by script URL [PG 14]. Other browsers were running on the machine, so whole-page times are noisy. Counts aren't.
- **Caveat:** signed-out playback stops after about 44 s of media ("Something went wrong", no PO token), so real-YouTube playback windows looped the first 35 s. The tracker stand-in ran on a local page served at a `www.youtube.com` URL, with a real `<video>` playing a 480p VP9 file.
- **Prototype A** is ticket 14's rough build (`prototype/in-page-controls`): site core, kit, queue button, quick-save overlay, playlist shortcuts, watch-page button and card menu, registered at runtime as 2.0 will be. It has no auto-add.

**[M 1] YouTube's own cost, no extension.** 30-second windows, per minute:

| Page | Main-thread time | Of which script | Long tasks | Requests |
|---|---|---|---|---|
| Watch page, playing, visible | 1,073 ms | 258 ms | 0–1 | 24–26 (low: the loop was already buffered) |
| Watch page, playing, hidden | 585 ms | 166 ms | 0 | 5–6 |
| Channel grid, idle, visible | 27 ms | 6 ms | 0 | about 3 |

**[M 2] Prototype A while idle.** In every traced idle window (watch page visible, watch page hidden, grid) there were **zero** function calls from `chrome-extension://` URLs and zero CPU-profile samples of ours. Its only timers were the watch-page button's placement retries after a navigation (0, 150, 500, 1,500 and 4,000 ms), outside the windows. Whole-page time with A was 1,185 ms a minute visible (script 249) against 1,073 (script 258), and 589 hidden against 585: within the noise. Its worker woke **0** times in a 3-minute session with three YouTube tabs, because it listens only to messages and install events.

**[M 3] `timeupdate`.** 3.8 a second on real YouTube, visible **and** hidden, at 1× **and** 2× speed: a fixed 250 ms cadence, not tied to media time [PG 1, PG 2]. 3.6 a second on the local page.

**[M 4] A stand-in watch tracker, and storage.** The stand-in listens in the isolated world to `timeupdate`, `seeking`, `ratechange`, `pause`, `ended`, `visibilitychange` and `pagehide`, keeps merged played stretches, and saves at most every 30 s plus on pause, end and `pagehide`. It uses no timer and no observer.
- **Per event:** mean 43–49 µs, at most 0.7 ms. The counting logic alone is 1.7 µs a step, so most of the cost is dispatching the event into the isolated world.
- **Per minute of playback:** about 9 ms visible and 10.6 ms hidden by its own timing; 7–18 ms by CPU profile and trace across runs.
- **Writing progress** (`storage.local.set`, 20 writes each, from a page and from the worker):

  | What's written | Blocks the writer | Until it lands | Each of 3 tabs listening to `storage.onChanged`, per write in a burst |
  |---|---|---|---|
  | One video's entry, 147 bytes | 0.1 ms | about 1 ms | about 0.13 ms |
  | A whole progress record of 1,000 videos, 56.7 KB | about 4 ms | about 12 ms (8.6–20) | 7–11 ms |

  Every listening tab received every write. The listener's own code took 0.01–0.05 ms; the rest is the browser turning the old and new values into objects in each listening context [BG 18].

**[M 5] `MutationObserver` on real YouTube** (an isolated world; the callback walks the records and matches added elements):

| Page and moment | Whole document, `childList` + `subtree` | … plus `attributes` | One container's own children (`childList` only) |
|---|---|---|---|
| Watch page, steady playback, per minute | 5.3 records, 2.6 callbacks, 0.3–0.5 ms | about 100 records, 5.3 callbacks, 0.3–0.4 ms | 0 (`#below`, `ytd-watch-metadata`) |
| Channel grid, idle | 0 | 0 | 0 |
| Channel grid, one scroll that loads 30 cards | about 177 records, 0.6 ms | about 470 records in 14 callbacks, 0.6 ms | 2–3 records, 0.2 ms (`#contents`) |

So YouTube is quiet during steady playback; the bursts come with navigation and scrolling, and scoping an observer to one container's own children cuts the records about 60-fold. The time is small here only because the stand-in callback does almost nothing per record.

**[M 6] The background.**
- **Cold and warm:** a message from a content script to the worker and back took about 25 ms (23–30, n = 10) with the worker stopped first, and 1.5 ms (1.2–1.8) with it running. A no-op message: 23.6 and 1.25 ms.
- **Memory:** the extension's process held about 15.5 MB (PSS; 9.5 MB private). Prototype A's worker used 0.5 MB of JS heap.
- **A test worker with an unfiltered `tabs.onUpdated` listener** got 40 events in a 3-minute session with three YouTube tabs (`status` 18, `title` 10, `url` 7, `audible` 6, `favIconUrl` 6), and started twice: it stayed up while events kept coming and started again on the next navigation after 30 s of quiet. Per navigation:

  | What happened | `tabs.onUpdated` events |
  |---|---|
  | A YouTube page load | 7 |
  | A YouTube in-app navigation | 6 |
  | A page load on another site, in another tab | 3–4 |
  | 30 s with YouTube playing in a background tab | 1 (`audible`) |

  Each is a wake whenever the worker is asleep, so a listener like this costs about 25 ms for every few clicks anywhere in the browser.

**[M 7] YouTube Music, with prototype B** (ticket 27's rough build, `prototype/youtube-music-controls`: quick actions through one hover overlay, header buttons and the player-bar Save), signed out, Home with 60 recognised items:
- **YouTube Music itself** is busy even when idle: about 2,200–2,300 ms of main-thread time a minute on Home with nothing playing, and 1,850–2,400 ms while a song plays visible (script 320–440 ms).
- **Idle:** no function call of ours on Home.
- **Playing:** B's quick-actions file ran 7–15 ms a minute (trace-attributed), the only work of ours while nothing was clicked. Its source shows why: one `MutationObserver` on `ytmusic-app` with `subtree: true`, which re-syncs the header and player-bar controls on every change, and YouTube Music changes its own page as the song plays. This is what Q-PERF-49 and UI-RULE-44 now forbid. The same build also polls twice: up to 40 tries 250 ms apart for the gateway at start, and every 40 ms for up to 5 s while `popovers.js` loads. Both are rough-build shortcuts that Q-PERF-25 already rules out.

**[M 8] Firefox 158**, the stand-in tracker on the local page (real YouTube kept pausing itself in headless Firefox):
- `timeupdate` fired 3.6 times a second visible **and hidden**, and 3.8 at 2× hidden, which settles [PG 2]'s open point for Firefox: media events aren't throttled in a hidden tab there either.
- The tracker cost 24 ms a minute visible (mean 113 µs, at most 5.7 ms) and 12–14 ms hidden. Firefox's times are recorded for information only (Q-TEST-19), but this is close to the 30 ms budget, so the real tracker needs watching there.
- `storage.local.set` didn't block the writer (0.2 ms either way), but took 1.5 ms to land for 147 bytes and 10–11 ms for 57 KB (p90 43–65 ms; one write during playback took 128–553 ms).


---

## 3. The audit: every automatic behaviour, what it costs, and what changes

"Complies" means the spec already pins what ADR-0012 asks. "Changes" names the new or amended requirement, with its resolution. Line-level detail is in the spec chapters.

| # | Behaviour | Where it runs, and what wakes it | What it costs while running | Verdict |
|---|---|---|---|---|
| 1 | **Auto-add's watch tracker** (YT-AA-13–18) | The watch or Shorts player's `timeupdate` (4 Hz [PG 1]), in visible and hidden tabs; the gateway's `player` stream crosses to the isolated world on each tick | Per reading: a page read, a JSON event across worlds and the counting rule, measured at [M 4]. It keeps running in hidden tabs, which the browser doesn't throttle while sound plays [PG 2, PG 3] | **Complies** on per-event cost (Q-PERF-30). **Changes:** it listens only while a goal is left to reach in this playback (YT-AA-44); nothing else of auto-add runs in a hidden tab (YT-AA-45); a reading never becomes a message or a write (YT-AA-46). R106 |
| 2 | **Saving watch progress** (DATA-24–27, 06 tracker) | A message to the background every 60 s of playback, plus pause, leave, hide and close | One background wake a minute per playing tab, each rewriting the account's whole progress record (up to 2,000 videos) [M 4]; a crash loses at most a minute | **Changes:** checkpoints (leave, pause, hide, close) plus at most every 5 minutes of continuous playback, at most one save a minute per tab, nothing when nothing new played (DATA-27, amended); a save rewrites only that video's entry (DATA-56). R105, R107 |
| 3 | **Pruning progress** (DATA-26) | "at every background start and every write" | Every wake, for any reason, reads every account's progress | **Changes:** pruned only when progress is written, at most once a day per account (DATA-26, amended). R107 |
| 4 | **Start-up on every background start** (ARC-MOD-25, ARC-MAN-12, ARC-ACC-61) | Every wake of the worker is a start [BG 1, BG 2] | The migration check, the reconcile diff and the access checks on every wake, whatever woke it | **Complies** in shape (idempotent). **Changes:** a start whose layout is current and whose desired set equals what's registered reads at most twice and calls nothing else (ARC-MOD-37); registering again would re-send every script to every renderer [BG 25]. R109 |
| 5 | **Registrar injection** (ARC-MAN-13, ARC-MAN-17) | Switching a feature on; an extension update | `executeScript` into every open matching tab at once, hidden and discarded ones included | **Changes:** one tab at a time, the focused window's active tab first, then audible tabs, then the rest; discarded and frozen tabs skipped (ARC-MAN-22). R109 |
| 6 | **Tab registry and `tab.hello`** (ARC-ACC-57) | One message per page load | One wake and one `storage.session` write per YouTube page load; no cap | **Complies:** no tab events, recency from `lastAccessed`. **Changes:** capped, cleaned when a send finds a tab gone (ARC-ACC-70). R110 |
| 7 | **Serving-tab routing** (ARC-ACC-52–56) | The popup, settings, a command | Sequential 2 s pings, possibly injecting a core into several tabs | **Complies:** on demand only, never wakes a tab. **Changes:** at most 3 candidates pinged per job, and a core injected into at most one tab per job (ARC-ACC-70). R110 |
| 8 | **View pushes** (`bg.view`, `Tabs.push`) | Any store change that alters a tab's view | A message to every known tab | **Changes:** sent only to tabs whose view actually changed; progress, cache, registry and signal writes never change a view (ARC-MSG-13). R110 |
| 9 | **`storage.onChanged`** (ARC-MOD-24) | Every write | Copied to every listening context, content scripts in every tab included [BG 18] | **Complies:** content scripts never read storage. **Changes:** made a guard (no `onChanged` in page code), and the background listens to the sync area only, per area (Q-PERF-54). R108 |
| 10 | **Settings sync** (SYNC-06) | A local change to a synced document | Pushes 2 s after the last change, at most every 5 s | **Complies.** **Changes:** one `set()` per push for every changed document, and never a document identical to the synced copy (SYNC-27): at most 12 writes a minute, a tenth of Chrome's quota [BG 16]. R108 |
| 11 | **Caches** (DATA-19–23, ARC-ACC-43) | A view opened with a list older than 5 minutes; every membership read | A request on open; a cache write on every add | **Complies:** no timer, no prefetch, no membership or channel cache. **Changes:** a cache is written only when its content changed (DATA-57); one refresh in flight per account. R108 |
| 12 | **Breakage probes, anchor check and signals** (Q-WATCH-25, HEALTH-01, `tab.signals`) | Page load; 3 s after each navigation; each signal | A DOM scan after every navigation, hidden tabs included; signal writes per occurrence | **Complies:** probes only at load and before acting. **Changes:** the anchor check waits until the tab is visible; signals go out at most every 5 s per tab and are written at most every 10 s (HEALTH-28). R111 |
| 13 | **Toolbar badge, tick and "paused"** (FT-57, HEALTH-15, R92) | A status change, an add, a pause | Per-tab `action` calls | **Changes:** the browser's own state is written only when `badgeFor` changes; "every tab" states use the tab-less value in one call; the tick needs no tab listener, because the browser clears per-tab state on a full navigation [BG 20] and the tab sends one message when its video changes in-app (ARC-MOD-38). R112 |
| 14 | **The browser menu** (R91) | Created when the feature goes on | Nothing until clicked [BG 22] | **Changes:** created on switch-on and on `onInstalled` while on; never `menus.onShown` or `refresh()`, which would wake the background on every right-click anywhere in Firefox [BG 23] (ARC-MAN-23). R113 |
| 15 | **Keys from any tab** (R88) | A key press | Nothing until pressed [BG 24]; then one wake, one query, at most one injection | **Complies.** The 3 s answer is an allowed one-shot timer. R113 |
| 16 | **YouTube Music state** (`nowPlaying`, `queue` streams, YM-Q-8, YM-BAR-7) | The app's own changes; a queue action | "Re-read until the queue has grown… within 10 s", interval unstated | **Changes:** streams are driven by the app's own events and cost nothing without a watcher; the growth check re-reads at most 6 times on a backing-off schedule (YM-Q-14); the player-bar Save follows song changes only while it's drawn (YM-BAR-9). R114 |
| 17 | **In-page controls** (overlay, watch-page button, theme mirror) | Hover, navigation, resize, theme change | A page round trip per hover on YouTube Music; per-item state that grows with scrolling; an unthrottled `resize` listener; a theme observer without a filter; in the YouTube Music rough build, a subtree observer on `ytmusic-app` costing 7–15 ms a minute of playback [M 7] | **Complies** in shape (UI-RULE-36/37). **Changes:** per-item state capped at 200 items; resize and scroll work at most once per frame; attribute observers name their attributes; no subtree observer on the app root; no observer or layout read while hidden (UI-RULE-44, Q-PERF-49). R115 |
| 18 | **Toasts** (YT-ADD-19/20) | An outcome | A 6 s timer | **Complies:** the timer runs only while the tab is visible. |
| 19 | **Requests nobody clicked for** (ARC-ACC-43, ACC-18, ACC-30) | Auto-add's goal; the 24 h label check; claiming the 1.x setup | The claim check can fetch a playlist list for every account on every page load | **Changes:** a closed list of named exceptions, each bounded (Q-PERF-55); the claim check runs once per account per browser session (ACC-46). R116 |
| 20 | **Automatic gathering** (ticket 31) | Not chosen yet | Every candidate trigger would be 2.0's first tab or window listener or alarm | **Constraints** in §6 (Q-PERF-58): whichever trigger the user picks must meet them. R117 |

---

## 4. The budgets, and where each number comes from

The requirements are 07 §7.6.8 (Q-PERF-45 to Q-PERF-58). This table gives each number's ground.

| Budget | Number | Ground |
|---|---|---|
| Idle page, visible or hidden, nothing playing | 0 script time, timers, frames, callbacks, messages, writes; 0 wakes, over 60 s | ADR-0012; Q-PERF-30 already asked it for 5 s. 60 s covers Chrome's 30 s worker idle window [BG 1] and YouTube's own idle churn [M 2] |
| Our main-thread time per minute of playback, visible | ≤ 30 ms | The stand-in tracker took 7–18 ms [M 4]; the real design adds a page-world read and a crossing per reading. 30 ms is under 3 % of YouTube's own 1,070 ms [M 1] |
| … hidden | ≤ 30 ms | Hidden playback isn't throttled: `timeupdate` stays at 3.8 a second [M 3] and the tracker costs the same [M 4]. YouTube's own is 585 ms [M 1] |
| … with every goal reached, or auto-add off | ≤ 2 ms | The tracker stops listening (YT-AA-44) |
| Per `timeupdate` | ≤ 0.1 ms (unchanged, Q-PERF-30) | The stand-in's handler averaged 43–49 µs, at most 0.7 ms [M 4] |
| Longest task containing our code | < 50 ms | The Long Tasks definition [PG 8]; already the load budget (Q-PERF-28) |
| One callback of ours in a page | ≤ 5 ms at 1× | Half of the "about 10 ms" a page has per frame [PG 8]; in-app navigation for all features is already ≤ 2 ms (Q-PERF-30) |
| Mutation records delivered to our observers during playback | ≤ 10 a minute during playback; ≤ 20 per page of cards loaded | Steady playback: 5 a minute document-wide, 0 scoped; a scroll loading 30 cards: about 177 document-wide, 470 with attributes, 2–3 for the container's own children [M 5] |
| Background wakes: idle, other sites | 0 | Chrome wakes for every unfiltered event [BG 4]; ADR-0012 allows none of them |
| … per minute of playback with auto-add on | ≤ 1, about 0.2 on average | DATA-27's checkpoints (R105) |
| Work per routine wake | ≤ 2 reads before handling, ≤ 1 write, no `scripting` call; ≤ 10 ms | Registering again re-sends every script to every renderer [BG 25]; a cold start costs about 25 ms from message to answer, against 1.5 ms warm [M 6], so a wake's own work stays smaller than the start |
| Background timers | One-shot, ≤ 25 s, never re-armed; no alarm | A stopped worker loses timers [BG 10]; the idle window is 30 s [BG 1, BG 6] |
| `storage.local` writes during playback | ≤ 1 a minute per playing tab; 0 with nothing new | DATA-27 (R105); a 57 KB record blocked the writer for 4 ms and took 12 ms to land, against 0.1 ms and 1 ms for 147 bytes [M 4], hence one shard per save (DATA-56) |
| `storage.sync` writes | ≤ 12 a minute | SYNC-06's 5 s pace with one `set()` per push (SYNC-27): a tenth of Chrome's 120 a minute [BG 16] |
| `storage.onChanged` in pages | none | Every listening content script gets a copy of every change [BG 18]; in a burst, a 57 KB write cost each listening tab 7–11 ms, against 0.13 ms for 147 bytes [M 4] |
| Requests nobody asked for | A closed list of 4 | ADR-0001's "one request per user intent" (ARC-ACC-43), with auto-add, the label check, the claim check and gathering as the only named exceptions |
| Memory in a page | ≤ 500 KB isolated-world heap after 30 minutes | Q-PERF-30's figure (still PROVISIONAL), now held over time; per-item state capped at 200 |
| `storage.session` | < 1 MB | A tenth of its 10 MB quota [BG 19] |
| `storage.local` | < 5 MB | Half of Chrome's 10 MB [BG 17] |
| A gather with 50 tabs | ≤ 20 ms of background time | Less than one cold start of the worker (about 25 ms [M 6]). A starting value, checked in layer 4 |

---

## 5. Enforcement

| Where | What | Kind |
|---|---|---|
| **`bun test` guard** (`running-cost`, Q-TEST-46) | Fails on `setInterval`, `alarms`, any `tabs.on*` / `windows.on*` / `webNavigation` / `menus.onShown` listener, `storage.onChanged` in page code, a listener, observer or timer in feature or kit code outside the core's `Scope`, and a whole-document subtree observer | Static, on source; every push |
| **`bun test` layer 3 soaks** (Q-TEST-47) | With fake timers and counting fakes: an idle hour leaves no timer, message or storage call; a scripted playback hour (4 Hz `timeupdate`, pauses, a seek, a hidden stretch, video changes) stays within the message and write budgets, and the tracker's listener goes once every goal is reached; a replayed day in the background makes no `scripting` call on routine wakes and registers only the allowed listeners; 100 sync edits in 10 s make at most 3 `set()` calls | Deterministic counts; every push |
| **`check:runtime`** (Q-PERF-60, Q-CI-19), the size check's sibling | On both store builds: no `setInterval` or `alarms` in any built file; the background's `addListener` calls are exactly ARC-MOD-39's list; no listed browser-wide listener anywhere, dependencies included; no `onChanged` in page files | Static, on built output; hard gate in `ci.yml` and `release.yml` |
| **Layer 4 soak** (Q-TEST-48) | The fixture watch page with a real `<video>`: 3 minutes visible, 3 hidden, 60 s idle. Chromium: trace-attributed time, timers, frames and the longest task of ours; CDP counts worker starts; an extension page counts writes; route interception counts requests. Firefox: the same counts through the test build's counters; time from the Firefox Profiler for information | Counts hard in both browsers; times 1.5× in Chromium CI (Q-PERF-41) |
| **Release check** (REL-CHK-27, Q-PERF-63) | A 15-minute signed-in session in Chrome and Firefox on the reference machine, with and without the extension: Chrome's Task Manager (CPU time, idle wake-ups, memory footprint for the extension and the tabs) and a Firefox Profiler capture filtered to `moz-extension`. Over budget blocks the tag; over 1.5× the previous release needs an explanation | Manual, recorded in the release PR |
| **Live-check build** (Q-PERF-64) | Fails its run if Firefox fires `runtime.onPerformanceWarning` (a content script hung, [BG 28]) | Firefox, signed in, before each release |

Why counts are hard gates and times soft: counts don't depend on the machine, so they never flake; times on shared CI runners do (ticket 24's judgement call 8).

---

## 6. Constraints for automatic gathering (ticket 31)

Q-PERF-58 states them as requirements. Whichever trigger the user picks, it must:
1. **Use events only.** No alarm, interval or timer that checks tabs. A condition over time is evaluated when something else already wakes the background, from `Tab.lastAccessed` [BG 13].
2. **Add no browser-wide listener** and no permission with an install warning. New YouTube tabs are learnt from our own page code in them, which says in `tab.hello` whether the page started hidden.
3. **Read tabs without waking them:** `tabs.query({ windowId, url })` with host access gives URL, title, index, `lastAccessed` and `discarded` [BG 12], which is everything GatherTube's six sort orders use (its `background.js` sorts by `lastAccessed`, tab index and title only). Never message, inject into, activate, reload or un-discard a gathered tab [BG 14].
4. **Gather once per burst:** after a quiet second with no new tab, at most once a minute per window (starting values).
5. **Send no request per tab:** YouTube's queue is a `watch_videos` page (no request of ours); a playlist goes through the add flow from one serving tab.
6. **Close tabs in one call.**
7. **Cost nothing while off.**
8. **Stay within 20 ms of background time with 50 tabs**, adding no wake beyond the `tab.hello` each new YouTube tab already sends.

**The candidate triggers against them:**

| Trigger | How it would be detected | Cost | Meets the constraints? |
|---|---|---|---|
| A YouTube tab opened in the background | The new tab's site core says in `tab.hello` that the page started hidden | Nothing in other tabs; one `tabs.query` per burst | **Yes**, and the cheapest. The site core must be registered on YouTube while the option is on |
| … detected with `tabs.onCreated` / `onUpdated` | Browser events | A wake for every tab created or updated anywhere; Chrome can't filter them [BG 4] | No (rule 2) |
| … detected with `webNavigation` and a YouTube URL filter | Filtered before waking [BG 8] | No wake for other sites, but Chrome warns "Read your browsing history" and disables the extension on update until accepted | No (rule 2) |
| A tab-count threshold (N YouTube tabs in a window) | On each new YouTube tab's `tab.hello`, count with `tabs.query({ windowId, url })` | One query per new YouTube tab; closes cost nothing (the count is fresh each time) | **Yes** |
| Tabs left unvisited for a while | `lastAccessed`, checked when something else wakes the background (a YouTube page load, the popup, the browser starting) | Free, but late: it fires at the next such event after the time passes, not on the minute | **Yes, with that caveat.** On-time firing needs an alarm, which fails rule 1 |
| Closing a window | `windows.onRemoved` passes only the window's ID [BG 13] | Needs every tab's URL tracked all along (unfilterable tab events, or every YouTube tab reporting each navigation), and at browser quit nothing can be sent | **No** |

---

## 7. Decided here, and what needs the user

**Decided under the user's principle** (R100–R117):
- Watch progress is saved at checkpoints and at most every 5 minutes of continuous playback, not every 60 s. A crash can now lose up to 5 minutes of counting instead of 1. In exchange, a playing tab wakes the background about 12 times an hour instead of 60.
- Every other change in §3 removes cost without changing what the user sees.

**For the user** (through ticket 31, with a recommended answer):
- **Closing a window as a gathering trigger:** it can't meet the constraints. *Recommended:* drop it from the candidates. If the user wants something at window close, the nearest cheap equivalent is a manual "Gather this window" in the popup.
- **"Unvisited for a while":** it can fire only at the next YouTube page load, popup open or browser start after the time passes, not exactly on time. *Recommended:* accept that, or prefer the background-opened or tab-count triggers, which fire at once.

---

## Sources

Primary sources, all read on 2026-10-20. Chromium paths are under `https://chromium.googlesource.com/chromium/src/+/main/`, Firefox paths under `https://searchfox.org/firefox-main/source/`.

- Chrome for Developers: [service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [events in service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events), [events](https://developer.chrome.com/docs/extensions/reference/api/events), [tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs), [storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms), [action](https://developer.chrome.com/docs/extensions/reference/api/action), [commands](https://developer.chrome.com/docs/extensions/reference/api/commands), [webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation), [permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list), [permission warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings), [timer throttling in Chrome 88](https://developer.chrome.com/blog/timer-throttling-in-chrome-88), [freezing on Energy Saver](https://developer.chrome.com/blog/freezing-on-energy-saver), [bfcache and extension messaging](https://developer.chrome.com/blog/bfcache-extension-messaging-changes), [Long Animation Frames](https://developer.chrome.com/docs/web-platform/long-animation-frames), [Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api), [Chrome Web Store best practices](https://developer.chrome.com/docs/webstore/best-practices), [debugging extensions](https://developer.chrome.com/docs/extensions/get-started/tutorial/debug).
- MDN: [background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts), [tabs.onUpdated](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onUpdated), [permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions), [storage.sync](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync), [menus.create](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/menus/create), [alarms](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms), [visibilitychange](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event), [Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API).
- Specs: [HTML, time marches on](https://html.spec.whatwg.org/multipage/media.html#time-marches-on), [HTML, update the rendering](https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering), [DOM, queue a mutation record](https://dom.spec.whatwg.org/#queueing-a-mutation-record), [Long Tasks](https://w3c.github.io/longtasks/), [requestIdleCallback](https://w3c.github.io/requestidlecallback/), [Resize Observer](https://drafts.csswg.org/resize-observer/).
- web.dev: [RAIL](https://web.dev/articles/rail), [INP](https://web.dev/articles/inp), [debounce your input handlers](https://web.dev/articles/debounce-your-input-handlers), [navigation preload](https://web.dev/blog/navigation-preload).
- Mozilla: [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/), [reporting a performance problem](https://firefox-source-docs.mozilla.org/performance/reporting_a_performance_problem.html), bugs [1844041](https://bugzilla.mozilla.org/show_bug.cgi?id=1844041), [1852317](https://bugzilla.mozilla.org/show_bug.cgi?id=1852317), [1833153](https://bugzilla.mozilla.org/show_bug.cgi?id=1833153).
- Chromium source: `extensions/browser/event_listener_map.cc`, `chrome/browser/extensions/api/tabs/tabs_event_router.cc`, `chrome/test/data/extensions/api_test/tabs/on_updated/test.js`, `extensions/browser/api/messaging/message_service.cc`, `extensions/browser/api/alarms/alarms_api_constants.h`, `extensions/browser/api/storage/storage_frontend.cc`, `components/value_store/leveldb_value_store.cc`, `chrome/browser/extensions/extension_action_runner.cc`, `extensions/renderer/resources/set_icon.js`, `chrome/browser/extensions/menu_manager.cc`, `extensions/browser/user_script_loader.cc`, `third_party/blink/renderer/core/html/media/html_media_element.cc`, `third_party/blink/renderer/platform/scheduler/main_thread/frame_scheduler_impl.cc`, `third_party/blink/renderer/platform/scheduler/common/features.h`, `third_party/blink/renderer/platform/scheduler/main_thread/main_thread_scheduler_impl.h`, `components/performance_manager/features.cc`.
- Firefox source: `toolkit/components/extensions/parent/ext-backgroundPage.js`, `browser/components/extensions/parent/ext-tabs.js`, `browser/components/extensions/parent/ext-menus.js`, `toolkit/components/extensions/ExtensionParent.sys.mjs`, `toolkit/components/extensions/ExtensionScriptingStore.sys.mjs`, `dom/media/mediaelement/HTMLMediaElement.h`, `dom/base/TimeoutManager.cpp`, `dom/base/nsGlobalWindowInner.cpp`, `js/xpconnect/src/XPCJSContext.cpp`, `modules/libpref/init/StaticPrefList.yaml`.
- GatherTube 1.1.0's [`manifest.json` and `background.js`](https://github.com/karimelgazar/gathertube), for what its sort orders read.
