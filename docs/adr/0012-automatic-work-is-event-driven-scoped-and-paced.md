# Automatic work is event-driven, scoped to where it's needed, and paced

Everything 2.0 does without a click follows one rule: it runs only when an event it needs arrives, only in the tabs that need it, and does as little as it can per event. That covers auto-add's tracking, breakage checks, settings sync, tab routing, registrations, the toolbar icon, the browser menu, keys from any tab, and any automatic option added later, such as automatic gathering.
- **Never on a clock.** No intervals, timer chains, animation-frame loops, polling or alarms. A one-shot timer is allowed only as the bounded follow-up of an event, such as a toast's 6 s.
- **No browser-wide listeners.** Nothing listens to events that every tab fires: tab and window events in Chrome, which can't be filtered, and Firefox's `menus.onShown`, which fires on every right-click. Tabs announce themselves to the background, the background asks the browser when it needs to know, and filters are used where a browser has them.
- **Only where needed.** Nothing runs in a tab without a feature that needs it. In a hidden tab, only what must keep going runs, such as auto-add counting a video that's playing. Discarded and frozen tabs are never woken, reloaded or messaged.
- **Paced.** Hot events (`timeupdate`, pointer movement, page mutations) are handled in place. They never turn into a message or a storage write by themselves: progress, breakage signals and sync writes go out in batches at fixed maximum rates.
- **Yields to the page.** No task of ours takes 50 ms or more. Longer work is split or deferred.
- **Measured.** Each rule has a number in the spec's running-cost budget ([07 §7.6.8](../../.scratch/rebuild/spec/07-quality.md#768-running-cost)) and a check in CI or in the release check. Anything that can't meet a budget needs a measured exception, recorded in the spec with its number.

We chose this because the user requires that the automatic options never degrade the browser, and because the browsers don't protect against it on their own:
- Chrome wakes the service worker for every unfiltered event in every tab, including tabs we have no access to.
- A YouTube tab that's playing sound is exempt from background throttling in both browsers, so code we leave running there runs at full rate.
- Firefox names an extension that slows a page ("… is slowing down Firefox"), and Mozilla's policy says add-ons "must not negatively impact the performance or stability of Firefox".
- [Ticket 24](../../.scratch/rebuild/issues/24-performance-budget.md)'s budgets cover page load only.

The evidence and measurements are in [`docs/research/running-costs.md`](../research/running-costs.md) ([ticket 33](../../.scratch/rebuild/issues/33-resource-mindful-defaults.md)).

## Considered options

- **Budget load cost only, and trust the per-event limits already in the spec:** this misses background wake-ups, storage writes, hidden tabs and requests nobody asked for.
- **Rely on the browsers' own throttling:** a playing tab isn't throttled, and nothing limits how often an extension's background wakes.
- **Keep the background alive** to avoid wake-ups: it holds memory all the time, and Chrome's MV3 stops long-lived workers anyway.
- **Periodic housekeeping alarms** (pruning progress, refreshing caches, checking tabs): simpler to write, but they wake the browser when nothing has changed. Housekeeping rides on writes and starts instead.
- **Measuring and throttling ourselves at runtime:** that adds code and timers to every page to watch the rest. We measure in CI and before each release instead.

## Consequences

- The background learns about tabs only from our own page code and from queries when it needs an answer. Tabs without our code are invisible until then, which is fine, because nothing needs them.
- Watch progress is saved at checkpoints, plus at most every 5 minutes of continuous playback, so a browser crash can lose up to 5 minutes of counting.
- CI gains a static running-cost check beside the size check, and the real-browser layer a running-cost soak. The developer's pre-release live check reads the browsers' own task managers.
- A new automatic option states its trigger's cost against these budgets before it's accepted. Ticket 31's automatic gathering is the first.
