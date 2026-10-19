# Which YouTube-internal requests can do each job?

Research for [ticket 01](../../.scratch/rebuild/issues/01-youtube-requests.md) of the 2.0 rebuild map, compiled 2026-10-19.

**Sources and method**
- **YouTube's own desktop web client.**
  - I fetched the watch page and the app bundle it loads (`ytmainappweb.kevlar_base.en_US.VRNYTIAj20w.es5.O`, web client version `2.20261016.01.00`) on 2026-10-19, signed out.
  - The signed-out bundle also contains the signed-in code: playlist editing, account switching and the auth header builder.
  - Refs look like **[B:line]**: a line in that file, plus the minified name (which changes with every release).
  - [bundle-check.mjs](youtube-requests/bundle-check.mjs) re-checks that every marker this note relies on still exists in the live bundle.
- **A signed-out probe of the requests themselves:** [probe.mjs](youtube-requests/probe.mjs), with its output in [probe-output-2026-10-19.json](youtube-requests/probe-output-2026-10-19.json). Refs look like **[P:key]**.
- **Code that talks to these requests**, read at fixed commits:

  | Ref | Project | Commit |
  |---|---|---|
  | [YJ] | youtubei.js | `c4a7b3f`, 2026-10-18 |
  | [YD] | yt-dlp | `8973412`, 2026-10-10 |
  | [NP] | NewPipeExtractor | `8443c91`, 2026-10-13 |
  | [IV] | Invidious | `57cc097`, 2026-10-13 |
  | [YM] | ytmusicapi | `4da34b6`, 2026-10-12 |
  | [MU] | SponsorBlock's maze-utils | `89005da`, 2026-10-08 |
  | [RYD] | Return YouTube Dislike | `639a30f`, 2026-10-18 |

  Paths are relative to each repo.
