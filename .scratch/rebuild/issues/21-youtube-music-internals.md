# Which YouTube Music internals can do each music action?

Type: research
Status: open
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
