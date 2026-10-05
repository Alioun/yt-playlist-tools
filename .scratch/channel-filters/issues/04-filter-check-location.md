# Where does the channel filter check run?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Channel filters](../map.md)
Blocked by: 01

## Question

Where in the auto-add pipeline is a video checked against each playlist's channel filter, and how does the channel reach that point? For example, the content script attaches the channel to the `addVideoToPlaylists` message and the background filters per playlist, or the background looks the channel up itself.

## Comments

- 2026-10-04: The research recommendation ("if the API also fails, skip channel rules", in `docs/research/channel-source.md` on `research/channel-source`) conflicts with the unknown-channel rule settled while charting (map Notes): a denylist-mode playlist still receives the video, an allowlist-mode playlist skips it. The charting rule stands; resolve the failure path to match it.

## Answer

Resolved with the user, 2026-10-05.

- **Location:** the background's `addVideoToPlaylists` handler narrows the auto-add playlists through their channel filters, then calls the shared `addToPlaylists`. The shortcut handler shares `addToPlaylists` (`background.ts:43`) but never goes through the filter step, so filtering stays auto-add-only by construction. The message stays `{action, videoId}`.
- **Order of work:** (1) run the existing local duplicate check per playlist; (2) if none of the remaining playlists has a filter that isn't Off, add as today with no lookup; (3) otherwise resolve the channel once; (4) apply each playlist's filter; (5) add to the playlists that pass.
- **Channel resolution, free path first:**
  1. The background asks the content script in the sending tab to read `#movie_player.getPlayerResponse()` through the existing MAIN-world bridge (`yt-queue-bridge.ts`, string-only payloads). The result is accepted only if `videoDetails.videoId` equals the message's videoId. It gives the channel ID, title, and the handle via `ownerProfileUrl`, at no quota cost.
  2. If that is missing, mismatched or times out, call `videos.list?part=snippet&id=<videoId>` (1 unit; channel ID and title, no handle).
  - Accepted risk: the bridge reads data the page could tamper with. The videoId check catches staleness, not spoofing, and a spoofed channel only affects the user's own auto-add.
- **Unknown channel** (both sources fail: network or API error, empty result for a private, deleted or region-blocked video, or a 401 still failing after `authedFetch`'s one retry): denylist-mode playlists still get the video and allowlist-mode playlists skip it, as settled while charting. No extra retries. This replaces the research's "skip channel rules" suggestion.
- **Cache:** `videoId → {channelId, title, handle?}` in `storage.session`, which survives MV3 service worker restarts and is cleared when the browser closes (Firefox 115+, floor is 125). It is checked before step 3.
- **Label refresh:** after a successful resolution, if the channel is listed on any filter, update its stored title (and its handle, when the bridge supplied one). This is where the refresh decided in "What identifies a channel in a filter entry?" happens.
