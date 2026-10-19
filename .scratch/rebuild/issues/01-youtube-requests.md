# Which YouTube-internal requests can do each job?

Type: research
Status: open
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

For each job 2.0 has to do, which request does YouTube's own web client send, and can the extension send it through the user's signed-in session?

- List the user's playlists, including Watch Later, with what a picker needs (title, thumbnail, video count, privacy), and say which of them already contain a given video.
- Add a video to a playlist, and remove it again (undo).
- Create a playlist (title, privacy).
- Add a video to the queue (today: `addToPlaylistCommand` through `resolveCommand`, see inventory.md).
- Read a video's channel: ID, name, handle (today: `#movie_player.getPlayerResponse()`).
- Resolve a typed `@handle`, `/channel/`, `/c/` or `/user/` URL to a channel ID. `/c/` URLs have no Data API lookup today.
- Tell whether anyone is signed in, and which account and channel. Cover how YouTube tells Google accounts (`authuser`), brand accounts and channels apart.
- Whatever Shorts needs (video ID, playback progress) where it differs from watch pages.

For each job, cover:
- **Request:** the endpoint or command, and the request and response fields we'd rely on.
- **Auth:** what it takes, e.g. the page's own client, a `SAPISIDHASH` header, or `ytcfg` values such as the API key, client name and version, and visitor data.
- **Limits:** any rate limits seen.
- **Stability:** how long it has existed, and its breakage history as seen in youtubei.js, yt-dlp, NewPipe, Invidious and extensions that do this.

Also say whether going through YouTube's own client machinery (`resolveCommand`, the page's network layer) is sturdier than hand-built requests. Flag anything that can't be done locally.

Constraint: never drive YouTube's visible UI. Where the requests are sent from is [ticket 02](02-request-context.md)'s question.