- **Other sources:** Help Center pages, Data API docs and GitHub issues, listed under [Sources](#sources).
- **Limit of this research:** nothing was tried while signed in. Everything that needs a signed-in browser is listed under [Live checks](#live-checks).

## Answer

| Job | Request YouTube's web client sends | How 2.0 should send it | Confidence |
|---|---|---|---|
| **List playlists, incl. Watch Later, and which already hold a video** | `playlist/get_add_to_playlist` `{videoIds:[id], excludeWatchLater:false}`. This is the Save dialog's own request. Each playlist entry, Watch Later (`WL`) included, has `playlistId`, `title`, `privacy` and `containsSelectedVideos: "ALL"\|"NONE"`. | Hand-built in the YouTube tab. YouTube's own resolver for it opens the Save popup. | The request fields are in the bundle. A signed-out call returns 401. The signed-in response comes in two shapes (old renderer and new view model), so it needs a live check. |
| **Picker extras: thumbnail, video count** | `browse {browseId:"FEplaylist_aggregation"}`, which is the page at `/feed/playlists`. Its items are `lockupViewModel`. | Hand-built, cached. | The URL maps to that browse ID, and a signed-out call returns 401 [P]. Item fields need a live check. |
| **Add a video** | `browse/edit_playlist` `{playlistId, actions:[{action:"ACTION_ADD_VIDEO", addedVideoId}]}`. The response's `playlistEditResults[0].playlistEditVideoAddedResultData.setVideoId` identifies the new entry. | Through YouTube: `resolveCommand({playlistEditEndpoint}, {commandController})`. Fall back to hand-built. | High. The request has been unchanged since 2020 [YM]. The callback route needs a live check. |
| **Remove (undo)** | Same endpoint, with `{action:"ACTION_REMOVE_VIDEO", setVideoId}`. YouTube's own Watch Later button uses `{action:"ACTION_REMOVE_VIDEO_BY_VIDEO_ID", removedVideoId}`. | Same as Add. | High. |
| **Create a playlist** | `playlist/create` `{title, privacyStatus:"PUBLIC"\|"UNLISTED"\|"PRIVATE", videoIds?, description?}`, which returns `playlistId`. | Hand-built. YouTube's resolver throws the new ID away. | High. Rate-limited: HTTP 429 after about 20 creations in 15 minutes (2020). |
| **Add to queue** | `addToPlaylistCommand {listType:"PLAYLIST_EDIT_LIST_TYPE_QUEUE"}`, resolved in the client. YouTube then creates a temporary `TLPQ…` playlist with `playlist/create {params:"CAQ%3D"}` and appends to it with `browse/edit_playlist`. | Keep 1.5.0's `resolveCommand`. | High. The TLPQ creation works signed out [P:queue_create]. |
| **A video's channel** | Watch page: the player response's `videoDetails.channelId`, `.author` and `microformat.playerMicroformatRenderer.ownerProfileUrl` (`…/@handle`). Shorts: `reel/reel_item_watch`, field `reelChannelBarViewModel`. | Read in the page from the `yt-navigate-finish` detail or `#movie_player.getPlayerResponse()`. Fall back to a signed-out `next` request, which gives `videoOwnerRenderer` with `browseId` and `canonicalBaseUrl` (`/@handle`). | High [P], [MU]. |
| **Typed channel, incl. `/c/`** | `navigation/resolve_url {url}` returns `endpoint.browseEndpoint.browseId` (`UC…`). `browse {browseId}` then gives `metadata.channelMetadataRenderer.{title, vanityChannelUrl}`. | Hand-built. No sign-in needed, so it can be sent from anywhere. | Verified signed out for `@handle`, `/c/`, `/user/`, `/channel/` and bare `/name`. Unknown names return 404 [P]. |
| **Signed in? Which account and channel?** | `ytcfg`: `LOGGED_IN`, `DATASYNC_ID`, `SESSION_INDEX`, `DELEGATED_SESSION_ID`, `USER_SESSION_ID`. Every InnerTube response also carries `responseContext.mainAppWebResponseContext.{loggedOut, datasyncId}`. Names come from `account/account_menu`; all of an account's channels from `account/accounts_list`. | Read `ytcfg` in the page and use `DATASYNC_ID` as the account key. Call `account_menu` for the name and handle. | Field names come from [B], [YD] and [YM]. The signed-in values need a live check. |
| **Shorts** | URL `/shorts/<id>`. `yt-navigate-finish` gives `pageType:"shorts"` and `endpoint.reelWatchEndpoint.videoId`. The player root is `#shorts-player`. The Shorts menu's Save item sends `addToPlaylistEndpoint`, which ends at the same `get_add_to_playlist`. | In the page. | The player root and the Save command were verified signed out. The player API on `#shorts-player` needs a live check. |

**Nothing needs the Data API.**
- Every job has an internal request that the user's session can make, so ADR-0001 holds.
- Three things are weaker than they look, or impossible:
  - **Switching account or channel:** no request does this. YouTube switches with a full-page sign-in redirect (`selectActiveIdentityEndpoint…accountSigninToken.signinUrl`, [B:20112]). 2.0 can list the account's other channels, but it can only follow the active one.
  - **The picker needs two requests:** no single request returns membership, privacy, thumbnails and counts together.
  - **Creating playlists is throttled server-side.** Public playlists also have a daily per-channel cap [H1], and a new playlist can take minutes to appear in listings [I1].

**YouTube's own machinery against hand-built requests** (detail in [§10](#10-youtubes-own-machinery-vs-hand-built-requests))

*Where YouTube's machinery is sturdier:* wherever a resolver hands the response back.
- It builds the URL, headers, auth hash and context exactly as YouTube does that day. That includes the three-part auth hash, and the experiment that chooses between `X-Goog-PageId` and `context.user.onBehalfOfUser`.
- It never makes the extension touch cookies.
- That covers add and remove (`playlistEditEndpoint` reports through `commandController.onSuccess` / `onServerError`, [B:25627]) and the queue.

*Where it doesn't fit:*
- **Reads:** their resolvers open YouTube UI (the Save popup, the account menu) or navigate.
- **Create:** its resolver discards the response.
- **Element-level `resolveCommand`:** it returns only a "handled" boolean [B:14842].
- **A candidate read path:** the `yt-service-request` action hands responses back to an element [B:2638, 4159], but it's unverified signed in.

*What that leaves:* a hand-built InnerTube client in the YouTube tab, at least for reads and create.
- **Its auth header:** it must copy YouTube's header builder. The hash is built from the `SAPISID`, `__Secure-1PAPISID` and `__Secure-3PAPISID` cookies, which YouTube's own code reads from `document.cookie`.
- **Conflict with ticket 03:** that clashes with its "no cookie reading" decision. See [Conflicts with the map](#conflicts-with-the-map).

## 1. How YouTube's web client sends an InnerTube request

**Transport**
- **Method and URL:** `POST https://www.youtube.com/youtubei/v1/<path>`, with `?prettyPrint=false` added under the `json_condensed_response` flag (`_.D0u`, [B:2596]).
- **Credentials:** `same-origin` for youtube.com (`_.yR2`, [B:2596]).
- **API key:** the transport no longer appends `key=`. The API key appears only in the `_.WiG` config object [B:1592].
  - NewPipe dropped keys on 2024-04-10, because official clients "are not used anymore … in almost all cases" (`27dc1b1f`).
  - Invidious followed on 2024-04-27 (`470245de`).

**Default headers** (`Tct`, [B:4987])
- `Content-Type: application/json`.
- `X-Goog-Visitor-Id` (from `VISITOR_DATA`) or `X-Goog-EOM-Visitor-Id`.
- `X-Youtube-Bootstrap-Logged-In` (`LOGGED_IN`).
- `X-Youtube-Client-Name` and `X-Youtube-Client-Version` (`INNERTUBE_CONTEXT_CLIENT_NAME` and `…_VERSION`).

**Auth headers** (`g2U`, [B:8046]; hash in `_.m5` and `zve`/`Z_6`, [B:6433, 6452])
- **`Authorization`:** up to three space-separated parts.
  - `SAPISIDHASH <ts>_<sha1>[_u]`, from the `SAPISID` cookie (falling back to `__Secure-3PAPISID`).
  - `SAPISID1PHASH …`, from `__Secure-1PAPISID`.
  - `SAPISID3PHASH …`, from `__Secure-3PAPISID`.
- **How each hash is computed:** `sha1("<USER_SESSION_ID> <ts> <cookie> <origin>")`, with the `u` part only when `USER_SESSION_ID` is set. The output is `<ts>_<hex>_u`.
- **Where the cookies come from:** YouTube reads them with its own `document.cookie` reader (`es`, [B:6452]). So they aren't HttpOnly, and a MAIN-world script can read them too.
- **`X-Goog-AuthUser`:** `SESSION_INDEX`.
- **`X-Origin`:** `location.origin`.
- **`X-Goog-PageId`:** `DELEGATED_SESSION_ID`.
  - The header builder `_.Vbt` deletes it unless the `pageid_as_header_web` experiment is on [B:1603].
  - Otherwise the context builder puts it in the body as `context.user.onBehalfOfUser` [B:1595].
  - So *how* a brand-account identity is sent depends on an experiment flag in `ytcfg.EXPERIMENT_FLAGS`.

**Context** (`_.rH2`, [B:1595])
- `client{hl, gl, clientName, clientVersion, configInfo, userAgent, …}`.
- `request.internalExperimentFlags`.
- `user.onBehalfOfUser`, or `user.serializedDelegationContext` for delegated channel managers.

**How hand-built clients compare**

| | yt-dlp | youtubei.js | ytmusicapi |
|---|---|---|---|
| Auth hash | Copied YouTube's three-hash `_u` scheme in 2025.01.12 ("Refactor cookie auth", `75079f4e3`, #11989; `yt_dlp/extractor/youtube/_base.py:761-821`) | A single `SAPISIDHASH` (`src/utils/Utils.ts:110-118`) | A single `SAPISIDHASH`, built from `__Secure-3PAPISID` (`ytmusicapi/helpers.py:55-71`) |
| Other auth headers | `X-Goog-PageId`, `X-Goog-AuthUser`, `X-Origin`, `X-Youtube-Bootstrap-Logged-In` (`_base.py:955-973`) | `X-Goog-Authuser`, `X-Goog-PageId` (`src/utils/HTTPClient.ts:116-140`) | — |

- **Old scheme still accepted (2026-10):** the youtubei.js and ytmusicapi columns show the single-hash form keeps working; I found no breakage reports for it. But YouTube's own client sends all three hashes.
- **Cookies alone aren't enough.** yt-dlp #393 (2021-06-10) found a cookie file without `SAPISID`, so the hash was missing. The Watch Later call then came back "The playlist does not exist", which is the signed-out answer [I2] and [P:browse_VLWL].

**Client version**
- Use the page's own `INNERTUBE_CLIENT_VERSION`; never hardcode it.
- A stale WEB version broke every Invidious instance on 2026-07-22 with HTTP 400 (hotfix `30c0656a`, #5818/#5819; reported in iv-org/invidious#5820 [I3]). The reporter bisected the server change to around 2025-08-20 (unverified).

### Commands, resolvers and `resolveCommand`

**How a command runs**
- A command is a JSON object whose key names an "extension", e.g. `playlistEditEndpoint`.
- `_.O5` is the command handler singleton. It looks up a resolver in a map (`Ed`, [B:26865-26872]):
  - `addToPlaylistEndpoint → oOC`;
  - `createPlaylistServiceEndpoint → wHc`;
  - `playlistEditEndpoint → FbP`.
- A resolver that needs the network calls `_.JD(transport, command, form)` [B:25783].
  - That finds the request builder for the extension and applies the auth headers.
  - It resolves to the response.

**Request builders** (each `*.JSC$…_buildRequest` [B:26147-26293] maps endpoint fields to a request body; youtubei.js's `src/parser/classes/endpoints/*.ts` are line-for-line ports of them)

| Endpoint | Builder | Request fields |
|---|---|---|
| `addToPlaylistServiceEndpoint` and `addToPlaylistEndpoint` → `playlist/get_add_to_playlist` | `wdP`, [B:26279] | `videoIds` (or `[videoId]`), `playlistId?`, `params?`, `excludeWatchLater:false` |
| `createPlaylistServiceEndpoint` → `playlist/create` | `cIK`, [B:26282] | `title`, `privacyStatus` (numeric UI values map to PUBLIC, UNLISTED or PRIVATE), `description`, `videoIds`, `params`, `sourcePlaylistId` |
| `playlistEditEndpoint` → `browse/edit_playlist` | `ERF`, [B:26292] | `actions`, `params`, `playlistId` |
| `reelWatchEndpoint` → `reel/reel_item_watch` | `TYZ`, [B:26292] | `playerRequest{videoId, params, racyCheckOk, contentCheckOk}`, `params`, `inputType`, `disablePlayerResponse:true` |
| `signalServiceEndpoint {signal:"GET_ACCOUNT_MENU"}` → `account/account_menu` | `ZRC`, [B:26147] | — |
| `account/accounts_list` | `zVP`, [B:26153] | `requestType`, `callCircumstance`, `obfuscatedSelectedGaiaId` (moved out of `onBehalfOfUser`) |
| `navigation/resolve_url` | `AoB`, [B:25952] | `{url}` |

**What callers get back**
- **`_.O5.prototype.resolveCommand(cmd, opts)`** returns only `.handled` [B:14842]. Resolvers report results through `opts.commandController.onSuccess(cmd, response)` and `.onServerError(cmd, response)`. Real callers pass this option [B:5182, 16287, 21219].
- **The Polymer element method** that 1.5.0 calls (`ytd-app.resolveCommand`) isn't a plain assignment in this bundle, so I couldn't confirm that it forwards `opts` to `_.O5` (live check).
- **The `yt-service-request` action** is a second route [B:2638, 4159, 17015].
  - `_.x1(element, [endpoint])` fires a `yt-action` named `yt-service-request`. The app's handler sends the endpoint and returns `{ajaxPromise}`.
  - The element then receives `yt-service-request-completed` with the response.
  - Before that, the handler resolves any `actions`, `command` or `onResponseReceivedActions` it finds in the response (`bvU`/`SKj`, [B:1856, 4159]). So whether UI appears depends on the response, not on the caller.

## 2. Listing playlists, Watch Later and membership

**What YouTube's client sends**
- **Save button (watch page):** sends `addToPlaylistServiceEndpoint {videoId}`.
- **Shorts menu "Save to playlist":** sends `addToPlaylistEndpoint {videoId, params:"R0FRJTNE"}` [P:reel_item_watch].
- Both build `playlist/get_add_to_playlist` with `excludeWatchLater:false`, so Watch Later is included [B:26279].
- Both resolvers then open a popup:
  - `oOC` dispatches `yt-service-request-completed` with the response and `openPopupConfig` [B:25459];
  - the popup map treats `addToPlaylistRenderer` as a DIALOG or a RESPONSIVE_DROPDOWN [B:35816-35819].

**Response, old shape**
- `addToPlaylistRenderer.playlists[].playlistAddToOptionRenderer`, with:
  - `playlistId`, `title`, `privacy`, `privacyIcon`;
  - `containsSelectedVideos` (`"ALL"` | `"NONE"`);
  - `addToPlaylistServiceEndpoint` and `removeFromPlaylistServiceEndpoint`.
- youtubei.js parses it this way (`src/parser/classes/PlaylistAddToOption.ts:21-30`, `AddToPlaylist.ts:13-17`).
- YouTube's current client still ships the matching `ytd-playlist-add-to-option-renderer`:
  - it ticks the box when `containsSelectedVideos==="ALL"`;
  - toggling it resolves the entry's own add or remove endpoint [B:39243].

**Response, new shape**
- The same bundle has a view-model path: `toggleableListItemViewModel` with `entitySelectorType: "TOGGLEABLE_LIST_ITEM_ENTITY_SELECTOR_TYPE_SAVE_TO_PLAYLIST_LIST_ENTITY"`.
- Its toggled state is read from a `saveToPlaylistListEntity` whose `playlistIds` are the playlists holding the video [B:27677; entity store B:4349, 14884].
- youtubei.js added a `ToggleableListItemView` parser three days ago (`02c5c8d`, 2026-10-16, PR #1282, opened 2026-10-03), because responses started containing that node. The PR doesn't say which response.
- So the signed-in response may come as either shape, maybe by experiment, or by the `params` the Shorts menu passes. 2.0 must parse both (live check).

**Signed out:** HTTP 401 `UNAUTHENTICATED` "You must be signed in to perform this operation." [P:get_add_to_playlist].

**The playlists page**
- `/feed/playlists` resolves to `browse {browseId:"FEplaylist_aggregation"}` [P:resolve_url]. youtubei.js `getPlaylists()` uses it (`src/Innertube.ts:411-415`).
- Signed out it returns 401 [P:browse_FEplaylist_aggregation].
- Its items are `lockupViewModel`s, as on every list surface since 2024:
  - youtubei.js parses LockupView from 9.2.0 (2024-03-31, #609);
  - `getPlaylists` has returned a `Feed` since 10.0.0 (2024-06-09).
- The lockup carries the thumbnail and a "N videos" overlay. Which field holds privacy for one's own playlists needs a live check.
- `/feed/you` and `/feed/library` resolve to `FElibrary` [P:resolve_url], the "You" page. youtubei.js `getLibrary()` uses it (`src/Innertube.ts:355-359`).

**Watch Later**
- Watch Later is the playlist `WL`, browsable as `VLWL` [P:resolve_url]. YouTube treats `FEwatch_later` as the same page [B:38510].
- Signed out, `browse VLWL` returns an alert: "The playlist does not exist." [P:browse_VLWL].
- The Data API has returned placeholder `WL` IDs and empty lists since 2016-09-12. It deprecated `playlistItems.insert`/`delete` on them fully in 2020 [D2]. Only the internal route reaches Watch Later.

**For a picker:** call `get_add_to_playlist` for the video (all playlists, privacy and membership), and decorate the results from a cached `FEplaylist_aggregation` (thumbnails, counts, recency order). Whether `get_add_to_playlist` lists *every* playlist or pages them needs a live check.

## 3. Adding and removing a video

**Request** (`browse/edit_playlist`, builder [B:26292])

| Action | Fields |
|---|---|
| Add | `{action:"ACTION_ADD_VIDEO", addedVideoId}`, optionally `addedVideoPosition` (the queue uses it, [B:15033]) |
| Remove one entry | `{action:"ACTION_REMOVE_VIDEO", setVideoId}` |
| Remove by video | `{action:"ACTION_REMOVE_VIDEO_BY_VIDEO_ID", removedVideoId}` |

- **Other actions in the client:** `ACTION_MOVE_VIDEO_AFTER`, `ACTION_SET_PLAYLIST_NAME`, `…_DESCRIPTION` and `…_PRIVACY` (bundle strings).
- **Watch Later:** YouTube's player builds exactly these for its Watch Later button: `addToWatchLaterCommand` / `removeFromWatchLaterCommand` with `playlistEditEndpoint {playlistId:"WL", actions:[…]}` [B:3090-3091].
- **The page's handlers support both remove forms** [B:17067].

**Response**
- `status: "STATUS_SUCCEEDED"`.
- `playlistEditResults[].playlistEditVideoAddedResultData{videoId, setVideoId}`. YouTube's own resolver forwards the first one to the playlist page [B:25627-25629]; ytmusicapi returns them (`ytmusicapi/mixins/playlists.py:475-482`).
- Possibly `actions`: confirmation toasts (unverified signed in).

**Undo**
- Remove with `ACTION_REMOVE_VIDEO` and the `setVideoId` from the add's response. That removes exactly the entry just added.
- `ACTION_REMOVE_VIDEO_BY_VIDEO_ID` may remove every copy of the video (unverified).

**Signed out:** **HTTP 200** with `status: "STATUS_FAILED"` and an `openPopupAction` sign-in modal [P:edit_playlist_WL]. Success must be read from `status`, never from the HTTP code.

**Duplicates**
- YouTube Music rejects a duplicate add (no items are added) unless the action has `dedupeOption: "DEDUPE_OPTION_SKIP"` (ytmusicapi `add_playlist_items` docstring and code, `ytmusicapi/mixins/playlists.py:437-482`).
- The YouTube web bundle never sends a `dedupeOption`.
- What a duplicate add does on `www.youtube.com` needs a live check. It matters for ticket 12.

**Through YouTube's machinery**
- `resolveCommand({playlistEditEndpoint:{playlistId, actions}}, {commandController:{onSuccess, onServerError}})`. The `FbP` resolver:
  - runs any `clientActions`;
  - sends the request;
  - on `errorMetadata`, shows YouTube's own error toast and calls `onServerError`;
  - otherwise calls `onSuccess(command, response)` [B:25627-25629].
- This is the only read-and-write job where the command route returns the response.

**History**
- ytmusicapi has sent `browse/edit_playlist` and `playlist/create` since 2020-02-21 (`7ed4d43`), with item batches since 2020-02-23 (`9ef92f8`).
- youtubei.js has since 2022-04-15 (`b9e15b5`, `12baec0`). Its remove-by-`setVideoId` was added in 2024-08 (`d85fbc5`).
- The action vocabulary in both is the same one YouTube's bundle uses today. I found no commit in either that changed the request because YouTube changed it.

## 4. Creating a playlist

**Request:** `playlist/create` `{title, privacyStatus, description?, videoIds?, sourcePlaylistId?, params?}` (builder `cIK` [B:26282]; ytmusicapi `ytmusicapi/mixins/playlists.py:255-297`; youtubei.js `src/parser/classes/endpoints/CreatePlaylistServiceEndpoint.ts`).

**Response:** `{playlistId}`.
- ytmusicapi warns that `<` and `>` in the title make the call fail (`ytmusicapi/mixins/playlists.py:275-279`).

**Signed out:** 401 [P:create_private].

**Through YouTube's machinery:** not usable. The `wHc` resolver sends the request, shows an error toast on failure, and resolves the response's `actions`, but never hands the response or the new `playlistId` to the caller [B:25625]. Use a hand-built request.

**Limits**
- **Rate limit:** HTTP 429 `RESOURCE_EXHAUSTED` / `RATE_LIMIT_EXCEEDED`, "You are creating too many playlists. Please wait a while before creating further playlists." The reporter had made about 20 in 15 minutes; this was YouTube Music in 2020 [I1].
- **Daily cap:** Google says "There's a limit to how many public playlists a channel can create each day", across YouTube, YouTube Music and the API [H1].
- **Eventual consistency:** the same issue notes new playlists appeared in the library "after several minutes of delay" [I1]. After creating, keep the returned ID; don't expect a re-list to show it at once.

## 5. Adding to the queue

1.5.0's bridge sends `addToPlaylistCommand` inside a `signalServiceEndpoint {signal:"CLIENT_SIGNAL"}` (`src/entrypoints/yt-queue-bridge.ts:33-61`). The bundle shows what happens next.

**Client-side handling**
- `CLIENT_SIGNAL` endpoints are never sent to the network (`wHj`, [B:4159]).
- **Display data:** the handler (`Nyp`, [B:29080]) dispatches `yt-lockup-requested` on the element the command was resolved on, to collect the card's display data.
  - Without a card it falls back to `{videoId, navigationEndpoint}`.
  - This is why resolving on the video's own thumbnail element matters (as 1.5.0 does).
- `odQ` [B:29473-29474] adds the videos to the queue proxy (`ti`/`_.T9b`).

**Network**
- **First video:** the proxy creates a playlist from `onCreateListCommand`, i.e. `createPlaylistServiceEndpoint` with the queued video IDs and the title "Queue" (`cHK`, [B:15049]). It's sent as `playlist/create {params:"CAQ%3D"}`.
- **What comes back:** a `TLPQ…` playlist ID, which works even signed out [P:queue_create].
- **Later videos** become `ACTION_ADD_VIDEO` edits on that TLPQ playlist via `browse/edit_playlist` (`ti.prototype.addVideos`, `jAF`, `updatePlaylist`, [B:15033, 15049]).
- **Storage:** the TLPQ ID is kept in storage as `TLPQplaylist`/`TLPQindex`/`TLPQtimestamp` for 24 h [B:15050, 29312].
- **Account changes:** the queue is cleared when the `SAPISID` cookie changes, which YouTube polls every second [B:15049].

**Corrections to the 1.5.0 bridge's assumptions**
- `addVideos` only uses `onCreateListCommand` when the proxy has no list yet; otherwise it appends [B:15033]. So including `onCreateListCommand` while a queue exists shouldn't replace it. The bridge's comment says it does (`yt-queue-bridge.ts:25-32`). Whether `openMiniplayer` is what replaces it is unverified.
- **Confirmation:** a success signal exists without polling `ytd-miniplayer.active`: the TLPQ create or edit request itself. 1.5.0 can't see it. Hooking it would mean wrapping `window.fetch`, as maze-utils does for other endpoints (`src/injected/document.ts:79-90, 354-356`).

No other project implements the queue; youtubei.js, yt-dlp, NewPipe and Invidious don't have it.

## 6. Reading a video's channel

**Watch page, in the page**
- `#movie_player.getPlayerResponse()`:
  - `videoDetails.{videoId, channelId, author}`;
  - `microformat.playerMicroformatRenderer.ownerProfileUrl`, in the form `http://www.youtube.com/@handle`, http included (NewPipe mock in `descriptionpewdiepie/generated_mock_5.json`).
- 1.5.0 already reads these (`yt-queue-bridge.ts:154-185`).
- **Cheaper and event-driven:** `yt-navigate-finish`'s detail, `(detail.data ?? detail).response.playerResponse.videoDetails`. SponsorBlock reads `channelId`/`author` there (maze-utils `src/injected/document.ts:152-160`).
- **Collaboration videos:** `videoOwnerRenderer` has no title and opens a list dialog, but `videoDetails.channelId` stays the primary channel (NewPipe `56e41f2b`, 2025-10-31; `YoutubeParsingHelper.getFirstCollaborator`).

**By request, no sign-in needed**
- `next {videoId}` returns `contents.twoColumnWatchNextResults.results.results.contents[].videoSecondaryInfoRenderer.owner.videoOwnerRenderer` with:
  - `title.runs[0].text`;
  - `navigationEndpoint.browseEndpoint.browseId`;
  - `canonicalBaseUrl:"/@handle"` [P:next_owner].
- This replaces 1.5.0's `videos.list` fallback.
- **Why `next` rather than `player`, and its caveat:** the `player` request is the one YouTube guards hardest (PO tokens; Invidious now routes it through a companion service, `youtube_api.cr:460-472`), so the fallback should be `next`. But NewPipe takes the uploader ID from the player's `videoDetails.channelId` on purpose, warning that the ID in `videoSecondaryInfoRenderer` (that is, `next`) can differ for music and auto-generated channels (`YoutubeStreamExtractor.java:499-512`). So read the page's player response first, and treat a `next`-derived ID as possibly not matching a filter entry for those channels.

**Shorts:** see [§9](#9-shorts).

## 7. Resolving a typed channel, including `/c/`

**Request:** `navigation/resolve_url {url}`. Accept `endpoint.browseEndpoint.browseId` only if it starts with `UC` and `commandMetadata.webCommandMetadata.webPageType` is `WEB_PAGE_TYPE_CHANNEL`.

**Verified signed out on 2026-10-19** [P:resolve_url]

| Input | Result |
|---|---|
| `/@mkbhd`, `/c/mkbhd`, `/user/marquesbrownlee`, `/mkbhd`, `/channel/UCBJ…` | `UCBJycsmduvYEL83R_U4JriQ` |
| `/c/vsauce1`, `/user/Vsauce` | `UC6nSFpj9HTCZ5t-N3Rm3-HA` |
| `/user/vsauce1`, unknown handle, unknown `/c/` | HTTP 404 `NOT_FOUND` |
| A `/shorts/` URL | A `urlEndpoint` to `/watch`, `WEB_PAGE_TYPE_UNKNOWN` |

- The Vsauce rows show that legacy usernames and custom URLs are different namespaces. That's why the Data API's `forUsername` can't stand in for `/c/`; `channels.list` has no custom-URL filter [D1].
- **Handles that hop:** some handles resolve first to an intermediate `urlEndpoint`, which must be resolved again. NewPipe follows up to 3 hops when `webPageType` is `WEB_PAGE_TYPE_UNKNOWN` (`YoutubeChannelHelper.java:75-105`, PR #1347, 2025-07-31). Its maintainer called this behaviour new: "this is the first time I see this". Invidious doesn't follow hops (`routes/channels.cr:339-370`).
- **Input handling:** build the full URL. A bare `name` becomes `https://www.youtube.com/@name`, and pasted URLs pass through.

**Title and handle:** `browse {browseId:"UC…"}` returns:
- `metadata.channelMetadataRenderer.title`;
- `.externalId`;
- `.vanityChannelUrl` (`http://www.youtube.com/@mkbhd`);
- the header's `pageHeaderRenderer…metadataRows[0].metadataParts[0].text.content` (`@mkbhd`) [P:channel_browse].

Invidious has read `channelMetadataRenderer.title` since at least 2021-08-03 (`1321c909`; `channels/about.cr:83-84`). The header renderers changed around it: `c4TabbedHeaderRenderer` gave way to `pageHeaderRenderer` in 2024-07 (NewPipe `8be64574`). Neither project reads the handle; take it from `vanityChannelUrl`.

**Errors**
- **Terminated or removed channels:** HTTP 200 with `alerts[0].alertRenderer.type == "ERROR"` (NewPipe `YoutubeParsingHelper.java:1200-1240`).
- **Malformed IDs:** HTTP 400 `INVALID_ARGUMENT`.
- **Age-gated channels:** no `metadata` (NewPipe mocks).

**History**
- NewPipe added `resolve_url` for `/user/`, then for all paths including `/c/` ("Fix … youtube.com/c/username"), in `a12c69da` / `58ce9b04` (2021-08). Handles followed in `61ce041b` (2022-11-04).
- Invidious added it in `5b020e81` / `1321c909` (2021-08-03) and the `/@` route in 2023-01.
- youtubei.js added `resolveURL` in `5cfb969` (2022-12-31; `src/Innertube.ts:479-488`).
- yt-dlp falls back to it in `_extract_tab_endpoint` (`_tab.py:1015-1030`).
- In five years of history I found no breakage of `resolve_url` itself. The only change was the redirect hop.

## 8. Signed in? Which account and which channel?

### How YouTube tells them apart

| Concept | How YouTube identifies it | Source |
|---|---|---|
| **Google account** (one of several in the browser's multi-login) | Its index in the browser's account list: `ytcfg.SESSION_INDEX`, sent as `X-Goog-AuthUser`. URLs carry it as `authuser`. The account itself is `USER_SESSION_ID` (whether that survives sign-out is a live check). | [B:8046]; yt-dlp `_extract_session_index`, `_base.py:871-880` |
| **Brand account** | `DELEGATED_SESSION_ID`, the page ID (21 digits, per ytmusicapi docs). Sent as `X-Goog-PageId` or `context.user.onBehalfOfUser`, by experiment. | [B:1595, 1603]; ytmusicapi `docs/source/usage.rst:39-49`; youtubei.js 6.3.0 `on_behalf_of_user` (2023-08-31, #494) |
| **Channel** | One per identity (the Google account itself or a brand account). "On YouTube, you can only use one channel at a time", and one Google account can manage up to 100 channels. | [H2] |
| **The active identity as a whole** | `DATASYNC_ID`. | See below |

**`DATASYNC_ID` formats**

| Situation | Format | Source |
|---|---|---|
| Brand-account channel | `"<DELEGATED_SESSION_ID>\|\|<USER_SESSION_ID>"` | yt-dlp `_parse_data_sync_id`, `_base.py:882-897` |
| The account's own channel | `"<USER_SESSION_ID>\|\|"` | Same |
| Signed out | `"V<hex>\|\|"`. The 2026-10-19 watch page had `"V2cc2ce9b\|\|"`. | YouTube's client checks for this shape before clearing per-identity storage [B:29253] |

- **YouTube's own per-identity key:** YouTube keys its per-identity local data by `DATASYNC_ID`. Examples: `"post-aadc-notice-shown-"+DATASYNC_ID` [B:18586], and IndexedDB cleanup per datasync ID from the `GET_DATASYNC_IDS` signal [B:29252]. It's the natural key for 2.0's per-account setups (ticket 11).
- **Not a key:** `SESSION_INDEX`. It's a position in the browser's sign-in list.
- **Unclear:** whether the `USER_SESSION_ID` part survives sign-out and sign-in (live check).

### Requests and fields

**In the page, free:** `ytcfg.get("LOGGED_IN" | "DATASYNC_ID" | "SESSION_INDEX" | "DELEGATED_SESSION_ID" | "USER_SESSION_ID")`.
- These are the only identity keys YouTube's client reads [B, `_.ne(...)` calls]. There is no channel ID in `ytcfg`.
- **When they change:** account switches and sign-outs are full navigations [B:20112], so `ytcfg` is fresh after either.

**In every InnerTube response:** `responseContext.mainAppWebResponseContext.{loggedOut, datasyncId}`.
- yt-dlp reads `datasyncId` from responses (`_base.py:924-935`).
- The probe saw `loggedOut: true` [P:next_owner].
- **Use:** every response can confirm *which* identity it was answered for, a cheap guard against acting on the wrong account.

**`account/account_menu`** (signal `GET_ACCOUNT_MENU`, [B:26147, 26883]): `actions[0].openPopupAction.popup.multiPageMenuRenderer.header.activeAccountHeaderRenderer` has:
- `accountName.runs[0].text`;
- `channelHandle.runs[0].text`;
- `accountPhoto.thumbnails[0].url`.

ytmusicapi reads exactly these (`ytmusicapi/mixins/library.py:460-500`, added 2024-03-03 `c412d7c`). The web client stamps it as `ytd-active-account-header-renderer` [B:38045]. Signed out, the menu has no header [P:account_menu]. Through `resolveCommand` it would open the account menu, so it must be hand-built.

**`account/accounts_list`** `{requestType:"ACCOUNTS_LIST_REQUEST_TYPE_CHANNEL_SWITCHER", callCircumstance:"SWITCHING_USERS_FULL"}`
- Builder [B:26153]; youtubei.js `src/core/managers/AccountManager.ts:33-39`, since `5ea0a0e` 2022-11-12, fixed 2024-11-28 `a7bb981`.
- Returns `accountItem`s with `accountName`, `channelHandle`, `accountPhoto`, `isSelected`, `hasChannel`, `accountByline` (`src/parser/classes/AccountItem.ts:22-32`).
- Each item also has `serviceEndpoint.selectActiveIdentityEndpoint.supportedTokens[]`:
  - `datasyncIdToken.datasyncIdToken` maps each channel to its `DATASYNC_ID` [B:20115];
  - `accountSigninToken.signinUrl` is the switch redirect [B:20112].
- **Use:** list an account's channels and label setups that aren't active.

**The active channel's `UC…` ID:** not in `ytcfg` or the menu header. It's probably in a menu item ("Your channel") or the guide; needs a live check.

## 9. Shorts

**Video ID**
- From the URL `/shorts/<id>` (RYD `Extensions/combined/src/utils.js:100-112`).
- Or event-driven: `yt-navigate-finish` / `yt-navigate-start` detail `pageType === "shorts"` with `endpoint.reelWatchEndpoint.videoId`. SponsorBlock relies on exactly this (maze-utils `src/injected/document.ts:128-142, 282-284`).

**Don't use the Shorts DOM as identity.** RYD documents that "Current YouTube variants can also omit both `is-active` and `video-id`" on `ytd-reel-video-renderer`, leaving the `/shorts/` link as "the only stable identity" (`utils.js:192-197`).

**Player and progress**
- The Shorts player's root element is `#shorts-player`: page `ytcfg` `WEB_PLAYER_CONTEXT_CONFIG_ID_KEVLAR_SHORTS.rootElementId` [watch page, checked by bundle-check.mjs]. Watch pages use `#movie_player`.
- The same `ytcfg` lists other player roots, among them `inline-preview-player` for hover previews.
- Watching "the first `<video>` in the document" (1.5.0) can therefore pick the wrong player. Take the `<video>` inside the right root.
- **Looping:** Shorts loop, so `currentTime` wraps to 0. A watch-percentage rule has to treat a wrap as "reached the end" (ticket 07).
- **Player API:** whether `#shorts-player` exposes `getPlayerResponse()`/`getVideoData()` like `#movie_player` needs a live check.

**Channel of a Short**
- The page's request is `reel/reel_item_watch {playerRequest:{videoId}, disablePlayerResponse:true}` (builder [B:26292]).
- Its `overlay.reelPlayerOverlayRenderer.playerOverlay.reelPlayerOverlayViewModel.metapanel.reelMetapanelViewModel.metadataItems[].reelChannelBarViewModel` has:
  - `channelName.content` (`@jawed`);
  - `channelName.commandRuns[0].onTap.innertubeCommand.browseEndpoint.browseId` [P:reel_item_watch].
- `engagementPanels[…].videoDescriptionHeaderRenderer.channelNavigationEndpoint` carries the same ID.
- youtubei.js `getShortsVideoInfo` sends the same request with `params:"CAUwAg%3D%3D"` (`src/Innertube.ts:166-198`; added in 8.0.0, 2023-12-01, #512).

**Saving a Short:** the menu's "Save to playlist" is `addToPlaylistEndpoint {videoId, params:"R0FRJTNE"}` [P:reel_item_watch]. It goes through the same `get_add_to_playlist` builder [B:26279], so §2 and §3 apply unchanged.

**Shorts history:** list layouts keep moving.
- `shortsLockupViewModel` arrived in 2024 (youtubei.js 10.5.0, 2024-09-19, #746).
- maze-utils' history has "Support new format for shorts videos in feeds", 2024-09-14 `e3824d3`, and "Add support for new shorts in search results on mobile", 2025-08-21.
- The URL and `reelWatchEndpoint.videoId` have stayed put: NewPipe has handled `/shorts/` URLs as ordinary video IDs since 2020-10-18 (`6887d595`).

## 10. YouTube's own machinery vs hand-built requests

| | YouTube's machinery (`resolveCommand`, `yt-service-request`) | Hand-built `fetch` in the YouTube tab |
|---|---|---|
| **Request and auth correctness** | Always current: builders, three-part hash with `_u`, PageId vs `onBehalfOfUser`, visitor ID and client version all come from YouTube's code that day | We copy `g2U`/`Tct`/`rH2`. Version and visitor data come from `ytcfg`. The auth scheme changes rarely (one change in a decade, adopted by yt-dlp in 2025-01), but it does change. |
| **Cookies** | The extension never reads them | Must read `SAPISID`, `__Secure-1PAPISID` and `__Secure-3PAPISID` from `document.cookie` |
| **Getting the result** | Only where the resolver passes `commandController` (`playlistEditEndpoint` yes, create no, `get_add_to_playlist` opens a popup). `yt-service-request` returns data but auto-runs response actions. | Full response, every endpoint |
| **Side effects** | YouTube may show its own toasts or popups: the error toast in `FbP`/`wHc` [B:25625-25629], response `actions` in `SKj` [B:4159] | None |
| **What breaks it** | Extension names, resolver signatures, the `ytd-app` element method, experiments that move UIs to view models | Path or field renames, auth scheme changes, the client-version gate (HTTP 400) |
| **Testability** | Hard: needs YouTube's page | Easy: a gateway seam with recorded responses (ticket 18) |

**Recommendation for ticket 10**
- **Queue:** keep the command route.
- **Add and remove:** command route with `commandController`, if the live check confirms that the element method forwards it and that YouTube's toasts are acceptable. Otherwise hand-built.
- **Reads (lists, membership, account) and create:** hand-built in the YouTube tab, behind one gateway module that copies YouTube's header builder and reads `ytcfg` per request.
- **Unauthenticated requests** (`resolve_url`, channel `browse`, `next`): hand-built, no cookies, from wherever is convenient, but with a fresh client version.
- **Spike first:** try `yt-service-request` for reads in a signed-in browser. If it returns data without UI, more jobs can move to the cookie-free route.

## 11. Limits and stability at a glance

| Request | Used in the wild since | Breakage found | Known limits |
|---|---|---|---|
| `browse/edit_playlist` | ytmusicapi 2020-02-21; youtubei.js 2022-04-15 | None to the request. Callers must check `status`, since signed-out calls fail with HTTP 200 [P]. | Playlist size: Liked videos shows at most 5,000 [H3]. A cap for other playlists or Watch Later is commonly given as 5,000, but I found no first-party source (unverified). No edit rate limit found. |
| `playlist/create` | ytmusicapi 2020-02-21; youtubei.js 2022-04-15 | None | 429 after about 20 in 15 min [I1]; a daily public-playlist cap [H1]; listing lag [I1] |
| `playlist/get_add_to_playlist` | youtubei.js parser 2024-11-17 (`2940f7b`); builder port 2024-11-21 (`7397aa3`) | Response type fix 2024-11-18 (`53d1c75`). View-model items appearing in 2026-10 (`02c5c8d`). **The most volatile piece.** | One request per video |
| `browse FEplaylist_aggregation` | youtubei.js `getPlaylists` (a Feed since 10.0.0, 2024-06-09) | Lists moved to `lockupViewModel` in 2024–2026 (NewPipe `183563cc`, `27bbabc8`; Invidious #5774; youtubei.js 17.2.0) | — |
| `navigation/resolve_url` | NewPipe and Invidious since 2021-08 | Handle redirect hops (NewPipe PR #1347, 2025-07-31) | None seen |
| `browse UC…` (channel) | Invidious since 2021 | Header renderers changed in 2023–2024; `channelMetadataRenderer` stable | — |
| `next` / player response | Everywhere | Collaboration videos (2025-10) | `player` is the guarded one: yt-dlp wiki gives about 2,000 videos/hour per account and about 300/hour signed out [W1] |
| `account/account_menu` | ytmusicapi 2024-03-03; youtubei.js parsers 2022-08 | `channel_handle` added in 2024 (#789) | — |
| `account/accounts_list` | youtubei.js 2022-11-12 | `on_behalf_of_user` not applied, fixed 2024-11-28 | — |
| Auth header | `SAPISIDHASH` known since at least 2015 (yt-dlp's code cites the Stack Overflow answer 32065323) | 1P/3P hashes plus `_u` in YouTube's client; yt-dlp adopted them 2025-01-12 | — |
| Client version | — | A stale version gives HTTP 400 (Invidious 2026-07) | — |

**Account risk:** "By using your account with yt-dlp, you run the risk of it being banned (temporarily or permanently)" [W1]. That warning concerns bulk downloading from outside the browser. 2.0's request volume is one user's own clicks, from their own browser, and I found no report of accounts flagged for playlist edits (unverified either way).

## Live checks

These need a signed-in browser on desktop Chrome and Firefox. They are grouped by the job they unblock; fold them into one spike ticket.

1. **The `get_add_to_playlist` response:**
   - which shape comes back (`addToPlaylistRenderer` or `toggleableListItemViewModel` plus `saveToPlaylistListEntity`);
   - whether `params` changes it;
   - whether every playlist is listed or the list is paged;
   - how `privacy` is spelled;
   - how Watch Later appears.
2. **`FEplaylist_aggregation` lockups:** the fields for title, thumbnail, count and privacy.
3. **`edit_playlist` details:**
   - success and failure bodies and `actions` (does YouTube send a toast);
   - what a duplicate add does on www.youtube.com;
   - whether `ACTION_REMOVE_VIDEO_BY_VIDEO_ID` removes every copy;
   - the error for a full playlist.
4. **`ytd-app.resolveCommand(cmd, {commandController})`:**
   - does the element method forward the options;
   - do `onSuccess`/`onServerError` fire with the response;
   - what UI YouTube shows.
5. **Can `yt-service-request` read without UI?** Fire it from a detached or hidden element for `addToPlaylistServiceEndpoint`, `browseEndpoint {FEplaylist_aggregation}` and `GET_ACCOUNT_MENU`. Is the response returned, and does any popup open?
6. **Cookie-only requests:** is a same-origin MAIN-world `fetch` that carries cookies but no `Authorization` treated as signed out? Expected yes [I2].
7. **Identity values:**
   - `DATASYNC_ID`, `USER_SESSION_ID`, `DELEGATED_SESSION_ID` and `SESSION_INDEX` on a personal channel and on a brand-account channel, with two Google accounts signed in;
   - whether `DATASYNC_ID` is stable across sign-out and sign-in;
   - where the active channel's `UC…` ID appears.
8. **Shorts player:**
   - does `#shorts-player` have `getPlayerResponse()`/`getVideoData()`;
   - does `yt-navigate-finish` fire on every swipe;
   - how the loop shows up in `timeupdate`.
9. **Queue:** does sending `onCreateListCommand` with an open queue replace it, or only `openMiniplayer`? (This is the 1.5.0 bridge comment.)

## Conflicts with the map

- **Ticket 03, "no cookie reading."**
  - Hand-built signed-in requests must carry YouTube's `SAPISIDHASH`, which is computed from the `SAPISID` cookies. In the page those are read through `document.cookie`, as YouTube's own code does [B:6452]; no `cookies` permission is needed.
  - Reads (playlists, membership, account) and create have no verified cookie-free route yet. Either live check 5 finds one, or ticket 10 accepts reading these cookies in the page. The latter means declaring "Authentication information" on the Chrome Web Store, per ticket 03's own finding.
  - A third route: wrap `window.fetch` to copy the headers YouTube's own requests carry. It avoids reading cookies, but still handles an auth credential, and it depends on YouTube having just made a signed-in request.
- **"Never drive YouTube's visible UI."** This holds; no job needs a click. But two command routes have side effects:
  - routing add and remove through `resolveCommand` lets YouTube show its own error toast and maybe a confirmation toast;
  - the reads' resolvers would open YouTube's popups, which is why reads must be hand-built.
- **ADR-0001 holds.** No job needs the Data API, so no capability ticket needs a Data API fallback.

## Sources

**YouTube's own client (fetched 2026-10-19, signed out)**
- [B] App bundle `https://www.youtube.com/s/_/ytmainappweb/_/js/k=ytmainappweb.kevlar_base.en_US.VRNYTIAj20w.es5.O/…/m=kevlar_base_module,kevlar_main_module,kevlar_base_sync_mod_chunk`, loaded by the watch page for client `2.20261016.01.00`. Line numbers are from that exact file; [bundle-check.mjs](youtube-requests/bundle-check.mjs) finds the markers in today's bundle.
- [P] [probe.mjs](youtube-requests/probe.mjs) → [probe-output-2026-10-19.json](youtube-requests/probe-output-2026-10-19.json).

**Code, at the commits listed at the top**
- [YJ] https://github.com/LuanRT/YouTube.js
- [YD] https://github.com/yt-dlp/yt-dlp
- [NP] https://github.com/TeamNewPipe/NewPipeExtractor
- [IV] https://github.com/iv-org/invidious
- [YM] https://github.com/sigma67/ytmusicapi
- [MU] https://github.com/ajayyy/maze-utils
- [RYD] https://github.com/Anarios/return-youtube-dislike
- This repo at `301ae51`: `src/entrypoints/yt-queue-bridge.ts`.

**Google**
- [H1] YouTube Help, "Create and manage playlists". https://support.google.com/youtube/answer/57792 (accessed 2026-10-19)
- [H2] YouTube Help, "Switch between channels on a Google Account". https://support.google.com/youtube/answer/3046356 (accessed 2026-10-19)
- [H3] YouTube Help, "Like or dislike a video" (Liked videos shows up to 5,000). https://support.google.com/youtube/answer/6083270 (accessed 2026-10-19)
- [D1] YouTube Data API, `channels.list` (updated 2026-10-15). https://developers.google.com/youtube/v3/docs/channels/list
- [D2] YouTube Data API, Revision History (2016-08 to 2016-09 and 2020-09 entries on watch history and Watch Later). https://developers.google.com/youtube/data/revision_history

**Issues and wikis**
- [I1] ytmusicapi #19, "Hitting an API rate limit raises KeyError from create_playlist()", 2020-05-16. https://github.com/sigma67/ytmusicapi/issues/19
- [I2] yt-dlp #393, "Youtube :ytwatchlater [Broken]", 2021-06-10. https://github.com/yt-dlp/yt-dlp/issues/393
- [I3] Invidious #5820, stale `clientVersion` rejected with HTTP 400, 2026-07-23. https://github.com/iv-org/invidious/issues/5820 (read through a fetch tool; the bisection claim is the reporter's)
- [I4] YouTube.js PR #1282, "Add `ToggleableListItemView` class", merged 2026-10-16. https://github.com/LuanRT/YouTube.js/pull/1282
- [I5] NewPipeExtractor PR #1347, handle redirects through `urlEndpoint`, merged 2025-07-31. https://github.com/TeamNewPipe/NewPipeExtractor/pull/1347
- [W1] yt-dlp wiki, Extractors → YouTube (rate limits, account ban risk, cookie rotation). https://github.com/yt-dlp/yt-dlp/wiki/Extractors (accessed 2026-10-19)
