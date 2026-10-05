# Spec: per-playlist channel filters

Assembled 2026-10-05 from the [Channel filters](map.md) map. Every statement below traces to the map's Notes or a resolved ticket; nothing here is newly decided. Terms are as defined in `GLOSSARY.md`.

## Summary

Each **auto-add playlist** can have a **channel filter**, in **allowlist mode** (only **listed channels** are auto-added) or **denylist mode** (listed channels are never auto-added). Filters change **auto-add** only. The keyboard shortcut, Add to queue and the card menu are explicit actions and are never filtered.

## Behaviour

### Filter rules

- One channel filter per auto-add playlist, in allowlist or denylist mode. A playlist never has both an allowlist and a denylist.
- A filter is either switched on or switched off. Off is not a third mode: a filter that is off lets every channel through but keeps its mode and its listed channels.
- A listed channel is identified by its `UC…` channel ID. Handle and display name are labels, never used for matching.
- Allowlist mode with no listed channels auto-adds nothing to that playlist. This follows from the definition of allowlist mode.
- **Unknown channel** (the channel can't be resolved; see Channel resolution): a denylist-mode playlist still receives the video, and an allowlist-mode playlist skips it.
- A video reassigned to another channel gets no special handling. The filter checks the video's channel at the moment auto-add fires.

### Auto-add flow (background)

All of this happens in the background's `addVideoToPlaylists` handler, before it calls the shared `addToPlaylists`. The shortcut handler also calls `addToPlaylists` but never passes through this step, so filtering stays auto-add-only by construction. The message stays `{action: "addVideoToPlaylists", videoId}`.

1. Run the existing local duplicate check per auto-add playlist.
2. If none of the remaining playlists has a filter that is switched on, add exactly as today. No lookup, no quota.
3. Otherwise resolve the video's channel once (see Channel resolution).
4. Apply each remaining playlist's filter, including the unknown-channel rule.
5. Add to the playlists that pass, through `addToPlaylists`.
6. If the channel was resolved and is listed on any filter, update its stored title (and its handle, if the bridge supplied one).

### Channel resolution

One resolver in the background, used by both auto-add and the popup:

1. **Cache:** `videoId → {channelId, title, handle?}` in `storage.session`. It survives MV3 service worker restarts and is cleared when the browser closes (Firefox 115+; the floor is 125).
2. **Free bridge read:** the background asks the content script in the video's tab to read `#movie_player.getPlayerResponse()` through the existing MAIN-world bridge (`yt-queue-bridge.ts`, string-only payloads). The result is accepted only if `videoDetails.videoId` equals the requested videoId. It provides the channel ID, author, and the handle via `ownerProfileUrl`.
3. **Fallback:** if the bridge result is missing, mismatched or times out, call Data API `videos.list?part=snippet&id=<videoId>`. This costs 1 unit (against 50 per `playlistItems.insert`), needs no new scope beyond `youtube.force-ssl`, and returns `channelId` and `channelTitle` but no handle.
4. If both fail, the channel is **unknown**. Unknown covers network or API errors, an empty result for a private, deleted or region-blocked video, and a 401 that still fails after `authedFetch`'s single retry. There are no extra retries.

Successful results are written to the cache.

Accepted risk: the bridge reads page-controlled data. The videoId check catches staleness, not spoofing, and a spoofed channel only affects the user's own auto-add.

### Typed channel input

When a user types a channel into a filter:

- A `/channel/UC…` URL or a bare `UC…` ID is parsed offline. It's then checked with `channels.list?id=` to fill in the title and handle.
- `@handle` or `youtube.com/@handle` resolves with `channels.list?forHandle=`. The `@` is optional, and the call costs 1 unit.
- `/user/name` resolves with `channels.list?forUsername=`.
- `/c/name` is rejected: "Custom /c/ URLs can't be looked up. Paste the channel's @handle or /channel/ URL."

Two things the research inferred but didn't confirm should be checked during implementation: `videos.list` working with the bearer token alone, and `snippet.customUrl` holding the `@handle`. If `customUrl` isn't the handle, keep the handle the user typed.

## Storage

Everything lives in `storage.local`, like every other feature setting. Nothing syncs, and there is no SQLite. Key names below are suggestions.

- **Channel filters:** keyed by playlist ID → `{ mode: "allow" | "deny", enabled: boolean, channels: channelId[] }`. A list always belongs to its `mode`, including while `enabled` is false.
- **Channel labels:** one store shared by all playlists, keyed by channel ID → `{ title, handle? }`. A label record is removed once no filter (orphans included) lists that channel ID.
- **Channel cache:** `storage.session`, keyed by videoId (see Channel resolution).

### Lifecycle

- **Playlist unchecked as an auto-add playlist:** its filter is kept and inactive, and applies again unchanged when the playlist is re-checked.
- **Playlist renamed on YouTube:** no effect, because filters are keyed by playlist ID.
- **Playlist deleted, or missing from a refresh:** the filter is kept as an orphan and never pruned automatically. Orphans aren't shown anywhere.
- **Clear All Data:** filters and labels go with `storage.local`. `clearAll()` also clears `storage.session` (new).
- **Sign out, or a different Google account:** no special handling. Filters for another account's playlist IDs stay dormant and come back if the user switches back.

## Popup UI

These changes go in the popup's existing **Auto-add playlists** section. The design is a combination of prototype variants C and A (prototype on branch `prototype/channel-filter-ui`).

### Channel card (top of the section)

- The card is about this video's channel, shown as "Title · @handle", and has no input box.
- **When it appears:** the popup asks the active tab's content script for its `currentVideoId()`. This means adding a message listener to the content script, which today only handles `showToast`.
  - If the message fails (non-YouTube tab) or the reply is empty (home, search, Shorts), the card is hidden.
  - So the card appears exactly where auto-add can fire.
- **Channel lookup:** the popup sends one message (e.g. `getChannelForTab`) with the tab's ID. The background runs the shared resolver.
  - While it runs, the card shows "Looking up channel…" with the buttons disabled.
  - If the lookup fails, the card shows "Channel unknown" with the buttons disabled.
- **Each checked auto-add playlist** gets Allow and Deny buttons:
  - On a playlist whose filter is off, both buttons are active:
    - the button for the remembered mode (or either one, if the list is empty) switches the filter on in that mode and lists the channel, keeping any kept channels;
    - the other mode's button, when the kept list has channels, first asks (e.g. "Turn on Allow only for Music? This clears its 3 denied channels."). If confirmed, the filter is switched on in that mode with a new list holding just this channel.
  - On a playlist whose filter is on, only its mode's button is active. The other is greyed out, with a tooltip naming the playlist's mode.
  - Clicking the active button while the channel is listed removes it from the list.

### Playlist rows

- Each checked auto-add playlist row shows a label: "Allow only · N" or "Deny · N" when the filter is on; "All channels" when it is off, extended to "All channels · N denied kept" (or "· N allowed kept") when it is off with a non-empty list. The label is hidden for unchecked playlists.
- Clicking the label opens an editor inline under the row, containing:
  - an Off / Allow only / Deny switch, with a one-line hint for the current mode;
  - the listed channels as removable tags ("Title · @handle");
  - an "add this video's channel" button;
  - the only box for typing an `@handle` or channel URL (see Typed channel input).
- **Mode changes:**
  - The switch keeps its three positions (Off / Allow only / Deny); Off switches the filter off rather than setting a mode.
  - Switching between Allow only and Deny clears the list, after a confirmation.
  - Switching to Off keeps the list and its mode. Turning the filter back on in the same mode restores the list unchanged.
  - Turning it back on in the other mode is treated like a direct Allow↔Deny switch: confirmation, then the list is cleared.
  - Confirmation is asked only when the list has at least one channel. With an empty list, the remembered mode is only a default.

## Feedback

- Today's per-playlist toasts for added and duplicate playlists are unchanged.
- **Filtered playlists:** one extra toast per auto-add covers every playlist a filter blocked, naming the channel and the playlists (titles from `cachedPlaylists`), e.g. "Lofi Girl filtered out of Learning, Cooking". If every playlist was filtered, this is the only toast.
- **Unknown channel:** denylist-mode playlists show their normal "Added" toast. Skipped allowlist-mode playlists get one toast, e.g. "Couldn't identify the channel, so it was skipped for Music".
- **Toasts off:** nothing is shown. The background logs each filter decision with `console.info("[YT Playlist Tools]: filtered …")`.
- The README's "Planned: channel denylist." becomes a features entry for per-playlist channel filters.

## Out of scope

- Filtering explicit adds (shortcut, Add to queue, card menu).
- Hiding or de-ranking a channel's videos on YouTube pages.
- Syncing settings across browsers.
- Auto-add on Shorts. `currentVideoId()` reads only `?v=`, so auto-add doesn't fire on Shorts today, and the channel card follows the same rule.

## Sources

- Decisions: [map](map.md) Notes and Decisions so far; tickets in `issues/01`–`07` and `issues/09`.
- Research: `docs/research/channel-source.md` on branch `research/channel-source`.
- UI prototype: branch `prototype/channel-filter-ui`.
