# How can the extension learn the current video's channel?

Type: research
Status: resolved
Labels: wayfinder:research
Part of: [Channel filters](../map.md)

## Question

When auto-add fires, how can the extension reliably learn the channel (channel ID, plus handle and display name) of the video being watched, and how can a channel the user types in (an `@handle` or channel URL) be resolved to the same identifier?

Compare the candidate sources on reliability across YouTube's SPA navigation (stale data after `yt-navigate-finish`), Chrome MV3 + Firefox MV3 support, extra permissions or OAuth scope, YouTube Data API quota cost, and latency:

- page data such as `ytInitialPlayerResponse.videoDetails.channelId` / the player's response (and whether it needs the MAIN world, as `yt-queue-bridge.ts` does)
- the watch page DOM (owner link / channel name)
- Data API `videos.list?part=snippet` (`snippet.channelId`, `snippet.channelTitle`)
- for typed input: Data API `channels.list` with `forHandle` / `id`, or parsing the channel URL

Findings: branch `research/channel-source`, file `docs/research/channel-source.md`

## Answer

**Watched video:** the background calls Data API `videos.list?part=snippet&id=<videoId>` with the videoId already in the `addVideoToPlaylists` message. It returns `channelId` + `channelTitle` (no handle), costs 1 quota unit (vs 50 per `playlistItems.insert`), works on Chrome and Firefox MV3, and needs no new permission or scope (`youtube.force-ssl` covers it). It can't go stale, because the videoId is fixed when the watcher arms. Optional zero-quota alternative: ask the MAIN-world bridge for `#movie_player.getPlayerResponse()` (channel ID, author, handle via `ownerProfileUrl`), accepted only if its videoId matches. Every other page source (`ytInitialPlayerResponse`, microdata, canonical link, owner-link DOM) goes stale or lags on SPA navigation, and the owner link never carries the `UC…` ID.

**Typed channel:** `/channel/UC…` and bare IDs parse offline. `@x` / `/@x` → `channels.list?forHandle=` (1 unit); `/user/x` → `forUsername=`; `/c/x` has no API filter (fetching the page for its canonical link works but is undocumented and only works from the youtube.com content script).

**Bearing on later tickets:** a video's `channelId` "can change over time" per the docs, and the channel ID is the only stable key; handle and name are display labels (→ What identifies a channel in a filter entry?). `/c/` URLs may need to be unsupported or handled specially (→ How does a user set up a playlist's channel filter?).

**Open risks:** page-internals findings come from one Chromium session (not checked on Firefox); `videos.list` with the bearer token alone (no API key) and `customUrl` holding the handle are inferred, not yet exercised.
