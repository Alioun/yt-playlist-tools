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

- [ ] The resolver's order is cache → page read (videoId-checked) → `videos.list` → unknown.
- [ ] A mismatched videoId, such as from a stale player after in-app navigation, is rejected and the resolver falls back.
- [ ] Handles are captured and shown as "Title · @handle".
- [ ] Listed channels' labels are refreshed after a resolved auto-add.
- [ ] Unit tests for accepting and rejecting bridge results, the timeout fallback, and the label refresh.
- [ ] **Live check:** on real watch pages, including after in-app navigation between videos, the page read returns the right channel and no `videos.list` call is made.
  - Run it in the built-in browser on a dev build.
  - Pause any video you start, and close the tab when done.
  - If no signed-in YouTube session is available, give the user the check as a checklist rather than skipping it.
- [ ] `bun run compile` and the full test suite pass.
