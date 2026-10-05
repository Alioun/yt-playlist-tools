# How does the popup learn the channel of the video in the active tab?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Channel filters](../map.md)

## Question

The channel card (see How does a user set up a playlist's channel filter?) needs the current video's channel each time the popup opens on a watch page. How does the popup get it?
- Ask the content script for the videoId, then have the background call `videos.list` (1 quota unit per popup open, documented, no handle).
- Ask the content script to read `#movie_player.getPlayerResponse()` through the MAIN-world bridge (free, includes the handle, undocumented).
- Use one with the other as a fallback, and cache the result per videoId.

Also decide whether this shares a code path or a cache with the lookup auto-add does (Where does the channel filter check run?).

## Comments

- 2026-10-05: Where does the channel filter check run? resolved auto-add's lookup as bridge `getPlayerResponse()` first (videoId-checked), `videos.list` as fallback, cached per videoId in `storage.session`. The popup can likely reuse that path and cache; this ticket decides whether it does, and what the card shows while it resolves.

## Answer

Resolved with the user, 2026-10-05.

- **One lookup, owned by the background:** the popup sends a single message (e.g. `getChannelForTab`) with the active tab's ID. The background runs the same lookup auto-add uses (see Where does the channel filter check run?): `storage.session` cache, then the free bridge read in that tab (videoId-checked), then `videos.list`. The card and auto-add can't disagree, and a lookup the popup pays for is cached for auto-add too.
- **Is there a current video?** The background (or popup) asks the tab's content script for its `currentVideoId()`. A failed `tabs.sendMessage` (non-YouTube tab) or an empty reply (home, search, Shorts) hides the card, so the card appears exactly where auto-add can fire. The content script gains a message listener for this; today it only handles `showToast`.
- **While resolving:** the card shows "Looking up channel…" with the Allow / Deny buttons visible but disabled. The rest of the popup renders straight from cache. If the lookup fails, the card switches to "Channel unknown".
