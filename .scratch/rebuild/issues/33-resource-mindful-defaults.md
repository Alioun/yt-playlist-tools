# What may automatic work cost the browser?

Type: research
Status: resolved
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

The user (2026-10-20): "with all of the automatic options added the default should be very mindful of browser resources and should never ever degrade the performance of the browser".

[Ticket 24](24-performance-budget.md) budgets load cost (bytes, main-thread time at load). Nothing yet budgets the running cost of the automatic parts: auto-add's watch progress, breakage monitoring, settings sync, tab routing, YouTube Music state reading, and GatherTube's automatic gathering ([ticket 31](31-gathertube.md)).

Decide:
- the principle;
- the measurable budgets for steady-state CPU, wake-ups, timers, memory, storage writes and work in background tabs;
- which defaults change;
- how CI and the release check enforce it.

## Answer

Resolved 2026-10-20. The principle was the user's, so this settles what follows from it. Evidence, measurements and the full audit: [`docs/research/running-costs.md`](https://github.com/Alioun/yt-playlist-tools/blob/research/running-costs/docs/research/running-costs.md) on branch `research/running-costs`. Principle: [ADR-0012](../../../docs/adr/0012-automatic-work-is-event-driven-scoped-and-paced.md). Budgets: [07 §7.6.8](../spec/07-quality.md#768-running-cost) (Q-PERF-44 to Q-PERF-63). Resolutions: [R100–R117](../spec/resolutions.md#running-costs-r100r117).

- **The principle:** automatic work runs only on an event it needs, only in the tabs that need it, and never on a clock. Hot events never become messages or writes. No task of ours reaches 50 ms. Every rule has a number and a check, and anything that can't meet one needs a measured exception.
- **Why the browsers don't protect us:**
  - Chrome wakes the service worker for every unfiltered tab event in every tab, even tabs we can't access.
  - A YouTube tab playing sound isn't throttled in the background, in either browser.
  - `storage.onChanged` is copied to every listening content script in every tab.
  - Firefox's `menus.onShown` wakes the background on every right-click anywhere.
  - Long Animation Frames can't see isolated-world code, so our cost is measured from traces.
- **Measured on real YouTube** (Ryzen 5 5600X, Chromium 156, signed out): YouTube itself spends about 1,070 ms of main-thread time a minute while a video plays visible, and 585 ms hidden. Prototype A did nothing at all while idle, and its worker never woke. A stand-in tracker cost 7–18 ms a minute, visible or hidden. A worker's cold start costs about 25 ms, against 1.5 ms warm.
- **Budgets, with everything on:**
  - an idle page, visible or hidden, costs nothing for 60 s;
  - at most 30 ms of our main-thread time per minute of playback, visible or hidden, and no task of ours reaches 50 ms;
  - the background never wakes for other sites' tabs or while nothing happens on YouTube, at most once per YouTube page load, and about once every 5 minutes of playback;
  - at most 1 local write a minute per playing tab, sync at most 12 writes a minute, and no `storage.onChanged` in pages;
  - four named requests nobody clicked for (auto-add at a goal, the 24 h label check, the claim check, gathering into a playlist), each bounded;
  - no interval, no alarm, no browser-wide listener; nothing in discarded, frozen or other sites' tabs.
- **Defaults that change:**
  - progress is saved at checkpoints and at most every 5 minutes of playback, not every 60 s, rewriting one of 16 shards, not the whole record. A crash can lose up to 5 minutes of counting;
  - auto-add stops listening once every goal is reached;
  - progress is pruned when written, not read on every wake;
  - routine starts register nothing; injection into open tabs is paced and skips discarded and frozen ones;
  - in hidden tabs only counting runs: anchor checks and in-page UI wait;
  - the "paused" badge uses the browser's tab-less value; the tick needs no tab listener;
  - the browser menu never uses `onShown`; YouTube Music's growth check backs off instead of polling; the claim check runs once per account per session.
- **Already compliant:** no polling, tab recency from `lastAccessed`, one-shot messages, content scripts never reading storage, delegated pointer events, no document-wide observers, toasts waiting while hidden, sync's 2 s / 5 s pace, no prefetch.
- **Enforcement:** a `running-cost` guard and layer-3 soaks in `bun test`, a static `check:runtime` beside the size check, a layer-4 soak in both browsers (counts hard, times soft), and a 15-minute running-cost check before each release (REL-CHK-27).
- **For ticket 31:** whichever automatic trigger the user picks must be event-driven, add no browser-wide listener or warning permission, read tabs without waking them, gather once per burst, send no request per tab, and cost nothing while off (Q-PERF-57). A background-opened YouTube tab and a tab-count threshold fit. "Unvisited for a while" fits, but fires at the next event, not on time. Closing a window can't fit.
