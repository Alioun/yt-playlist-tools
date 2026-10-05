# 11: Denylist mode, end to end

**What to build:** the tracer bullet. A user opens the popup on a watch page, opens the row editor of a checked auto-add playlist, switches it to Deny and adds this video's channel. The next time auto-add fires on a video from that channel, that playlist is skipped and other playlists still get the video. One toast says so, e.g. "Lofi Girl filtered out of Learning". With toasts off, the decision is only logged via `console.info`.

What it covers, end to end:

- **Storage:** channel filters keyed by playlist ID, and one channel label store, shared by all playlists and keyed by channel ID. A label is removed once no filter lists that channel, orphaned filters included. The decided shape:
  ```ts
  // storage.local, keyed by playlist ID
  { mode: "allow" | "deny", enabled: boolean, channels: channelId[] }
  // storage.local, keyed by channel ID
  { title: string, handle?: string }
  ```
  This ticket only needs Deny and on/off. Allow arrives in ticket 12.
- **Channel lookup:** one background resolver, shared by auto-add and the popup:
  - It checks the cache first (`videoId → { channelId, title, handle? }` in `storage.session`), then calls `videos.list?part=snippet` (1 unit).
  - If both fail, the channel is unknown. There are no extra retries.
  - In deny mode, an unknown channel's video is still added.
- **Auto-add:** the lookup runs only if a remaining playlist has a filter switched on. Otherwise behaviour and quota use are exactly as today.
- **Popup:**
  - The content script answers a `currentVideoId` request. Today it only handles `showToast`.
  - The popup asks the background to resolve the channel for the active tab (`getChannelForTab`).
  - The row label ("All channels" / "Deny · N") opens an inline editor containing:
    - an Off / Deny switch with a one-line hint;
    - the listed channels as removable tags ("Title · @handle");
    - an "add this video's channel" button.
- **Clear All Data** also clears `storage.session`.
- **Keeping filters:** a filter is kept when its playlist is unchecked, and kept as an orphan when the playlist disappears. Filters are never pruned automatically.

**Blocked by:** 10 (Separate auto-add from the shortcut path)

**Status:** ready-for-agent

**Base branch:** `main` if [Alioun/yt-playlist-tools#2](https://github.com/Alioun/yt-playlist-tools/pull/2) (WXT migration) has merged. Otherwise stack on ticket 10's branch and retarget to `main` once it merges. One branch and one PR for this ticket.

**Spec:** [Per-playlist channel filters](../spec.md), sections "Filter rules", "Auto-add flow", "Channel resolution", "Storage", "Playlist rows" and "Feedback". Terms are as defined in `GLOSSARY.md`.

- [x] Denying a channel on a playlist stops auto-add to that playlist for that channel's videos. Other playlists are unaffected.
- [x] No channel lookup and no extra API call happen when no remaining playlist has a filter switched on.
- [x] The resolver caches in `storage.session`, so a second auto-add of the same video makes no `videos.list` call.
- [x] Unknown channel in deny mode: the video is still added.
- [x] Each auto-add shows one "filtered out of …" toast naming every blocked playlist, using titles from the cached playlists. With toasts off, it only logs with `console.info`.
- [x] Removing the last use of a channel removes its label record.
- [x] Clear All Data clears `storage.session` too.
- [x] Unit tests for the filter decision, the resolver's order and caching, and label cleanup. A popup test for the editor.
- [ ] **Live check:** `videos.list` works with the bearer token alone and returns `channelId` and `channelTitle`.
  - Run it in the built-in browser on a dev build.
  - Pause any video you start and close the tab when done.
  - If no signed-in YouTube session is available, give the user the check as a checklist rather than skipping it.
- [ ] `bun run compile` and the full test suite pass.

## Comments

2026-10-05: implemented on branch `feat/channel-filters-denylist`, based on `main` (PRs #2 and #3 have merged).

- Filter decision, resolver and label cleanup: `src/lib/channel-filters.ts`. Storage items: `channelFilters`, `channelLabels` (local) and `channelCache` (session) in `src/lib/storage.ts`.
- The popup sends `{action: "getChannelForTab", tabId, videoId}`. `tabId` is unused until ticket 13's page read.
- The live check is still open: it needs a signed-in dev build, which the agent could not drive.
- `bun run compile` passes. The full suite has 291 tests; the only failure is the options page's "offers one-click sign in" timing flake, which also fails on `main`.

2026-10-05, decisions settled with the user while grilling the implementation:

- `getChannelForTab` carries both `tabId` and `videoId`; ticket 13 starts using `tabId`.
- Filter decisions are logged with `console.info` every time, not only with toasts off.
- With the filter Off, the editor shows the kept list read-only and dimmed ("Kept for when Deny is back on").
- With no video in the tab, the editor shows "Open a YouTube video to add its channel." instead of the add button.
- A blocked playlist missing from the cached playlists is named by its ID in the toast.
- `GLOSSARY.md` gained **Channel label** and **Orphaned filter**.
