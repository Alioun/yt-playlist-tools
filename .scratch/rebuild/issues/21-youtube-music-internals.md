# Which YouTube Music internals can do each music action?

Type: research
Status: resolved
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

On music.youtube.com, how can the extension do the actions users reach for through YouTube Music's ⋮ menu in one click or one key, without driving the visible UI? This covers desktop web, plus the installed YouTube Music app window in Chrome and Edge.

The actions:
- **Queue:** Play next (insert after the current song) and Add to queue (append to the end), for a song, an album and a playlist. Also removing an item from the queue.
- **Library:** Save to playlist, including which playlists already contain the song. Like and unlike.
- **Navigation:** Start radio, Go to artist, Go to album. These are mainly to learn what's possible.
- **Now playing:** which song is playing, and how far along it is.

For each action:
- **Command:** the command or endpoint the YouTube Music web app dispatches, for example menu items' `queueAddEndpoint`, `playlistEditEndpoint` or `likeEndpoint`.
- **Dispatch:** how a page script can send the same command through the app's own machinery (as Add to queue on YouTube uses `resolveCommand`), compared with a hand-built `youtubei/v1` request using the `WEB_REMIX` client.
- **Row data:** where the command data lives on song rows and cards (renderer element names, data properties), so inline buttons can act on any row.

Also cover:
- YouTube Music's own keyboard shortcuts, so ours don't clash.
- Whether content scripts and the toolbar action work in the installed YouTube Music app window (Chrome and Edge PWA), and on Firefox.
- Stability and breakage history, as seen in ytmusicapi, youtubei.js's YTMusic support and YouTube Music browser extensions.
- Anything that can't be done this way.

[Ticket 01](01-youtube-requests.md) covers the same questions for youtube.com.

## Answer

Every action works from a page script except casting, but the queue needs more than sending YouTube Music's command. Full findings: [`docs/research/youtube-music.md`](https://github.com/Alioun/yt-playlist-tools/blob/research/youtube-music/docs/research/youtube-music.md) on branch `research/youtube-music`. A signed-in console check is in `docs/research/youtube-music/live-check.js`.

- **Play next / Add to queue:** sending the menu item's command through `resolveCommand` only makes the request; nothing gets queued. The queue lives in the tab's app state. The extension has to repeat what the menu handler does:
  1. Call `ytmusic-app.networkManager.fetch("/music/get_queue", …)`.
  2. Add the returned items to the queue state at the right position, or start playback if the queue is empty.

  Pear Desktop (the open-source YouTube Music desktop client) has done this since 2024-12. **Remove from queue** uses `app.queue.removeItem(itemId)`, which also keeps the server-side queue copy in step.
- **Other actions** go through handlers on `ytmusic-app`:
  - `handleServiceEndpoint` (like, unlike, dislike, save to library);
  - `handlePlaylistEditEndpoint` (save to a known playlist);
  - `handleNavigationEndpoint` (radio, artist, album);
  - `handleAddToToastAction` (YouTube Music's own toast).
- **Likes** must go through the page handler: YouTube attaches a bot-check challenge to each like and drops likes without one.
- **Row data** is on each renderer's `data` property (`ytmusic-responsive-list-item-renderer`, `ytmusic-two-row-item-renderer`, queue items), readable only from a page script. Match menu items by command type, not position or label.
- **Now playing:** title, artist and album come from `navigator.mediaSession.metadata`, progress from the `<video>` element, and the video ID from `#movie_player.getVideoData()` (page script).
- **YouTube Music's own shortcuts:**
  - Space, `;`, j, k, l, h, s, r, =, -, m, q, Esc, f, +, _, ?, / and g-sequences, plus a few Shift and Ctrl+Shift combinations.
  - It ignores keys held with Alt, Ctrl or Meta unless one of its bindings uses that modifier, so **every Alt combination is free on its side**.
- **The installed app (unconfirmed live):**
  - **Chrome and Edge:** extensions show in the app's title bar (Edge: under its menu), and the popup and keyboard commands reach the app window. The side panel doesn't open there.
  - **Firefox:** only Windows has web-app windows (143+).
- **Can't be done:**
  - Queue anything without an open YouTube Music tab.
  - Forward to a cast session.
  - Hand-build signed-in requests without reading cookies.
  - Get playlist membership from YouTube Music's client: it never reads it. Fall back to youtube.com's answer from [ticket 01](01-youtube-requests.md), since it's the same library.
- **Risk:** YouTube Music has been A/B testing a new player UI since 2026-09-29 that removes the player bar and its like button. It already broke Pear Desktop, ytmdesktop, Web Scrobbler and a hotkeys extension. In-page controls must not depend on the player bar.
- **Map wording:** the map's "send the requests YouTube's own UI sends" was widened to "use YouTube's own client machinery". On YouTube Music the queue means writing into the app's queue state the way its menu handler does. That's still not driving the visible UI.
