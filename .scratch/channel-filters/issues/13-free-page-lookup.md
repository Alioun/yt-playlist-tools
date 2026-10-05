# 13: Free channel lookup through the page

**What to build:** the resolver tries the page before the API.

- The background asks the content script in the video's tab to read `#movie_player.getPlayerResponse()` through the existing MAIN-world bridge. The bridge passes only strings.
- The result counts only if `videoDetails.videoId` equals the requested videoId. It supplies the channel ID, the author name, and the handle (from `ownerProfileUrl`).
- If the result is missing, mismatched, or times out, the resolver falls back to `videos.list`.
- After a resolved auto-add, if the channel is listed on any filter, its stored title is refreshed. So is its handle, when the page supplied one.

In normal use, filtering auto-adds then costs no quota.

Accepted risk: the page controls this data. The videoId check catches stale data, not spoofing. A spoofed channel only affects the user's own auto-add.

**Blocked by:** 11 (Denylist mode, end to end)

**Status:** ready-for-agent

**Base branch:** `main` if [Alioun/yt-playlist-tools#2](https://github.com/Alioun/yt-playlist-tools/pull/2) (WXT migration) has merged. Otherwise stack on ticket 11's branch and retarget to `main` once it merges. One branch and one PR for this ticket.

**Spec:** [Per-playlist channel filters](../spec.md), "Channel resolution" and auto-add step 6. Terms are as defined in `GLOSSARY.md`. Research: `docs/research/channel-source.md` on branch `research/channel-source`.

- [x] The resolver's order is cache → page read (videoId-checked) → `videos.list` → unknown.
- [x] A mismatched videoId, such as from a stale player after in-app navigation, is rejected and the resolver falls back.
- [x] Handles are captured and shown as "Title · @handle".
- [x] Listed channels' labels are refreshed after a resolved auto-add.
- [x] Unit tests for accepting and rejecting bridge results, the timeout fallback, and the label refresh.
- [ ] **Live check:** on real watch pages, including after in-app navigation between videos, the page read returns the right channel and no `videos.list` call is made.
  - Run it in the built-in browser on a dev build.
  - Pause any video you start, and close the tab when done.
  - If no signed-in YouTube session is available, give the user the check as a checklist rather than skipping it.
- [x] `bun run compile` and the full test suite pass.

## Comments

2026-10-05: implemented on branch `feat/channel-filters-page-lookup`, based on `main` (#20 has merged).

- The bridge (`yt-queue-bridge.ts`) answers `ytpt:read-player` with the player's `videoId`, `channelId`, `author` and `ownerProfileUrl`, all strings. The content script asks it on `{action: "readPlayerChannel"}` and replies `{ page }`.
- `src/lib/page-channel.ts` holds both halves: `readPlayerChannel()` for the content script, and `channelFromPage(videoId, page)`, which the resolver uses to accept or reject a read. A read is rejected unless its videoId matches and its channel ID starts with `UC`.
- `resolveVideoChannel(videoId, readFromPage?)` goes cache → page → `videos.list`. The page gets 1.5 s (`PAGE_READ_TIMEOUT_MS`); the bridge client itself gives up after 1 s. Auto-add and `getChannelForTab` both pass a reader for their tab.
- `refreshListedLabel(channel)` runs in `withoutFilteredOut` right after the channel resolves. It updates the title, and the handle only when this lookup found one, so a `videos.list` fallback never erases a handle. A failed refresh is logged and doesn't stop the add.
- Partial live check, 2026-10-05, in the built-in browser with the built bridge script run in the page (it can't load the extension): a cold load of `jNQXAC9IVRw` read `@jawed`. Right after an in-app click to another video the player still reported `jNQXAC9IVRw`, which the videoId check rejects; 4 s later it reported the new video and `@KatieCouric`. A second hop read correctly too. The part that needs the extension (no `videos.list` call during a real auto-add) is a checklist in the PR.
