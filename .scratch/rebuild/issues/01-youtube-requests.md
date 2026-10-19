# Which YouTube-internal requests can do each job?

Type: research
Status: resolved
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

## Answer

Every job has a request that goes through the user's own session, so nothing needs the Data API and ADR-0001 holds. Full findings: [`docs/research/youtube-requests.md`](https://github.com/Alioun/yt-playlist-tools/blob/research/youtube-requests/docs/research/youtube-requests.md) on branch `research/youtube-requests`, with `probe.mjs` (signed-out probes) and `bundle-check.mjs` (checks the live YouTube client still contains everything relied on; it passed on 2026-10-19).

- **Playlists, Watch Later and membership:** `playlist/get_add_to_playlist`, the Save dialog's own request, lists every playlist with Watch Later, privacy, and whether it holds the video. Thumbnails and counts need a second request (`browse` `FEplaylist_aggregation`).
- **Add and undo:** `browse/edit_playlist` with `ACTION_ADD_VIDEO`. Undo removes the exact entry the add returned. A failure comes back as HTTP 200 with `STATUS_FAILED`, so read `status`, not the HTTP code.
- **Create a playlist:** `playlist/create` returns the new ID. It's rate-limited: YouTube Music returned 429 after about 20 in 15 minutes (2020 report), and public creation is capped per day. New playlists can take minutes to show up in listings.
- **Queue:** 1.5.0's command is right; YouTube turns it into a temporary playlist. Its create path appears to append to an existing queue rather than replace it, contrary to the bridge's comment (unverified).
- **Typed channels, including `/c/`:** `navigation/resolve_url` resolves every form without sign-in, and a channel `browse` gives the title and @handle.
- **A video's channel:** read it in the page. The signed-out `next` request replaces 1.5.0's `videos.list` fallback.
- **Account:** `ytcfg` tells whether anyone is signed in and gives the Google account, brand account and channel. `DATASYNC_ID` is YouTube's own identity key. Switching account is a full-page sign-in redirect, not a request.
- **Shorts:** take the video ID from the URL or YouTube's navigation event, never the Shorts page elements. The player is `#shorts-player`, and Shorts loop, so progress wraps back to 0.
- **YouTube's own machinery vs. hand-built requests:**
  - YouTube's command route (`resolveCommand`) is sturdier, but it only returns results for playlist edits and the queue.
  - Reads open YouTube's popups, and create drops the new ID. Those need hand-built requests carrying the auth hash YouTube builds from the `SAPISID` cookies, unless the untested `yt-service-request` route returns data without opening UI.
  - So [ticket 10](10-youtube-access.md) must choose among three options: that route if it works, reading the auth cookies in the page (Chrome Web Store: declare "Authentication information"), or copying headers off YouTube's own requests.
- **Outside a tab:** requests sent outside a YouTube tab need a fresh client version; stale ones now get HTTP 400, which broke Invidious in July 2026.
