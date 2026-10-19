# YouTube Music: one-click song actions through the app's own machinery

Research for [ticket 21](../../.scratch/rebuild/issues/21-youtube-music-internals.md) of the 2.0 rebuild map. Researched 2026-10-19.

Everything about the web app was read from the YouTube Music client that music.youtube.com served on that day, and from signed-out InnerTube responses. I couldn't sign in, so anything that needs an account is marked **(live check)**. [`youtube-music/live-check.js`](youtube-music/live-check.js) is a DevTools snippet that runs each of those checks in a signed-in tab.

Source keys such as **B**, **R-next** and **YMA** are defined under [Sources](#sources).

## Answer

**The short version.** On music.youtube.com, the youtube.com trick of "hand the menu item's command to `resolveCommand`" only works for some commands. YouTube Music routes commands through three layers:
- **`ytmusic-app`'s own handler methods.** These cover navigation, likes, playlist edits, library feedback and toasts.
- **A global command handler**, which is what `resolveCommand` reaches.
- **The ⋮ menu item's own behaviour.** Only this layer can insert into the queue.

The queue lives in the tab's own state store. Sending the request a menu item sends is not enough to queue a song: something must also put the returned items into that store. Pear Desktop and others have done exactly that since 2024.

### Per action

The page script below means the existing injected bridge, extended to music.youtube.com. `app` is `document.querySelector("ytmusic-app")`.

| Action | Command YouTube Music builds (on every row's ⋮ menu) | Recommended dispatch from the page script | Confidence |
|---|---|---|---|
| **Play next** (song, album, playlist) | `queueAddEndpoint {queueTarget: {videoId` or `playlistId, onEmptyQueue: {watchEndpoint}}, queueInsertPosition: "INSERT_AFTER_CURRENT_VIDEO"}` | Replay the menu item's handler in four steps:<br>1. `app.networkManager.fetch("/music/get_queue", {queueContextParams, queueInsertPosition, videoIds: [id]` or `playlistId})`.<br>2. Store the returned `queueContextParams`.<br>3. `app.queue.store.dispatch({type: "ADD_ITEMS", payload: {nextQueueItemId, index: currentIndex + 1, items: queueDatas[].content, shouldAssignIds: true}})`.<br>4. If the queue is empty, use `app.handleNavigationEndpoint(onEmptyQueue)` instead. | High. It mirrors the client code, and Pear Desktop has shipped it since 2024-12. **(live check)** while signed in. |
| **Add to queue** | Same, with `"INSERT_AT_END"` | Same, with `index: items.length` | High |
| **Remove from queue** | `removeFromQueueEndpoint {videoId, itemId}` on queue items | `app.queue.removeItem(itemId)`, where `itemId = String(item.navigationEndpoint.watchEndpoint.index)`. This also updates the server-side queue; Pear's `REMOVE_ITEM` dispatch does not. | Medium–high **(live check)** |
| **Like / unlike / dislike** | `likeEndpoint {status: "LIKE" \| "DISLIKE" \| "INDIFFERENT", target: {videoId}}`, sent to `like/like`, `like/dislike` or `like/removelike` | `app.handleServiceEndpoint({likeEndpoint: …})`, the method YouTube Music's own `yt-like-endpoint` action calls. It updates the app's like state and runs any challenge the response asks for. Toggle semantics are ours: read the current state from the store first. | High for the request. Whether the new player UI repaints its like button is a **(live check)**. |
| **Save to playlist**, one click to a known playlist | `playlistEditEndpoint {playlistId, actions: [{action: "ACTION_ADD_VIDEO", addedVideoId}]}`, sent to `browse/edit_playlist` | `app.handlePlaylistEditEndpoint({playlistEditEndpoint: …})` | High for the request. Duplicate behaviour is a **(live check)**. |
| **Which playlists already contain the song** | `addToPlaylistEndpoint {videoId}`, sent to `playlist/get_add_to_playlist {videoIds, excludeWatchLater: false}` | `app.networkManager.fetch("/playlist/get_add_to_playlist", …)`, then read the options | **Unknown.** YouTube Music's client never reads a membership field. Whether the `WEB_REMIX` response carries `containsSelectedVideos` is a **(live check)**. If it doesn't, use youtube.com's answer (ticket 01). |
| **Save to library / Add to liked songs** | `toggleMenuServiceItemRenderer`: `feedbackEndpoint {feedbackToken}` for library, `likeEndpoint` for liked songs | `app.handleServiceEndpoint(row's default/toggled endpoint)` | High **(live check)** for the signed-in shape |
| **Start radio** (now "Start mix") | Song: `watchEndpoint {videoId, playlistId: "RDAMVM" + videoId, params: "wAEB"}`. Album or playlist: `watchPlaylistEndpoint {playlistId: "RDAMPL" + id, params: "wAEB"}` | `app.handleNavigationEndpoint(command)`. This replaces the queue, as YouTube Music's own item does. | High |
| **Go to artist / Go to album** | `browseEndpoint {browseId: "UC…"` or `"MPREb_…", browseEndpointContextSupportedConfigs.browseEndpointContextMusicConfig.pageType}` | `app.handleNavigationEndpoint(command)`, an in-app navigation with no reload | High |
| **Now playing** and **progress** | n/a | Content script alone: `navigator.mediaSession.metadata` (title, artist, album, artwork) plus the `<video>` element's `currentTime`, `duration` and `timeupdate`.<br>Page script, for the video ID and richer data: `#movie_player.getVideoData()` / `getProgressState()`, or the queue's selected item. | High; the isolated-world read is a **(live check)** |

YouTube Music's own toast is also available: `app.handleAddToToastAction({addToToastAction: {item: {notificationTextRenderer: {successResponseText: {runs: [{text}]}}}}})`.

### Where per-row data lives

It lives on the Polymer element's `data` property, which only the page world can read:
- **`ytmusic-responsive-list-item-renderer`** (song rows): `data` is a `musicResponsiveListItemRenderer`.
  - `playlistItemData.videoId`, and `.playlistSetVideoId` on playlist and album pages.
  - `menu.menuRenderer.items[]`: every command in the table above.
  - `menu.menuRenderer.topLevelButtons[0].likeButtonRenderer {target, likeStatus}`.
  - `overlay…musicPlayButtonRenderer.playNavigationEndpoint`.
  - `flexColumns[].…text.runs[].navigationEndpoint.browseEndpoint`: artist and album, with a `pageType`.
- **`ytmusic-two-row-item-renderer`** (cards): `data.navigationEndpoint.browseEndpoint` (with `pageType`), `data.thumbnailOverlay`, and the same `data.menu`.
- **Queue items:** `ytmusic-player-queue-item`, or better `app.queue.getItems()`. Each is a `playlistPanelVideoRenderer`, sometimes wrapped in `playlistPanelVideoWrapperRenderer.primaryRenderer`, carrying `videoId`, `playlistSetVideoId`, `selected`, `navigationEndpoint.watchEndpoint.index` (the queue item ID), `queueNavigationEndpoint` and a menu that includes `removeFromQueueEndpoint`.
- **Player bar:** don't read it. An A/B test running since 2026-09-29 replaces `ytmusic-player-bar` and `#like-button-renderer` with a Wiz miniplayer; see [Stability](#7-stability-and-breakage-history). Use `#movie_player` and `app.queue` instead.

### Keyboard shortcuts to avoid

YouTube Music binds:

| Group | Keys |
|---|---|
| Playback | `Space` `;` `j` `k` `l` `h` `Shift+N` `Shift+P` `Shift+L` `Shift+H` `Shift+←` `Shift+→` `Ctrl+Shift+←` `Ctrl+Shift+→` |
| Toggles and actions | `s` `r` `=` `-` `m` `q` `Esc` `f` `+` (like) `_` (dislike) `?` (help) `/` (search) |
| Two-key sequences | `g h`, `g e`, `g l`, `g ,` |

Its listener ignores keys typed into inputs. It skips any event with Alt, Ctrl or Meta unless the binding names that modifier, and a single-letter binding fires only with no modifier at all. So every **Alt+key** combination, and **Ctrl/Shift+letter** apart from the four Shift bindings above, is free on YouTube Music's side. The embedded player's own keys are switched off on YouTube Music (`disableKeyboardControls: true`). Which of the free combinations the browser or OS takes is [ticket 08](../../.scratch/rebuild/issues/08-shortcuts.md)'s question.

### The installed app window (PWA) and Firefox

**Chrome and Edge.**
- The installed YouTube Music app is an ordinary Chromium window of type `app`.
- The extensions puzzle menu and pinned action icons sit in its title bar on Windows, macOS and Linux. On ChromeOS they move into the "⋮" app menu.
- The popup's "current window" is the app window, `chrome.commands` are registered for it, and nothing in Chromium skips content scripts there.
- The side panel can't open in an app window.
- From Chrome 139, link capturing is on by default, so new-tab links to music.youtube.com open in the installed app.
- Edge documents that installed apps share Edge's extensions and have an Extensions submenu in the app menu.
- Google publishes no YouTube Music app in the Microsoft Store; the Store's "YouTube Music" apps are third-party clients that won't run the user's extensions.

**Firefox** has no classic PWA install.
- "Web apps" (Taskbar Tabs) shipped on Windows in Firefox 143 (2025-09-16), with Microsoft Store installs added in 150, and they are in ESR 153. Mozilla says these windows keep add-ons, with "the same access, controls, and add-ons as a normal tab".
- The window keeps only the unified-extensions toolbar button, and `windows.type` reports `"normal"`.
- The feature is off by default on Linux and unavailable on macOS.

All of this is from source and docs. The live behaviour is a **(live check)** in each browser.

### What can't be done this way

- **Queue anything without an open YouTube Music tab.** The queue is that tab's state. Play next, Add to queue, Remove and Now playing all need a live tab. Like, save, create and radio listing are plain requests that could run elsewhere ([ticket 02](../../.scratch/rebuild/issues/02-request-context.md)).
- **Queue through `resolveCommand`.** Sending a `queueAddEndpoint` through the generic command path only sends the `music/get_queue` request; nothing inserts the result. Code reading only, as far as I can tell.
- **Forward a queued song to a cast session.** YouTube Music's own insert also forwards the new items to the cast session. Replaying it from outside skips that step, so while casting the cast device won't get the song (code reading).
- **Show playlist membership on YouTube Music's own terms.** No source shows YouTube Music exposing it; see the table.
- **Hand-build authenticated `WEB_REMIX` requests without reading cookies.** ytmusicapi computes `SAPISIDHASH` from the `__Secure-3PAPISID` cookie, which the store-policy decision rules out ("No cookie reading", [map](../../.scratch/rebuild/map.md)). The page's `networkManager` signs requests for us.
- **Like from outside the page.** youtubei.js's maintainer reports that every like now triggers a BotGuard challenge that must run in a real browser, or the like silently disappears. The page's own service-request path handles the challenge command; a raw fetch doesn't.

## Sources

| Key | Source |
|---|---|
| **B** | YouTube Music web client bundle `https://music.youtube.com/s/39d19629/music_polymer_inlined_html.js`, fetched signed out 2026-10-19. Client version `1.20261013.15.00`, SHA-256 `7410a6b84431e7b4f0d8883112c48262e2949ecb02c0385e39ba04b60fae4798`. It is minified onto a few lines, so it is cited as `B@<character offset>` plus a quoted identifier to grep for. Offsets only hold for this exact build. |
| **H** | The music.youtube.com HTML from the same fetch: `ytcfg` values `HOTKEY_DIALOG`, `EXPERIMENT_FLAGS` and `WEB_PLAYER_CONTEXT_CONFIGS`, plus the response headers. The flags are the signed-out ones. |
| **PL** | Player `https://music.youtube.com/s/player/0229cd64/player_es6.vflset/en_US/base.js`, same fetch. |
| **R-…** | Signed-out InnerTube responses, client `WEB_REMIX` `1.20261013.15.00`, 2026-10-19:<br>**R-search** `search {query: "daft punk get lucky"}`;<br>**R-album** `browse {browseId: "MPREb_69fEP9fQBoW"}`;<br>**R-home** `browse {browseId: "FEmusic_home"}`;<br>**R-next** `next {videoId: "gx7GyiDZQms", playlistId: "RDAMVMgx7GyiDZQms", params: "wAEB"}`;<br>**R-queue** `music/get_queue {videoIds: ["gx7GyiDZQms"], queueInsertPosition: "INSERT_AFTER_CURRENT_VIDEO"}`. |
| **YMA** | [sigma67/ytmusicapi](https://github.com/sigma67/ytmusicapi) at `4da34b6` (2026-10-12) |
| **YJS** | [LuanRT/YouTube.js](https://github.com/LuanRT/YouTube.js) at `c4a7b3f` (2026-10-18) |
| **PEAR** | [th-ch/youtube-music](https://github.com/th-ch/youtube-music) ("Pear Desktop", Electron wrapper of the web app) at `fb3923ce` (2026-10-12) |
| **YTMD** | [ytmdesktop/ytmdesktop](https://github.com/ytmdesktop/ytmdesktop) at `882db48b` (2026-10-16) |
| **CR** | Chromium `main` at `2e875e792b` (r1721600, 2026-10-19) |
| **FX** | `mozilla-firefox/firefox` at `d0d4af3c69` |
| Extensions | [benesmartin/youtube-music-companion](https://github.com/benesmartin/youtube-music-companion) `329d9419`; [T3lluz/YTMQ](https://github.com/T3lluz/YTMQ) `35b0ff52`; [lidel/google-music-hotkeys](https://github.com/lidel/google-music-hotkeys) `a73acca6`; [web-scrobbler/web-scrobbler](https://github.com/web-scrobbler/web-scrobbler) `48a84b9f` |
| This repo | `src/entrypoints/yt-queue-bridge.ts` at `301ae51`; `.scratch/rebuild/inventory.md`; `.scratch/rebuild/map.md` |

## 1. How the web app dispatches commands

### 1.1 Three layers

1. **`ytmusic-app`'s action map and handler methods.** `ytmusic-app` maps `yt-action` names to methods on its prototype (B@4467231, `"yt-like-endpoint":"handleServiceEndpoint"`). Among the 64 entries:

   | Action | Method |
   |---|---|
   | `yt-like-endpoint`, `yt-feedback-endpoint`, `yt-share-entity-endpoint`, `yt-signal-service-endpoint` | `handleServiceEndpoint` |
   | `yt-playlist-edit-endpoint` | `handlePlaylistEditEndpoint` |
   | `yt-watch-endpoint`, `yt-watch-playlist-endpoint`, `yt-browse-endpoint`, `yt-search-endpoint` | `handleNavigationEndpoint` |
   | `yt-add-to-toast-action` | `handleAddToToastAction` |
   | `yt-queue-update-command` | `handleQueueUpdateCommand` |
   | `yt-run-attestation-command` | `handleRunAttestationCommand` |

   - There is **no entry for `queueAddEndpoint` or `removeFromQueueEndpoint`.**
   - The methods are small:
     - `handleServiceEndpoint(a){dB(this.hostElement,[a])}` (B@4479508) fires a bubbling `yt-action` named `yt-service-request` (B@1272532 `function dB`, B@1272090 `function aB`). The app's endpoint-handler behaviour turns that into the InnerTube request and runs the response's actions. Each response command goes back out as a `yt-action`, and `frameworkUpdates` go to the entity store (B@1661611 `function Vhb`).
     - `handleNavigationEndpoint(a){a=NM(a);this.navigator.navigate(a)}` (B@4479432) navigates in-app.
     - `handlePlaylistEditEndpoint` (B@4480049) sends the edit, then applies the response: header updates, `setVideoId` updates and actions.
   - The method names survive minification because the action map refers to them by string.

2. **The global command handler (`resolveCommand`).**
   - Components reach a singleton command handler through `YtComponentBehavior.resolveCommand(cmd)` → `jI` → `hI.instance.resolveCommand` (B@1694698, B@1691072).
   - It classifies a command with `b0b` (B@4147728):
     - anything with a `webCommandMetadata.url` is a page navigation;
     - anything the service-endpoint registry knows (B@4452147, `queueAddEndpoint:AX(OP)`, `likeEndpoint:AX(p6b)`, `playlistEditEndpoint:…`) is a service request, sent through the same `dB` as above (B@4148223 `function Cib`);
     - everything else becomes a `yt-action`.
   - `ytmusic-app.handleCommandWithCommandHandler(cmd)` calls this handler directly (B@4479630).
   - Most YouTube Music elements hold the behaviour as an injected property, such as `ytRendererBehavior` or `ytComponentBehavior`, rather than mixing it into the element. So `element.resolveCommand` may not exist the way `ytd-app.resolveCommand` does on youtube.com **(live check)**. The existing bridge's `typeof el.resolveCommand === "function"` filter (`yt-queue-bridge.ts:79-82`) would then find nothing.

3. **The ⋮ menu item's behaviour.**
   - `ytmusic-menu-service-item-renderer` (B@3444962) injects a "service menu item" behaviour whose `handleCommand` (B@3438008) special-cases the queue:
     - `queueAddEndpoint` → `handleQueueAddEndpoint` (B@3438534);
     - `removeFromQueueEndpoint` → `handleRemoveFromQueueEndpoint` (B@3440755);
     - `playlistEditEndpoint` → its own handler;
     - everything else → the generic `dB`.
   - This is the **only** place that both requests `music/get_queue` and inserts the result into the local queue. The only other user of the behaviour is the multi-select bar.

**Consequence.** A page script can reach layer 1 by calling those `ytmusic-app` methods, and layer 2 by calling `handleCommandWithCommandHandler`. Layer 3 is out of reach unless it builds a menu-item element. Sending a `queueAddEndpoint` through layer 1 or 2 sends the request and drops the answer. The [Pear Desktop approach](#21-play-next-and-add-to-queue) replays layer 3 instead.

`live-check.js` includes a `viaMenuItem` spike. It creates a detached `ytmusic-menu-service-item-renderer` and calls its behaviour's `handleCommand`. If that works, the extension would get YouTube Music's exact queue behaviour, including toasts, casting and the empty-queue case, at the price of relying on an internal property name (`ytmusicServiceMenuItemBehavior`, B@3444157) **(live check)**.

### 1.2 The network layer

- `ytmusic-app.created()` puts the app's services on the element: `this.navigator`, `this.queue`, `this.networkManager`, `this.playerUiService` and more (B@4468593).
- `networkManager.fetch(path, body)` (B@2555509) builds the request skeleton (B@2552260):
  - `clientName`/`clientVersion` from `ytcfg`, `hl`, `gl` and experiment IDs;
  - `context.user.onBehalfOfUser` from `DELEGATED_SESSION_ID`, which is how brand accounts are addressed;
  - the active player's `playerContextParams`.
- It signs the request the way the app's own calls are signed. The app's own `music/get_queue` call goes through the same object (`JO.instance.fetch("/music/get_queue", …)`, B@2624794; `JO.instance = new JO(this.networkManager, …)` in `created()`).
- It returns the raw JSON. It does **not** run response actions such as `runAttestationCommand`; `handleServiceEndpoint` does.
- Pear Desktop moved from `fetch()` to `networkManager.fetch` on 2024-12-27 (PEAR `80471b0c`). Its Music Together plugin's hand-built `music/get_queue` call started failing with HTTP 400 in July 2025 and was fixed the same way (PEAR #3661, `6374ff4a41`).

### 1.3 Compared with youtube.com and today's bridge

- Today's bridge sends `addToPlaylistCommand` through `resolveCommand` on a thumbnail or `ytd-app` (`yt-queue-bridge.ts:33-83`).
- The injection pattern carries over unchanged:
  - music.youtube.com sends the same CSP as www.youtube.com, `require-trusted-types-for 'script'` plus a `strict-dynamic` nonce policy (H, response headers);
  - the web-accessible-resource match `*://*.youtube.com/*` already covers it (inventory.md, "Manifest").
- Only the commands and entry points differ: the `ytmusic-app` methods above instead of `resolveCommand`.

## 2. Actions in detail

### 2.1 Play next and Add to queue

**The command.** Every song row, card and queue item carries both menu items (R-search, R-album, R-home, R-next):

```
menuServiceItemRenderer "Play next"    icon QUEUE_PLAY_NEXT
  serviceEndpoint.queueAddEndpoint = {
    queueTarget: { videoId, onEmptyQueue: { watchEndpoint: { videoId } } },
    queueInsertPosition: "INSERT_AFTER_CURRENT_VIDEO",
    commands: [ { addToToastAction: … "Song will play next" } ] }
menuServiceItemRenderer "Add to queue" icon ADD_TO_REMOTE_QUEUE
  … the same with "INSERT_AT_END"
```

- Albums, playlists and mixes use `queueTarget.playlistId` instead (R-album header menu: `OLAK5uy_…`; R-home cards: `RDCLAK5uy_…`).
- The client builds the same shapes itself for offline tracks and playlists (B@3262563 `PLAY_NEXT_TOAST_SONG`, B@3263462 `function PLb`).
- The shape has been stable for years. youtubei.js's 2021 `WEB_REMIX 1.20211213` fixture (`examples/parser/artist.json`, committed `c3f9824`, 2022-09-02) has 52 items each of `INSERT_AFTER_CURRENT_VIDEO` and `INSERT_AT_END`.
- ytmusicapi reads `queueAddEndpoint.queueTarget.videoId` as a video-ID fallback (YMA `navigation.py:37`, `parsers/browsing.py:156-165`).
- Neither library sends it. youtubei.js has no class for `queueAddEndpoint`, and `music/get_queue` appears nowhere in either (YJS `src/parser/nodes.ts:148-174`; YMA has no reference).

**What the menu item does** (`handleQueueAddEndpoint`, B@3438534):

1. **Empty queue, single target with `onEmptyQueue`:** run the item's toast commands and navigate to `onEmptyQueue.watchEndpoint`, which starts playback.
2. **Otherwise:** request `/music/get_queue` (`KCb`, B@2624794). The body is built by `OP.buildRequest` (B@2624070) as `{queueContextParams` (from the store), `queueInsertPosition, videoIds: [videoId]` or `playlistId, params}`. The response's `onResponseReceivedCommands` are run.
3. Store the response's `queueContextParams` (`SET_QUEUE_CONTEXT_PARAMS`).
4. Insert `queueDatas[].content` with `IP(queue, items, afterCurrent)` (B@2601829). That is a store `ADD_ITEMS` at `getCurrentItemIndex()+1` or at the end, with `shouldAssignIds: true`. If a cast session is active, the same items go to the cast device.
5. If the queue was empty: `SET_INDEX 0` and navigate to the first item.

**What a signed-out request returns.** R-queue is `{responseContext, queueDatas: [{content: {playlistPanelVideoRenderer}}], trackingParams, queueContextParams}`, so the request works without an account. Signed in, it is a **(live check)**.

**The same thing from a page script.** Pear Desktop (PEAR `src/renderer.ts:191-245`; queue API added in #2767 on 2024-12-25, insert position added in #2808 on 2025-01-01) and T3lluz/YTMQ (`src/bridge/ytmusic-bridge.ts:790-828`) both:
- call `app.networkManager.fetch("/music/get_queue", {queueContextParams: state.queue.queueContextParams, queueInsertPosition, videoIds})`;
- then dispatch `ADD_ITEMS {nextQueueItemId, index, items, shouldAssignIds: true}`.

Pear dispatches through the `#queue` element (`ytmusic-player-queue`), whose `queue` is the same singleton as `app.queue` (B@3588368, `this.queue=H().resolve(CN)`). The store is reachable as:
- `app.queue.store`: a wrapper with `getState`/`dispatch`/`subscribe` (B@1385069 `var YC=function`);
- `app.queue.store.store`: the raw Redux store, which Pear uses.

Pear skips three of the native steps:
- the empty-queue navigation;
- storing the returned `queueContextParams`;
- cast forwarding.

`live-check.js` adds the first two.

**Server queues.** The signed-out flags enable server-side queues (`music_web_enable_server_queues`, `music_web_enable_server_queue_restoration`, `music_web_enable_queue_reflection_polling`; H). That is why `queueContextParams` travels with every add: the server keeps its copy of the queue in step. Dispatching `ADD_ITEMS` without that request would desynchronise the two copies.

### 2.2 Remove from queue

- Queue items carry `menuServiceItemRenderer "Remove from queue"` with `removeFromQueueEndpoint {videoId, commands: [toast]}` (R-next). The server's copy has no `itemId`.
- The queue item element writes `itemId` into it when it renders (`setRemoveFromQueueEndpointItemId`, B@3579363).
- The ID is assigned on insert: `ADD_ITEMS` with `shouldAssignIds` stamps each item's `navigationEndpoint.watchEndpoint.index` with a running number (`byb`, B@2511852). The queue reads it back as `"" + index` (`uP`, B@2613863).
- `handleRemoveFromQueueEndpoint` (B@3440755) calls `queue.removeItem(itemId)` (B@2602225). That method:
  - finds the index;
  - tells the server queue (`serverQueueApi.removeItem`, a `playlistEditEndpoint ACTION_REMOVE_VIDEO` on the queue's backing playlist);
  - dispatches `REMOVE_ITEM`;
  - updates a cast session.
- **Recommendation:** `app.queue.removeItem(String(item.navigationEndpoint.watchEndpoint.index))`.
- Pear's `dispatch({type: "REMOVE_ITEM", payload: index})` (PEAR `src/renderer.ts:259-264`) skips the server queue.

### 2.3 Like, unlike, dislike

**The command.** `likeEndpoint {status, target: {videoId}}`.
- The request class picks the path from `status`: `like/like`, `like/dislike` or `like/removelike` (B@4448071; legacy class B@2545596).
- The body is `{target, params}`, where `params` is the endpoint's `likeParams`, `dislikeParams` or `removeLikeParams`. When responsive radio is on, `queueContextParams` is added (B@4448620).
- Building the request also dispatches `SET_VIDEO_LIKE_STATUS` into the store (`mvb`, B@2469324). That is why every like button bound to `likeStatus.videos[videoId]` updates.
- Both libraries agree on the paths and on `target: {videoId}`: YMA `mixins/_utils.py:13-24` and `mixins/library.py:361-376`; YJS `src/parser/classes/endpoints/LikeEndpoint.ts:4-48`. YouTube.js's own `interact.like` sends it as the `TV` client (YJS `src/core/managers/InteractionManager.ts:31`).

**Where it sits on rows:**
- `menu.menuRenderer.topLevelButtons[0].likeButtonRenderer {target: {videoId}, likeStatus, likesAllowed}` (R-album);
- the "Add to liked songs" toggle item. Signed in, its default and toggled endpoints are `likeEndpoint`s (YMA `parsers/watch.py:30-35`; PEAR `src/types/datahost-get-state.ts:446-490`). Signed out, it is a sign-in modal (R-search).

**Dispatch.**
- `app.handleServiceEndpoint({likeEndpoint})` is what YouTube Music's own `yt-like-endpoint` action calls (B@4467231).
- `ytmusic-like-button-renderer.updateLikeStatus(status)` (B@2691844):
  - is a toggle: the same status again sends `INDIFFERENT`;
  - picks the matching endpoint from `data.serviceEndpoints`;
  - sends it with the same `dB`.

  YouTube Music's `+` and `_` keys call it on the player bar (B@3532930 `configureShortcuts`), and so does Pear (PEAR `src/renderer.ts:113-123`).
- ytmdesktop fires the equivalent `yt-action` event by hand (`{actionName: "yt-service-request", args: [likeButtonEl, endpoint], returnValue: []}`, YTMD `scripts/togglelike.script.js:58`). It reads `returnValue[0].ajaxPromise` to await the result. youtube-music-companion does the same on `ytmusic-app` (`content/bridge.js:584-600`).
- For a promise, fire that event on `app` rather than calling `handleServiceEndpoint`, which returns nothing (B@4479508).

**Why not a raw request.** On 2025-08-08 and 2026-05-09, youtubei.js's maintainer wrote that "for every engagement action (like/dislike/subscribe), YouTube sends a command to run a BotGuard challenge. You have to run that challenge in a convincing way for the action to stay" ([YJS #1011](https://github.com/LuanRT/YouTube.js/issues/1011), [#1165](https://github.com/LuanRT/YouTube.js/issues/1165)). `ytmusic-app` handles `yt-run-attestation-command` (B@4484035; service registry `runAttestationCommand:AX(oZ)`, B@4452242). `handleServiceEndpoint` runs the response's actions; `networkManager.fetch` does not.

**The new player UI** (A/B test, §7) uses a Wiz `like-button-view-model`. It reads `likeStatusEntity` from the entity store rather than `likeStatus.videos` (B@1956400 `function Hpb`, B@1956638). Its `+` key clicks `like-button-view-model button` (B@3637431). The service-request path passes a response's `frameworkUpdates` to the entity store (B@1661611). So the button repaints if the like response carries a `likeStatusEntity` mutation; whether it does is a **(live check)**.

### 2.4 Save to library

- **Album and playlist tracks** carry a "Save to library" toggle: `feedbackEndpoint {feedbackToken}` (R-album). Library state is in `isToggled`.
- **Cards** carry "Save playlist to library": `likeEndpoint {target: {playlistId}}` (R-home).
- ytmusicapi's history shows this is the most churned area:
  - the token pairs swapped (2023-10, YMA #454);
  - "remove" tokens unpinned Listen Again instead (2025, #771/#819);
  - state moved to `isToggled` (2026-07, #961).

  It reads tokens by icon type `BOOKMARK_BORDER`/`BOOKMARK` (YMA `parsers/songs.py:115-185`).
- **Dispatch:** `app.handleServiceEndpoint(row's default or toggled endpoint)`; `yt-feedback-endpoint` maps there too (B@4467231). Always use the endpoint the row carries; never build tokens.

### 2.5 Save to playlist, membership, create

**One click to a known playlist.**
- Send `playlistEditEndpoint {playlistId, actions: [{action: "ACTION_ADD_VIDEO", addedVideoId}]}`, which the app turns into `browse/edit_playlist` (B@2546238 `innertubePath="/browse/edit_playlist"`; YMA `mixins/playlists.py:437-484`; YJS `PlaylistManager.ts:120-128`).
- **Duplicates.** ytmusicapi adds `dedupeOption: "DEDUPE_OPTION_SKIP"` to *allow* duplicates. Without it, YouTube Music rejects a duplicate and adds nothing (YMA `playlists.py:450, 462-464`). What the rejection looks like is unverified **(live check)**.
- **The response.** A success carries `status: "STATUS_SUCCEEDED"` and `playlistEditResults[].playlistEditVideoAddedResultData {videoId, setVideoId}`. The app turns those into `ytmusic-update-set-video-id` events (B@4481366).
- **Dispatch:** `app.handlePlaylistEditEndpoint({playlistEditEndpoint: …})`, which applies the response the way the app does. YouTube Music's own dialog fires the option's `addToPlaylistServiceEndpoint` through the generic path and closes (B@3413440).
- **Timing.** Since 2026-07, edits to a just-created playlist are rejected with HTTP 400 or 409 for about 20 s (YMA #963).

**The picker and membership.**
- "Save to playlist" opens `ytmusic-add-to-playlist-renderer` from `playlist/get_add_to_playlist`. The request is built from `addToPlaylistEndpoint` as `{videoIds, playlistId?, params?, excludeWatchLater: false}` (B@4439420).
- Signed in, the menu item's endpoint is `addToPlaylistEndpoint {videoId}`. ytmdesktop fetches the user's playlists exactly this way and reads `addToPlaylistRenderer.playlists` (YTMD `scripts/getplaylists.script.js:13-25`). Signed out, it is a sign-in modal (R-search).
- **YouTube Music's client never reads `containsSelectedVideos`** (zero occurrences in B).
- The option renderer uses only `title`, `shortBylineText`, `privacy`, `additionalIcons` and `addToPlaylistServiceEndpoint` (B@3413287 `var $T`, B@3413759). The dialog adds; it never shows a check mark or removes.
- youtubei.js parses `containsSelectedVideos: "ALL" | "NONE"` on the youtube.com renderer (YJS `src/parser/classes/PlaylistAddToOption.ts:13-29`). ytmusicapi has no membership call at all.
- So whether the `WEB_REMIX` response carries membership is open **(live check: `ytptCheck.playlistsFor(videoId)`)**.
- YouTube Music playlists are the account's YouTube playlists: the same `PL…` IDs, edited with the same `browse/edit_playlist` (YMA, YJS). So ticket 01's youtube.com answer applies if YouTube Music's doesn't.

**Create.**
- `playlist/create {title, privacyStatus, videoIds?}` (YMA `playlists.py:255-299`; client path list B@1273861 `q3a=["playlist/create"]`).
- Since 2026-07 YouTube Music can answer HTTP 200 with only a `showEngagementPanelEndpoint` (a gated "feature enablement" flow) instead of creating it (YMA #963, `mixins/_utils.py:61-77`).

### 2.6 Start radio ("Start mix")

- **Song:** `menuNavigationItemRenderer "Start mix"` (icon `MIX`), `watchEndpoint {videoId, playlistId: "RDAMVM" + videoId, params: "wAEB"}` (R-search, R-album, R-next).
- **Albums, playlists and cards:** `watchPlaylistEndpoint {playlistId: "RDAMPL" + playlistId, params: "wAEB"}`, next to "Shuffle play" `{playlistId, params: "wAEB8gECKAE%3D"}` or `"wAEB8gECGAE%3D"` (R-album, R-home).
- ytmusicapi uses the same prefixes and params (YMA `mixins/watch.py:121-139`, `docs/source/faq.rst:44-47`). It fixed radio repeating the same tracks in 2022 by adding `params: "wAEB"` (#282).
- **Dispatch:** `app.handleNavigationEndpoint(cmd)`, which is the action-map target for `yt-watch-endpoint` and `yt-watch-playlist-endpoint` (B@4467231). It starts playback and replaces the queue, as YouTube Music's own item does.
- Building the endpoint from a bare video ID (`"RDAMVM" + id`, `"wAEB"`) also works, but reading it from the row is safer.

### 2.7 Go to artist, Go to album

- `browseEndpoint {browseId, browseEndpointContextSupportedConfigs: {browseEndpointContextMusicConfig: {pageType}}}`.
- Page types are `MUSIC_PAGE_TYPE_ARTIST` (`UC…`), `MUSIC_PAGE_TYPE_ALBUM` (`MPREb_…`), `MUSIC_PAGE_TYPE_PLAYLIST` (`VL…`) and `MUSIC_PAGE_TYPE_USER_CHANNEL` (R-search, R-home).
- It appears on the "Go to artist" and "Go to album" menu items and in the row's title and subtitle runs. Album runs appear only on tracks that belong to an album.
- **Dispatch:** `app.handleNavigationEndpoint(cmd)`. `app.navigate(browseId)` (B@4478674) builds a bare `browseEndpoint`; Pear uses it for its start page (PEAR `src/renderer.ts:359-364`).
- ytmusicapi tells artist from album by `pageType`, or by the `MPRE` prefix (YMA `parsers/playlists.py:212-242`, `parsers/songs.py:42-51`). youtubei.js uses only prefixes (YJS `MusicResponsiveListItem.ts:204-234`).

### 2.8 Now playing and progress

**Readable from the content script alone (no bridge):**
- The player sets `navigator.mediaSession.metadata = new MediaMetadata({title, artist, artwork, album})` on every `videodatachange`. The album comes from the watch-next response's `browserMediaSessionRenderer` (PL@2066496).
- The `<video>` element gives `currentTime`, `duration` and `timeupdate`, as on youtube.com today (inventory.md, Auto-add).
- Web Scrobbler reads `navigator.mediaSession` (from an injected page script: `src/connectors/youtube-music-dom-inject.ts:24-30`). Reading it from the isolated world should see the same object **(live check)**.
- This route gives no video ID.

**From the page script:**
- `#movie_player` is the player. YouTube Music's player config sets `rootElementId: "movie_player"` (H, `WEB_PLAYER_CONTEXT_CONFIG_ID_MUSIC_WATCH`).
  - `getVideoData()` returns `video_id`, `title`, `author` and the list.
  - `getProgressState()` returns `current`, `duration`, `loaded`, `seekableEnd` and more (PEAR `src/types/music-player.ts:266-282`).
  - Events: `onVideoProgress`, `onVideoDataChange`/`videodatachange` and `onStateChange` (PEAR `src/providers/song-info-front.ts:270-299`; YTMD `scripts/hookplayerapievents.script.js:22-28`).
  - It survived the 2026-09 player-UI test. lidel/google-music-hotkeys moved onto it on 2026-10-07 for that reason (`add-on/background.js:30-56`).
- **The queue's selected item:** `app.queue.getItems()[app.queue.getCurrentItemIndex()]` (B@2605400) gives `videoId`, `title`, and byline runs with the artist and album `browseEndpoint`s. That serves "go to the current song's artist".
- **The store:** `app.queue.store.getState()`:
  - `player.playerResponse.videoDetails`, `player.isPlaying` and `player.adPlaying` (B@2510331);
  - `queue.repeatMode`;
  - `likeStatus.videos[videoId]`.

**Ads.** Free accounts get ads in the same player. The store flag `player.adPlaying` (`SET_AD_PLAYING`) is there to exclude them.

### 2.9 YouTube Music's own toasts

- `app.handleAddToToastAction(cmd)` opens YouTube Music's own toast (B@4467231 action map; B@4475939 `k.handleAddToToastAction`).
- The `commands` on every queue item are such toast actions: "Song will play next", "Item removed from queue" (R-search, R-next).
- This fits the map's rule "Inside YouTube, look like YouTube" better than an extension toaster on YouTube Music.

## 3. Row and card data

All of these are `data` properties on Polymer elements, so only the page world can read them. A Firefox content script could reach them through `wrappedJSObject`, but the injected bridge works on both browsers.

| Element | `data` is | Fields that matter |
|---|---|---|
| `ytmusic-responsive-list-item-renderer` (search, album, playlist, library rows) | `musicResponsiveListItemRenderer` | See the list below the table. |
| `ytmusic-two-row-item-renderer` (cards on Home, Explore, artist pages) | `musicTwoRowItemRenderer` | `navigationEndpoint.browseEndpoint` (`pageType`); `thumbnailOverlay…playNavigationEndpoint` (usually `watchPlaylistEndpoint`); `menu` with the same items, plus "Not interested" (`feedbackEndpoint`) on Home (R-home) |
| `ytmusic-player-queue-item`, or `app.queue.getItems()` | `playlistPanelVideoRenderer`, or `playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer` (B@2510980 `function Zxb`) | `videoId`, `playlistSetVideoId`, `selected`, `navigationEndpoint.watchEndpoint.index` (the item ID), `queueNavigationEndpoint` (a `queueAddEndpoint` with `params`), `menu` including "Remove from queue" and "Remove from playlist" (R-next) |
| Header of an album or playlist page | `musicResponsiveHeaderRenderer` | `buttons[]` with the album-level `menuRenderer`: Shuffle play, Start mix, Play next, Add to queue, Save to playlist, Go to artist (R-album) |
| `ytmusic-like-button-renderer` (inside rows and the classic player bar) | `likeButtonRenderer` | `target.videoId`, `likeStatus`, `serviceEndpoints[]` (B@2690675 `bindLikeStatusSelector`, B@2691844) |

**`musicResponsiveListItemRenderer` fields:**
- `playlistItemData {videoId, playlistSetVideoId?}`;
- `overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint`;
- `flexColumns[i].musicResponsiveListItemFlexColumnRenderer.text.runs[].navigationEndpoint` (title `watchEndpoint`; artist and album `browseEndpoint`);
- `menu.menuRenderer.items[]`;
- `menu.menuRenderer.topLevelButtons[0].likeButtonRenderer`;
- `multiSelectCheckbox` and `index` on album pages (R-search, R-album).

**Menu item kinds** (R-search, R-album, R-next):
- `menuNavigationItemRenderer`: Start mix, Save to playlist, Go to artist/album, Share;
- `menuServiceItemRenderer`: Play next, Add to queue, Remove from queue, Remove from playlist, Not interested;
- `toggleMenuServiceItemRenderer`: Add to liked songs, Save to library;
- `menuServiceItemDownloadRenderer`: download, Premium only.

Match them by **endpoint key**, not by position or label. ytmusicapi matches by icon type, which changed several times (§7); positions shift with sign-in state (R-search vs YMA fixtures).

**Signed in vs signed out.** Signed out, Save to playlist and Add to liked songs are `modalEndpoint` sign-in prompts (R-search). Signed in, they carry `addToPlaylistEndpoint` and `likeEndpoint` per YTMD and YMA **(live check)**.

**Finding the element for an action.**
- A content script can find rows by tag and hit-test them for hover buttons, as today's queue button does on youtube.com (inventory.md).
- The bridge reads `row.data` on request.
- The `data` object is replaced when Polymer recycles the element for another item, so read it at click time and never cache it per element.

## 4. YouTube Music's keyboard shortcuts

The full list is served in the page config as `HOTKEY_DIALOG` (H) and shown by `?` (B@2636878 `c.register("?"`):

| Section | Shortcut | Action |
|---|---|---|
| Playback | `Space` or `;` | Play/Pause |
| | `j` or `Shift+N` | Next song |
| | `k` or `Shift+P` | Previous song |
| | `l` or `Shift+→` | Forward 10 s |
| | `h` or `Shift+←` | Back 10 s |
| | `Shift+L` or `Ctrl+Shift+→` | Forward 1 s |
| | `Shift+H` or `Ctrl+Shift+←` | Back 1 s |
| | `s` | Shuffle queue |
| | `r` | Toggle repeat |
| General | `=` / `-` | Volume up / down |
| | `m` | Mute |
| | `q` or `Esc` | Toggle queue / expanded player |
| | `f` | Full screen |
| | `+` | Like current song |
| | `_` | Dislike current song |
| Navigation | `g h`, `g e`, `g l`, `g ,` | Home, Explore, Library, Settings (two-key sequences, within 1.5 s) |
| | `/` | Search |
| | `?` | This list |

The registrations match the dialog:
- the classic player bar (B@3532930) and the new Wiz player controls (B@3637431);
- the player service (B@2582239);
- the sequences (B@2480778);
- `s` and `/` come from the shortcut manager's other registrations.

**How the listener behaves** (`SP`, B@2631532 and B@2632369):
- It is a `keydown` listener on `document`, plus a capture-phase one for `Space` on buttons and `#movie_player`.
- It ignores events whose composed path contains `INPUT`, `SELECT`, `TEXTAREA` or `EMBED` (B@2629545).
- `keyboardEventMatchesKeys` rejects an event with Alt, Ctrl or Meta held unless the binding names that modifier. A one-letter binding requires no modifier at all.
- It calls `preventDefault()` on a match.

**What follows:**
- Every `Alt+…` and `Meta+…` combination is unbound by YouTube Music.
- `Ctrl+…` and `Ctrl+Shift+…` are unbound except `Ctrl+Shift+←/→`.
- `Shift+letter` is unbound except `N`, `P`, `L` and `H`.
- Plain letters are mostly taken. `a b c d e i n o p t u v w x y z` are free, but `g` starts the sequences.
- A content-script listener on `window` in the capture phase runs before YouTube Music's `document` listener and can claim a key first. It must apply the same input-field exclusion.
- `chrome.commands` shortcuts are handled by the browser before the page, so they never clash with YouTube Music. Their limits are ticket 08's.
- The embedded player's own keys are off: `disableKeyboardControls: true` (H, `WEB_PLAYER_CONTEXT_CONFIGS`).

## 5. The installed app window and Firefox

Agent-read from browser source and vendor docs. Nothing was run.

### Chrome (desktop)

- **What the window is.** An installed PWA opens as a `TYPE_APP` browser window (CR `chrome/browser/ui/browser_window/internal/create_browser_window_non_android.cc` L59-71; launched from `web_app_launch_utils.cc` L634, L728-733). Extension APIs report it as `"app"` (CR `chrome/browser/extensions/browser_extension_window_controller.cc` L78-81).
- **Content scripts.** App windows support tabs (CR `extension_tab_util.cc` L1256-1270), so the app's page has a tab ID that `scripting`, `tabs.sendMessage` and content-script injection can use. No code skips injection by window type, but no doc or test states it either **(live check)**.
- **Toolbar action.**
  - On Windows, macOS and Linux, the extensions container sits in the app's title bar in "compact" mode, and icons may drop out when the window is narrow (CR `chrome/browser/ui/views/web_apps/frame_toolbar/web_app_toolbar_button_container.cc` L235-274; `extensions_toolbar_desktop.h` L52-71).
  - The browser test `web_app_frame_toolbar_browsertest.cc` L767-806 checks the container appears once an extension is installed.
  - `kDesktopPWAsElidedExtensionsMenu`, which moves extensions into the ⋮ app menu, is on by default only on ChromeOS (CR `chrome/common/chrome_features.cc` L198-206).
  - Extension actions in PWA windows date from r539074 (Chrome 66, crbug 762401). The current puzzle container dates from r691734 (Chrome 78).
- **Popup.** A popup's current window is the window that hosts it, so `tabs.query({active: true, currentWindow: true})` from a popup opened in the app returns the app's tab (CR `extension_view_host_factory.cc` L73-75, L260-267; `chrome_extension_function_details.cc` L38-52).
- **`chrome.windows`.**
  - The schema says the default filter is `['normal', 'popup']` and calls `app` deprecated (CR `chrome/common/extensions/api/windows.json` L15-29).
  - The implementation applies no type filter when none is given and excludes only devtools (CR `windows_api.cc` L95-101, L478-500; `windows_util.cc` L76-89).
  - So expect the app window in `getAll` with `type: "app"` **(live check)**.
- **Keyboard commands.** Every browser window, app windows included, gets an extension keybinding registry. A fired command grants `activeTab` on that window's tab (CR `browser_window_features.cc` L807-813; `extension_keybinding_registry.cc` L227-270) **(live check)**.
- **Side panel.** Refused outside normal browser windows (CR `side_panel_coordinator.cc` L137-140).
- **Link capturing.**
  - From Chrome 139 on desktop, links that open a new tab or window go to the installed app by default (developer.chrome.com/docs/capabilities/pwa-navigation-management; CR `content/public/common/content_features.cc` L1589-1598).
  - YouTube Music's manifest has no `scope`, `display_override` or `launch_handler` and uses `display: "minimal-ui"`, `start_url: "/?source=pwa"` (`https://music.youtube.com/manifest.webmanifest`, fetched 2026-10-19).
  - So once installed, many YouTube Music visits happen in the app window.
- **Telling you're in the app.** `matchMedia("(display-mode: minimal-ui)")` matches in the app window (CR `browser_web_contents_delegate.cc` L1216-1233). From the background, `chrome.windows.get(sender.tab.windowId)` gives `type === "app"`.

### Edge

- Microsoft: installed apps, including Store-installed PWAs, "use the same web engine, settings, extensions, and features as Microsoft Edge" (support.microsoft.com/en-us/edge/apps-and-widgets-that-depend-on-microsoft-edge).
- The installed app's "…" App info menu has an **Extensions** submenu (learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/ux, "App info menu", updated 2026-09-02).
- Whether Edge also shows Chromium's title-bar puzzle icon is unverified; Edge is closed source **(live check)**.
- A Microsoft Store catalogue search on 2026-10-19 found no YouTube Music app published by Google. The Store's results are third-party native clients such as "YMusic Box" (9NS6ZG9KFNM8), which won't run Edge extensions.

### Firefox

- **Availability.**
  - Web apps ("Taskbar Tabs") shipped on Windows in Firefox 143 (2025-09-16, release notes: the windows keep "access to your installed add-ons").
  - Microsoft Store installs followed in 150 (2026-04-21). ESR 153 (2026-07-21) includes the feature.
  - The pref `browser.taskbarTabs.enabled` defaults to true only on Windows (FX `browser/app/profile/firefox.js` L394-398).
  - Linux works but is off by default, and Snap is unsupported (FX `browser/components/taskbartabs/docs/architecture.md` L67). macOS is "not currently available" (`docs/index.md` L8-10).
- **Content scripts.** "Web app pages have the same access, controls, and add-ons as a normal tab" (FX `browser/components/taskbartabs/docs/index.md` L30).
- **Toolbar.** The web-app window hides the toolbar but keeps `#unified-extensions-button` and pinned `.unified-extensions-item`s (FX `browser/themes/shared/toolbarbuttons.css` L149-175).
- **Commands.** Registered in every browser window (FX `toolkit/components/extensions/ExtensionShortcuts.sys.mjs` L310-329) **(live check)**.
- **Quirks.**
  - Web-app windows report `windows.type: "normal"` and can't be filtered (FX `ext-tabs-base.js` L1077-1089; Bugzilla 1991315 asks for a way, UNCONFIRMED).
  - `tabs.create` without a `windowId` never opens into one (FX `ext-tabs.js` L692-695).
  - The window always sets `display-mode: minimal-ui` (FX `TaskbarTabsWindowManager.sys.mjs` L160-163).
- **ESR versions.** ESR 140's last release was 140.17.0 on 2026-09-29 (whattrainisitnow.com). That bears on the `strict_min_version` 125 that keeps today's bridge on `injectScript` (inventory.md, "Bridge injection").

## 6. Hand-built `WEB_REMIX` requests compared

| | Page's own machinery (`ytmusic-app` methods, `networkManager`) | Hand-built `youtubei/v1` request with `WEB_REMIX` |
|---|---|---|
| **Auth** | The app signs it; the extension never touches cookies (B@2552260) | `Authorization: SAPISIDHASH <ts>_<sha1(ts SAPISID origin)>` from the `__Secure-3PAPISID` cookie, plus `X-Goog-AuthUser` and `Origin: https://music.youtube.com` (YMA `helpers.py:55-71`, `ytmusic.py:155-190`). youtube-music-companion computes it in the page from `document.cookie` (`content/bridge.js:1021-1066`). Ruled out by the store-policy decision. |
| **Client version** | Whatever the page runs | Must be kept current. ytmusicapi got HTTP 404 with `clientVersion: "0.1"` in 2022 (#296) and now sends `1.<today>.01.00` (YMA `helpers.py:33-42`). youtubei.js still sends `1.20250219.01.00` (YJS `src/utils/Constants.ts:51-54`). |
| **Brand accounts** | `onBehalfOfUser` from `DELEGATED_SESSION_ID` (B@2552260) | Must be supplied (YMA `ytmusic.py:151-152`) |
| **Response actions** (toasts, attestation, store updates) | Run by `handleServiceEndpoint` / `handlePlaylistEditEndpoint` | Not run; likes may be silently dropped (YJS #1011/#1165) |
| **Queue** | Can update the tab's queue | Can't. The queue is the tab's state, and the request alone desynchronises it. |
| **Works without a YouTube Music tab** | No | Yes, from wherever ticket 02 allows |

## 7. Stability and breakage history

**Stable for years (InnerTube shapes):**
- `queueAddEndpoint` with `INSERT_AFTER_CURRENT_VIDEO` / `INSERT_AT_END` is unchanged between `WEB_REMIX 1.20211213` (YJS fixture `examples/parser/artist.json`, `c3f9824`) and today (R-search).
- The `like/like`, `like/dislike` and `like/removelike` paths and the `target: {videoId}` body are unchanged since 2020 (YMA `64421bc`).
- `RDAMVM`/`RDAMPL` + `wAEB` radio has held since 2022 (YMA #282).

**Churns (the web app's internals)** — dates are when third parties noticed:

| Date | What changed | Seen in |
|---|---|---|
| 2024-02/03 | Player bar `onRepeatButtonTap()` renamed `onRepeatButtonClick()` | PEAR #1810, `47dbeff0` |
| 2024-03-01 → 04-15 | The Redux store left `ytmusic-player-bar`, then every element; ytmdesktop moved to hooking the store at construction | YTMD `9c977129`, `7ac9c1b9` |
| 2024-09-17 | `ytmusic-app.openToast()` replaced by `toastService.show()` | PEAR `178bfa48` |
| 2024-09 → 11 | Trusted Types enforcement broke `innerHTML` in injected code | PEAR `d5a5ed35`, `9bc42f83`, `516fbff3` |
| 2024-12-28 | `onVolumeTap` renamed `onVolumeClick` | PEAR #2791 |
| 2025-06-05, 2025-09-03 | Wiz `yt-button-shape` replaced paper buttons; Polymer `.set()` stopped working on those | YTMD `62d5c6fa`, `4443789f` |
| 2025-07 | A hand-built `music/get_queue` request (hard-coded key and auth) started returning 400; switched to `networkManager.fetch` | PEAR #3661, `6374ff4a41` |
| 2026-02-12 | Store hook via decorators stopped working; moved to `PolymerFakeBaseClassWithoutHtml` | YTMD `eec02699` |
| 2026-09-08 | Player bar's `playerApi` no longer reachable from the DOM at startup | YTMD #1807, `a1d7e3f7` |
| **2026-09-29 → open** | **A/B test: a Wiz "miniplayer" replaces `ytmusic-player-bar` and `#like-button-renderer` (`ytmusic-miniplayer`, `ytmusic-wiz-player-controls`). It breaks ytmdesktop (startup hang), Pear's next/previous/like, Web Scrobbler and lidel's hotkeys.** Pear PR #4750 reports that `#queue`'s queue API and store survive. | YTMD #1819; PEAR #4727/#4728/#4741; Web Scrobbler #6242; lidel #25 (fixed by moving to `#movie_player`, `535337cc`). The flag is real: `music_web_enable_wiz_miniplayer`, reflected as `ytmusic-app[is-miniplayer-enabled]` (B@2676545, B@4489797). It is not on in the signed-out flags (H). |

**Churns (InnerTube):**

| Date | What changed | Seen in |
|---|---|---|
| 2022-09 | `clientVersion "0.1"` → HTTP 404 on `next` | YMA #296 |
| 2023-10 | Library add/remove feedback tokens swapped | YMA #454 |
| 2024-03 → 05 | Two-column browse layout A/B test broke playlists and albums | YMA #544/#562 |
| 2024-11 | OAuth requests started failing with HTTP 400 | YMA #676, discussion #682 |
| 2025-02 | Playlists capped at 100 items per response; new body continuations | YMA #736; YJS #904 |
| 2025-05 → 11 | "Remove from library" tokens unpinned Listen Again instead | YMA #771/#819 |
| 2025-08 → 2026-05 | Likes need a BotGuard challenge run in a real browser | YJS #1011/#1165 |
| 2026-07 | Toggle state moved to `isToggled`; `playlist/create` gated; edits to new playlists rejected for about 20 s | YMA #961/#963 |
| 2026-09/10 | Play-button position and artist `radioId` location changed | YMA #1019/#1020 |

**What this means for 2.0:**
- **Lean on:** InnerTube command shapes, `ytmusic-app`'s string-keyed handler methods (`handleServiceEndpoint`, `handleNavigationEndpoint`, `handlePlaylistEditEndpoint`, `handleAddToToastAction`), `networkManager.fetch`, `#movie_player`, and `app.queue` with its store. These are the pieces third parties still reach through each change above.
- **Avoid:** player-bar elements and methods, DOM selectors inside buttons, and menu positions or labels.
- **The fragile piece:** the `ADD_ITEMS` payload shape. It is internal Redux state, and the empty-queue and server-queue rules around it have already moved once. When an insert fails, YouTube Music's ⋮ menu is still one right-click away; per the map, opening it is exempt.

## 8. Live checks

Run [`youtube-music/live-check.js`](youtube-music/live-check.js) in a signed-in music.youtube.com tab in Chrome, Firefox, and the installed app window. Then confirm:

1. **Entry points.** `ytmusic-app` exposes `handleServiceEndpoint`, `handleNavigationEndpoint`, `handlePlaylistEditEndpoint`, `handleCommandWithCommandHandler`, `navigate`, `networkManager.fetch` and `queue.{getItems, getCurrentItemIndex, removeItem, isEmpty, store}`. Also check whether `resolveCommand` exists on the element.
2. **Queue.** `ytptCheck.playNext(id)` / `addToQueue(id)` / `playNextPlaylist(id)` insert in the right place, survive a reload (server queue restore), and work with an empty queue. `removeFromQueue(i)` removes the item and the removal survives a reload.
3. **Like.** `ytptCheck.like(id)` updates the like state in the classic player bar and in the Wiz miniplayer, if your account is in that test, and the like is still there hours later.
4. **Save.** `ytptCheck.saveTo(playlistId, id)` adds once. Find out what a second, duplicate call returns.
5. **Membership.** `ytptCheck.playlistsFor(id)` shows whether a `WEB_REMIX` `get_add_to_playlist` response carries `containsSelectedVideos` or any other membership signal.
6. **Menu-item spike.** `ytptCheck.viaMenuItem(row.data.menu.menuRenderer.items[i].menuServiceItemRenderer.serviceEndpoint)` runs YouTube Music's own Play next.
7. **Now playing.** `navigator.mediaSession.metadata` is readable from an extension content script on Chrome and Firefox.
8. **Signed-in rows.** The "Save to playlist" and "Add to liked songs" items carry `addToPlaylistEndpoint` and `likeEndpoint`.
9. **App windows.**
   - Chrome, Edge and Firefox (Windows), with YouTube Music installed: the content script runs; the toolbar button or puzzle menu is reachable and the popup anchors there; `commands` fire while the app window is focused.
   - Chrome: `chrome.windows.getAll()` lists the app window as `"app"`.
