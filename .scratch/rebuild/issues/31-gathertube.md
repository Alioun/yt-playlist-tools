# How does GatherTube's functionality fold into 2.0?

Type: research
Status: resolved
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

The user wants every feature of [GatherTube](https://github.com/karimelgazar/gathertube) (MIT, by Karim Elgazar, unmaintained since 2025-10) in 2.0, credited. It gathers a window's open YouTube video tabs into one queue: YouTube's own `watch_videos` queue or its own embedded player, sorted six ways, optionally closing the gathered tabs.

The user's rules (2026-10-20):
- **Port all of it.** Every capability, option, sort order, shortcut and setting survives, reshaped to fit 2.0's principles (opt-in feature, off costs nothing, look like YouTube inside YouTube, never drive YouTube's visible UI).
- **Exactly two additions:**
  - gathering into a playlist the user picks (the "vacuumed playlist");
  - an automatic option.
  - Nothing else. "It's not my product and I am not scope creeping this."
- **Credit GatherTube** visibly.
- **The automatic option must be very mindful of browser resources** and never degrade the browser's performance ([ticket 33](33-resource-mindful-defaults.md)).

Find out:
- **Inventory:** every feature, option, default, shortcut, message and edge case in GatherTube 1.1.0 (Chrome MV3 root and `firefox-build/` MV2), including what the listings promise.
- **What no longer works and why:** coordinate with [ticket 32](32-gathertube-upstream-fix.md). How 2.0 avoids the same breakage.
- **The fold:** how each item maps onto 2.0's features, permissions (GatherTube needs `tabs`; does 2.0?), architecture (ADR-0001/0007/0008), UI (popup, settings, a player page) and budgets (ticket 24).
- **The playlist target:** how gathering into a chosen playlist uses ticket 12's add flow (membership, outcomes, Undo, account in view).
- **The automatic option:** the candidate triggers, what each costs the browser, and a recommendation for the user to pick.

## Answer

Full report, with test logs in `docs/research/gathertube/`: [`docs/research/gathertube.md`](../../../docs/research/gathertube.md) (from branch `research/gathertube`).

- **What GatherTube is:**
  - One action gathers the current window's YouTube video tabs, de-duplicated, in one of six orders, into YouTube's `watch_videos` list or its own player page. It can close the tabs.
  - Its player page has a queue panel (reorder, remove, shuffle, clear) and a few keys.
  - 24 users on Chrome, 28 on Firefox. Both stores ship the repo as it is.
- **What's broken today:**
  - The player page shows YouTube's Error 153 in both browsers: extension pages send no Referer.
  - `watch_videos` keeps only the first 50 videos and drops the rest silently, so "close tabs" can lose videos.
  - The Firefox settings page is dead.
  - A title guess gathers, and can close, tabs that aren't videos.
  - "English first" means "mostly Latin letters".
- **The fold:**
  - One opt-in feature, **Gather tabs**: a row with a Gather button in the popup's YouTube tab, and a card in Settings › YouTube.
  - No page code and no new permission, because YouTube host access already shows YouTube tabs' addresses and titles. Off or idle, it costs nothing.
  - Every GatherTube item has a home, mapped in the report (§4.2), with each change flagged.
- **The player page can't come back as an embed.** Besides Error 153, YouTube applies its API policies to anyone embedding its player, and those ban the internal requests 2.0 is built on.
  - Recommended replacement: **YouTube's own queue.** Live, it took 100 gathered videos in order, with YouTube's own reorder, remove, clear and play-now.
  - More than 50 videos also go there instead of `watch_videos`.
- **Gathering into a playlist (addition 1):**
  - one gather playlist per account;
  - ticket 12's add flow as a batch: membership first, never a second copy, one report, Undo;
  - a tab closes only once its video is confirmed in the playlist;
  - Undo also reopens the closed tabs.
- **The automatic option (addition 2):** six candidate triggers were weighed for cost and surprise. Recommended: gather video tabs not opened for a day into the gather playlist, checked once an hour by one alarm. No tab listeners, no page code, and it never wakes a sleeping tab.
- **Credit:** in the feature's card, Settings › About, the docs and both listings. Nothing is copied, so no licence notice is needed.
- **Glossary:** Gather, Video tab, Destination, Temporary list, Gather playlist, Gather order, Automatic gathering, Unvisited tab, plus edits to Auto-add, Add and Queue (report §8).

### Folded into the spec (2026-10-20)

Resolved: the port is specified as **Gather tabs** in [02 §2.16](../spec/02-youtube.md#216-gather-tabs) (YT-GT-01 to YT-GT-36), with the decisions recorded as [R120–R139](../spec/resolutions.md#gathertube-r120r139) and every GatherTube item mapped in [09 §4](../spec/09-parity.md#4-gathertube).

- **The feature:** one opt-in YouTube feature, "Doesn't change the page", credited to GatherTube by Karim Elgazar. No new permission and nothing copied.
- **Destinations:** YouTube's player for up to 50 videos; YouTube's queue in place of the embedded player, and for anything over 50; the gather playlist, one per account, through the add flow as one batch, with Undo that reopens the closed tabs.
- **Orders:** GatherTube's six, plus Shuffled. The language orders use the browser's own detection.
- **Automatic gathering:** all three triggers, each its own choice, all off, each saving into the gather playlist and closing what it saved. They meet [ticket 33](33-resource-mindful-defaults.md)'s constraints (Q-PERF-58), which supersede the hourly alarm below:
  - **unvisited for a while** (a day by default) is checked only when something already wakes the background, so it can run late, and says so;
  - **opened in the background** is learnt from the site core's `tab.hello`, registered on watch and live pages only while this trigger or the next is on;
  - **a window reaching N video tabs** defaults to 10.
- **Constraints kept:** never the tab the user is on, pinned or audible tabs, or private windows; one gather per burst, at most once a minute per window and 50 videos a round; no alarm, no tab listener; one `tabs.remove`.
- **Live checks added to [ticket 25](25-live-checks.md):** G1 to G7.

### The user's answers (2026-10-20)

1. **The player page:** YouTube's own queue, plus a **Shuffled** gather order, so GatherTube's shuffle survives.
2. **The automatic option:** **all three triggers**, each its own opt-in choice:
   - video tabs left unopened for a while (default a day), checked by one hourly alarm (superseded: no alarm, it's checked when something already wakes the background; R129);
   - a video tab opened in the background;
   - a window reaching N video tabs.

   Every trigger saves into the gather playlist. Each must meet [ticket 33](33-resource-mindful-defaults.md)'s running-cost budgets, which rules out waking on every new tab of every site.
3. **Closing:** automatic gathering always closes what it saved (decided on the user's behalf, as recommended).
4. **Suspender-parked tabs** aren't gathered; no `tabs` permission (decided on the user's behalf, as recommended).

### Questions for the user (answered above)

1. **What replaces GatherTube's embedded player?** Recommended: YouTube's own queue. It loses Shuffle inside the queue, surviving a reload, and the player page's own keys. The alternatives are dropping that destination, or an embed that needs a faked Referer and breaks ADR-0001's footing.
2. **Which automatic option?** Recommended: gather video tabs not opened for a day into the gather playlist, checked hourly. The others are: on opening in the background, at N tabs, on window close, and on browser start.
3. **Does the automatic option always close what it gathers?** Recommended: yes.
4. **Accept that tabs parked by a suspender extension aren't gathered?** Gathering them would need the `tabs` permission and its "Read your browsing history" warning. Recommended: yes, accept it.
