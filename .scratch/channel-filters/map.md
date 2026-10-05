# Channel filters

Labels: wayfinder:map

## Destination

A spec at `.scratch/channel-filters/spec.md` for per-playlist channel filters on auto-add, with every decision settled, ready to hand to `/to-tickets` or an implementer.

## Notes

- Domain: the auto-add pipeline (`src/entrypoints/youtube.content.tsx` watcher → `addVideoToPlaylists` message → `src/entrypoints/background.ts`). Vocabulary in `GLOSSARY.md` (channel filter, allowlist mode, denylist mode).
- Skills: grilling tickets call `grilling` + `domain-modeling`; research tickets call `research`.
- Settled while charting (2026-10-04):
  - Filters apply to **auto-add only**. The keyboard shortcut, Add to queue and the card menu are explicit actions and are never filtered.
  - **One channel filter per auto-add playlist**, in either allowlist mode or denylist mode (never both lists on one playlist).
  - **Unknown channel**: a denylist-mode playlist still receives the video; an allowlist-mode playlist skips it. A toast explains either case.
  - Filters live in `storage.local`, like every other feature setting. No SQLite: the data is a few KB, and a WASM database would add bundle weight, AMO review surface and MV3 persistence problems for no gain.
- Fact: today the extension knows nothing about a video's channel. Only `videoId` (from `?v=`) reaches the background, and there is no `videos.list` call.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md): gist -->

- [How can the extension learn the current video's channel?](issues/01-channel-source.md): `videos.list?part=snippet` from the background (1 unit, no new scope); typed `@handle`s resolve with `channels.list?forHandle=`, and `/c/` URLs have no API lookup. Detail on branch `research/channel-source`.
- [What identifies a channel in a filter entry?](issues/02-channel-identity.md): the `UC…` channel ID; title and optional handle are labels, kept once in a store shared by all playlists; the title is refreshed for free on each auto-add lookup.
- [How does a user set up a playlist's channel filter?](issues/03-filter-ui.md): in the popup, a card for this video's channel with Allow / Deny per auto-add playlist, plus an inline editor on each playlist row (mode, listed channels, handle box). Switching between Allow and Deny clears the list after a confirmation. Prototype on branch `prototype/channel-filter-ui`.
- [Where does the channel filter check run?](issues/04-filter-check-location.md): in the background's auto-add handler, after the duplicate check and only when a playlist has a filter. The channel comes from the free bridge read first, with `videos.list` as fallback, cached in `storage.session`.
- [How does the popup learn the channel of the video in the active tab?](issues/05-popup-current-channel.md): it reuses auto-add's lookup through the background. The card shows only where the content script reports a current video, with "Looking up channel…" until the lookup finishes.
- [What happens to a channel filter when its playlist changes?](issues/06-filter-lifecycle.md): filters are kept when a playlist is unchecked, deleted, renamed or you sign out, and are never pruned automatically. Clear All Data removes them and now also clears the `storage.session` channel cache.
- [What does auto-add tell the user when a channel filter skips a video?](issues/07-skip-feedback.md): today's toasts stay; one extra toast names the channel and every playlist it was filtered out of, with a separate wording for an unknown channel. With toasts off, filter decisions are only logged to the console.
- [Write the channel filters spec](issues/08-write-spec.md): `spec.md` assembled from all answers; one gap (re-enabling a kept list in the other mode) went back on the map as a ticket.
- [What does a kept list mean when a filter is turned back on in the other mode?](issues/09-off-list-mode.md): Off is an on/off switch, not a mode, so a kept list keeps its mode; turning on in the other mode asks before clearing (only if the list has channels), from the row or the card.

## Not yet specified


## Out of scope

- Filtering explicit adds (shortcut, Add to queue, card menu): ruled out while charting; explicit actions are never overridden.
- Hiding or de-ranking a channel's videos on YouTube pages: a content filter, not a playlist tool.
- Auto-add on Shorts: `currentVideoId()` reads only `?v=`, so auto-add never fires on Shorts today. That's an existing gap, not part of channel filters.
- Syncing settings across browsers: all feature settings are per-device today; moving them to `storage.sync` would be its own effort.
