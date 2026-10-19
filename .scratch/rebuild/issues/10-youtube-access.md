# How does the extension talk to YouTube?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 01, 02, 03, 21, 25

## Question

With [ticket 01](01-youtube-requests.md), [ticket 02](02-request-context.md) and [ticket 03](03-store-policy.md) answered, decide:
- for each job, which request is sent, from where, and with what fallback;
- whether any Data API fallback remains, under ADR-0001's rule;
- what happens when the user isn't signed in to YouTube, or no YouTube tab is open;
- the permission set;
- the minimum Chrome and Firefox versions.

Update ADR-0001 if the mechanism changes it.

Also from [ticket 03](03-store-policy.md):
- No `cookies` permission and no faked request origins. Let YouTube's own page authenticate requests where possible.
- Fetch no remote config or selectors.
- A Data API fallback is nearly unavailable, because YouTube's API policies forbid mixing it with undocumented APIs. Settle the fallback clause of ADR-0001 accordingly.

Also from [ticket 06](06-upgrade-path.md): if every origin stays under `*://*.youtube.com/*`, upgrading Firefox users need no grant step. Any other origin means a grant flow for every upgrading user, because MV3 updates never grant new host permissions.

Also from [ticket 02](02-request-context.md):
- **Where requests go from:** send from the YouTube tab's MAIN world, and route popup and settings requests through a live YouTube tab.
- **No tab:** choose the behaviour: cached data plus "Open YouTube", a hidden frame if [ticket 25](25-live-checks.md) proves it, or reopen ticket 03's rule against rewriting Origin.
- **Cookies:** may the MAIN world read SAPISID from `document.cookie` if YouTube's own client can't send everything? Ticket 03 rules out the `cookies` permission and rewriting Origin, not this.
- **Several tabs:** which tab is used when YouTube tabs differ in account or container (with [ticket 11](11-accounts.md)), and what happens with discarded or frozen tabs.
- **Version floors:** Chrome 111 or higher; Firefox 128, 140 or 153.
- **Host access:** detect missing or withheld youtube.com access at startup.

Also: 2.0 runs on music.youtube.com too. Check that the final content-script matches stay inside the `*://*.youtube.com/*` access 1.4.5 users already granted, so the Firefox upgrade stays silent ([ticket 06](06-upgrade-path.md)).

Also from [ticket 01](01-youtube-requests.md):
- **Auth for reads and create:** these need either the `yt-service-request` route (if [ticket 25](25-live-checks.md) proves it), reading `SAPISID` in the page to build the auth hash (declared as "Authentication information" on the Chrome Web Store), or copying headers off YouTube's own requests. Re-decide ticket 03's cookie rule with that in hand.
- **Results:** read success from the response's `status`, not the HTTP code.
- **Client version:** requests sent outside a tab need a fresh client version.

## Answer

Resolved 2026-10-19. The user delegated the decisions, so each judgement call names its runner-up and why it lost. Choices marked **PROVISIONAL** wait on [ticket 25](25-live-checks.md). Its results only fill in the [route table](#6-filling-in-the-routes-from-ticket-25), and the design stays as it is. Folded in from tickets [11](11-accounts.md) (accounts), [12](12-adding.md) (adding) and [26](26-youtube-music-quick-actions.md) (YouTube Music quick actions).

**In short:**
- Every request to YouTube is sent from inside an open youtube.com or music.youtube.com tab, from the page's own world, through the account that tab is signed in to.
- YouTube's own client builds and signs requests wherever it can hand the result back without showing anything. Otherwise the extension signs the request itself in the page, from the session cookie, exactly as YouTube's code does. That costs one store disclosure.
- With no YouTube tab open, the popup and settings show cached data and offer "Open YouTube". There's no hidden frame and no Data API, not even as a fallback.
- **Permissions:**
  - **Chrome:** `storage`, `scripting`, `https://www.youtube.com/*`, plus `https://music.youtube.com/*` as an optional permission.
  - **Firefox:** `storage`, `scripting`, `*://*.youtube.com/*`.
- **Page scripts:** registered per feature at runtime, only while the feature is on.
- **Minimum versions:** Chrome 121, Firefox 140.

### 1. Where requests are sent from

- **Every request goes out from a YouTube tab's page (MAIN) world:** youtube.com jobs from a www.youtube.com tab, YouTube Music jobs from a music.youtube.com tab, the installed YouTube Music app included. YouTube rejects the extension's own origin with 403 ([ticket 02](02-request-context.md)), so nothing is sent from the background, the popup, the settings page or an offscreen document.
- **Two scripts per tab, called the site core:**
  - **The gateway** runs in the page world. It reaches `ytcfg`, YouTube's command machinery and `ytmusic-app`, and it sends every request.
  - **The bridge** is an isolated content script. It talks to the extension and passes jobs to the gateway as `CustomEvent`s with JSON-string payloads, so no `cloneInto` is needed.
- **Each job carries only what that job needs:** a video ID, playlist IDs, a title. Settings, channel filters and other accounts' data never enter the page ([ticket 03](03-store-policy.md), AMO §6.3).
- **Jobs from inside a tab run in that tab.** That covers auto-add, playlist shortcuts, quick-save, Add to queue, the card menu and quick actions. They use that tab's account ([ticket 11](11-accounts.md)).
- **Jobs from the popup or settings run in a serving tab** ([section 5](#5-which-tab-serves-a-job)).
- **`ytcfg` is read when the job runs,** never cached across page loads. That covers the client name and version, visitor data, the session index, `DELEGATED_SESSION_ID`, `LOGGED_IN` and `DATASYNC_ID`. A stale client version, which gets HTTP 400, can't happen, because nothing is ever sent outside a live page ([ticket 01](01-youtube-requests.md)).
- **No remote config, selectors or endpoint maps** are ever fetched. Everything ships in the package.

### 2. Routes

A route is how the gateway gets a job done. In order of preference:

| Route | What it is | Who builds and signs the request |
|---|---|---|
| **YouTube command** | Hand a command object to YouTube's own resolver: `resolveCommand(cmd, {commandController})` on `ytd-app` or the card's own element. The result comes back through `onSuccess` / `onServerError`. | YouTube's code |
| **YouTube service request** | Fire YouTube's `yt-service-request` action with the endpoint from a short-lived, invisible element under `ytd-app`. Read the response from `yt-service-request-completed`, then remove the element. | YouTube's code |
| **YouTube Music handler** | `ytmusic-app`'s own methods (`handleServiceEndpoint`, `networkManager.fetch`), `app.queue`, and the ⋮ menu item's own queue behaviour ([ticket 21](21-youtube-music-internals.md)). | YouTube Music's code |
| **Signed request** | The gateway's own same-origin `fetch` to `/youtubei/v1/<path>`. It copies YouTube's header and context builder (ticket 01 §1). `Authorization` is computed the way YouTube computes it, from the `SAPISID`, `__Secure-1PAPISID` and `__Secure-3PAPISID` values in `document.cookie`. www.youtube.com only. | The extension, in the page |
| **Plain request** | The same `fetch`, with no `Authorization`, for public data. | The extension, in the page |
| **Page read** | Read what the page already holds: `ytcfg`, the player response, YouTube's navigation event, the `<video>` element, `navigator.mediaSession`, renderer `data`. No request. | — |
| **YouTube's own UI** | The right-click card menu opens YouTube's own ⋮ menu. The map exempts this, because it is the feature itself. | — |

**When a route qualifies for a job.** All three conditions must hold:
1. It hands the full response back to the gateway.
2. It's quiet: YouTube shows nothing because of it, on success or failure. Our feedback is the only feedback, governed by each feature's feedback option (tickets [12](12-adding.md) and [26](26-youtube-music-quick-actions.md)).
3. It needs no click on YouTube's visible UI.

**Two kinds of visible change are allowed,** because each is the result the user asked for:
- the queue appearing or growing after Add to queue or Play next;
- a like button's state changing after a like.

**Among qualifying routes, YouTube's own wins** (YouTube command, service request, YouTube Music handler) over a signed request. Ticket 03 asks that YouTube's page authenticate requests where possible.

**Rejected routes:**
- **Copying headers off YouTube's own requests** by wrapping `window.fetch`:
  - it has to patch every YouTube page at `document_start`, whether or not a feature needs it;
  - it handles the same credential anyway;
  - it depends on YouTube having just made a signed-in request.
- **Background requests with the `cookies` permission and a rewritten Origin:** ruled out by ticket 03. They also see only the default cookie store, so they're blind to containers and private windows.

### 3. The cookie rule

**Settled:** the gateway may compute YouTube's auth hash in the page from `document.cookie`, which is the signed-request route, under these limits:
- **Where:** only in a www.youtube.com tab's page world, the same place and the same values YouTube's own code reads.
- **When:** only for a job no YouTube-built route qualifies for, or as that job's runtime fallback once the route ships ([section 7](#7-runtime-rules)).
- **Where the value goes:** the cookie value is used only to compute the header for the same-origin request. It's never stored, logged, passed to the bridge, or sent anywhere else.
- **Never:**
  - the `cookies` permission;
  - reading cookies outside a YouTube page;
  - rewriting `Origin` or `Referer`;
  - stripping security headers.
- **Exception:** if live check L3 shows YouTube accepts same-origin requests carrying cookies alone, the signed request drops the hash, and nothing reads cookies at all.

**Store-disclosure consequence.** These apply only if the signed request ships, which is decided at release from the table in section 6:
- **Chrome Web Store privacy tab:** tick **Authentication information**, next to Web history, User activity and Website content (ticket 03).
- **Privacy policy:** says, in substance: "In your YouTube tab, the extension reads YouTube's own sign-in cookie to sign its requests to YouTube, the same way YouTube's page does. It never stores that value or sends it anywhere else."
- **AMO reviewer notes:** name the signed-request route and the endpoints it serves.
- **[Ticket 23](23-ask-amo.md):** should ask whether this changes `data_collection_permissions: none`. Listed precedents that do the same declare `none`.
- **Review time:** review shouldn't take longer. Ticket 03's "lengthens review" applies to the `cookies` permission, which isn't requested (unverified).
- **Expected outcome:** the signed request ships. Ticket 01 found that create's YouTube command drops the new playlist ID, and the account-menu and Save-dialog reads open YouTube's popups when run as YouTube commands. So tickets 19 and 22 should draft the listing and disclosures with it.
- **If ticket 25 shows otherwise:** if the service request qualifies for every signed read and for create, the signed request doesn't ship and the disclosure is left out.

**Runner-up:** "never read cookies; drop or degrade any job YouTube's own client can't do quietly". It lost for three reasons:
- create, the account label and maybe the picker would hang on an unproven internal action;
- the cost it avoids is one disclosure line, which listed precedents carry (Multiselect, PocketTube, Watch Later Tidy);
- ticket 03's own wording is "where possible", not "never".

### 4. Jobs, routes and fallbacks

**Sending context** is "the tab" (the tab where the action happens) or "a serving tab" (chosen per [section 5](#5-which-tab-serves-a-job)). Always the page world.

#### youtube.com

| Job | Route (primary) | Sending context | Fallback | Decided by |
|---|---|---|---|---|
| **Signed in, and which account** | **Page read:** `ytcfg` `LOGGED_IN` and `DATASYNC_ID`, at page load (ticket 11). Every response's `responseContext.mainAppWebResponseContext.datasyncId` is checked against it (the account guard, section 7). | The tab or a serving tab. In the popup, an on-demand probe ([section 8](#8-off-costs-nothing-per-feature-registration)). | None needed | L7 (ticket 11's identity checks) |
| **Account label** (name, @handle, avatar) | **PROVISIONAL:** YouTube service request for `account/account_menu` | Any tab of that account | Signed request. If neither is available: "Unnamed account" (ticket 11). | L2 |
| **Playlists plus membership for one video** (picker; the read before every add, ticket 12) | **PROVISIONAL:** YouTube service request for `playlist/get_add_to_playlist` `{videoIds:[id], excludeWatchLater:false}`. Parse both response shapes (renderer and view model). | The tab, or a serving tab for popup and settings | Signed request | L2, L5 |
| **Playlist list without a video** (settings, popup), thumbnails and counts | **PROVISIONAL:** YouTube service request for `browse {browseId:"FEplaylist_aggregation"}`. Watch Later (`WL`) is added as a fixed entry if it isn't listed. | A serving tab | Signed request. If the lockups lack privacy, the privacy shown is from the last `get_add_to_playlist`. | L2, L5 |
| **Add a video** (auto-add, shortcut, quick-save, picker; Watch Later and Shorts included) | **PROVISIONAL:** YouTube command `playlistEditEndpoint {playlistId, actions:[{action:"ACTION_ADD_VIDEO", addedVideoId}]}` with `commandController`. Success is read from `status`, never the HTTP code. | The tab; a serving tab for popup picker adds | YouTube service request, then signed request | L1, L2, L6 |
| **Undo an add** | Same route as the add, with `ACTION_REMOVE_VIDEO` and the `setVideoId` the add returned | The tab where the add ran (or the serving tab) | As for the add | L1, L6 |
| **Create a playlist** | **PROVISIONAL:** YouTube service request for `createPlaylistServiceEndpoint` (the YouTube command is excluded because it drops the new ID). Rate limits are handled per ticket 12. | The tab, or a serving tab | Signed request `playlist/create`. With no tab: "Open YouTube to create playlists" (ticket 12). | L2 |
| **Add to queue** | YouTube command `addToPlaylistCommand {listType:"PLAYLIST_EDIT_LIST_TYPE_QUEUE"}` on the card's own element, as 1.5.0 does. Works signed out. | The tab | None: no other route reaches the queue. YouTube's ⋮ menu stays available. | L8 (the confirmation signal) |
| **Queue confirmation** | **PROVISIONAL:** page read of the queue's own data (the miniplayer's playlist-panel renderer `data`) until the video appears, within the 2 s budget. | The tab | The miniplayer turning active, for a first add. Without either signal the gateway reports `unconfirmed`, never success (ticket 12). | L8 |
| **A video's channel** (channel filters) | **Page read:** `yt-navigate-finish` detail, else `#movie_player.getPlayerResponse()`. Shorts: the navigation event's reel data. | The tab | **Watch pages:** plain request `next`. **Shorts:** plain request `reel/reel_item_watch`. | L9 (Shorts player) |
| **Typed channel → channel ID**, title and @handle | **Plain request:** `navigation/resolve_url`, following up to 3 `urlEndpoint` hops, accepting only `UC…` with `WEB_PAGE_TYPE_CHANNEL`. Then a plain request `browse {browseId:"UC…"}` for the title and handle. | A serving tab | With no tab, only `UC…` IDs and `/channel/UC…` URLs are accepted (parsed offline). Other forms show "Open YouTube to look up this channel". | Settled |
| **Watch progress** (auto-add) | **Page read:** the `<video>` inside `#movie_player` or `#shorts-player` ([ticket 07](07-watched.md)) | The tab | — | L9 |
| **Right-click card menu** | YouTube's own UI (exempt) | The tab | The browser's own menu | Settled |

#### YouTube Music

| Job | Route (primary) | Sending context | Fallback | Decided by |
|---|---|---|---|---|
| **Signed in, and which account** | **Page read:** `ytcfg` `LOGGED_IN` and `DATASYNC_ID` (ticket 11) | The tab | — | L7 |
| **Play next / Add to queue** (song, album, playlist) | **PROVISIONAL:** the ⋮ menu item's own behaviour (`handleCommand` on a detached `ytmusic-menu-service-item-renderer`), with the endpoint's toast `commands` removed so YouTube Music shows nothing. Matches YouTube Music exactly: empty queue, server-queue context, casting (ticket 26). | The tab (a serving YouTube Music tab for popup or keyboard-command jobs) | **Queue replay:** `networkManager.fetch("/music/get_queue")`, store `queueContextParams`, dispatch `ADD_ITEMS`. On an empty queue, `handleNavigationEndpoint(onEmptyQueue)`. Both are page-internal, so the fallback costs no disclosure. | M1 |
| **Undo Remove from queue** (re-insert at the old position) | Queue replay, with `ADD_ITEMS` at the old index | The tab | None. Undo then reports "Couldn't undo" (ticket 26). | M1 |
| **Remove from queue** (and undo of Play next / Add to queue) | `app.queue.removeItem(itemId)` | The tab | None | M1 |
| **Like / unlike** | `app.handleServiceEndpoint({likeEndpoint})`. The only route, because of the bot check. | The tab | None | M3 |
| **Save to a known playlist**, and undo | **PROVISIONAL:** `networkManager.fetch("/browse/edit_playlist")`. Quiet; returns `status` and `setVideoId`. A duplicate rejection reads as "already in" (ticket 12). | The tab | None on YouTube Music: the action isn't offered if `networkManager` is missing (ticket 26). | M2 |
| **Playlists plus membership for one song** (picker; the read before a save) | **PROVISIONAL:** `networkManager.fetch("/playlist/get_add_to_playlist")` | The tab | **Membership,** if the YouTube Music response carries none: a youtube.com serving tab of the same account, in a window of the same kind. Else the picker shows no ticks, with ticket 12's note. | M2 |
| **Create a playlist** | `networkManager.fetch("/playlist/create")`. YouTube Music's gated "feature enablement" answer counts as a failure. | The tab | — | M2 |
| **Account label** | `networkManager.fetch("/account/account_menu")` | The tab | "Unnamed account" | M2 |
| **Now playing** | **Page read:** `navigator.mediaSession.metadata` and the `<video>` element. The video ID comes from `#movie_player.getVideoData()`. Never the player bar. | The tab | The queue's selected item (`app.queue`) | M1 |

**The signed request is www-only.** On YouTube Music, `networkManager` signs requests itself. When an internal is missing there, ticket 26 removes that action from the tab rather than falling back.

**YouTube Music queue rules** (from [ticket 26](26-youtube-music-quick-actions.md)):
- **One at a time.** Queue jobs (Play next, Add to queue, Remove, and their undos) run one at a time per tab, in the order they were triggered. The gateway keeps a per-tab job queue for them.
- **Success, and the IDs undo needs,** come from the queue itself, the same way on either route:
  1. Before the insert, the gateway records the queue item IDs from `app.queue.getItems()`. Each item's ID is `navigationEndpoint.watchEndpoint.index`, which `ADD_ITEMS` assigns.
  2. After the insert, it reads them again until the queue has grown by the expected number of items, within the 10 s ticket 26 allows.
  3. The new IDs are the undo handle: undo removes those still waiting with `app.queue.removeItem`.

  If the queue doesn't grow, the action has failed. Success is never assumed.
- **No double toast:**
  - **Menu-item route:** the endpoint's `commands` (YouTube Music's own toast) are removed before handing it over.
  - **Queue replay:** never runs the response's `onResponseReceivedCommands`, apart from storing `queueContextParams`.
  - **Saves:** go through `networkManager.fetch`, which runs no response actions, so `handlePlaylistEditEndpoint` and its possible toast are never used.
  - **Likes:** M3 checks them.
- **Casting** only matters while queue replay is the route, because replay doesn't reach the cast device.
  - **If M1 shows the menu-item route forwards to the cast device,** queue actions stay available while casting, and casting needn't be detected.
  - **Otherwise, PROVISIONAL:**
    - **Primary signal:** a page read of YouTube Music's own cast state from the app's state store, the same store `IP` consults to forward inserts (research §2.1).
    - **Fallback signal:** the player's API (`#movie_player`).
    - **If neither is found** (live check M5): queue actions stay available, and while casting, the toast says the song was added to this tab's queue. The action reports exactly what happened locally rather than guessing about the cast device.
  - **Firefox** has no casting, so the casting state never applies there.

### 5. Which tab serves a job

**A job started inside a tab runs in that tab, always.** That covers in-page features, keys caught in the page, and quick actions.

**A job from the popup, settings or a browser-level keyboard command** is served by a serving tab, chosen as follows (refines [ticket 11](11-accounts.md)):

1. **Find the account in view** by ticket 11's order:
   - the active tab's account, when the popup sits over a YouTube or YouTube Music tab;
   - else the most recently active YouTube tab's account, in a window of the same kind;
   - else the account last current in a normal window, from cache.

   Settings uses the account the user picked in it.
2. **Find candidates:**
   - **Query:** `tabs.query({url: […the job's site…], discarded: false})`. This needs no `tabs` permission: host access is enough for the `url` filter and the `url`, `incognito` and `lastAccessed` fields (Chrome and MDN docs).
   - **Site:** youtube.com jobs use www tabs. YouTube Music jobs use music tabs, the installed app's included. YouTube Music's membership fallback uses a www tab.
   - **Window kind:** a normal window's popup or settings never uses a private tab. A private window's popup uses only private tabs (ticket 11).
   - **Frozen tabs** are skipped where the browser reports them (Chrome 132+ `frozen`).
   - **Never wake, reload, activate or undiscard a tab.**
3. **Order the candidates:**
   1. the requester's active tab, if it's a candidate;
   2. tabs already known to be on the account in view, most recently accessed first (`lastAccessed`);
   3. tabs whose account is unknown, most recently accessed first.

   **Containers:** ignored, because the account decides (ticket 11).
4. **Ping each candidate in turn** with a 2 s budget. Injecting the site core, when needed, is part of that budget. A tab is used only if:
   - it answers;
   - its `DATASYNC_ID` is the account in view (account-free jobs, such as typed channels, take any signed-in or signed-out tab);
   - it's signed in, when the job needs it.

   On a timeout or mismatch, try the next candidate.
5. **No candidate left:** the [no-tab behaviour](#9-no-youtube-tab-not-signed-in-no-site-access).

**Changes to ticket 11:**
- **Discarded tabs** are skipped up front rather than pinged. They have no page to answer, and pinging must never make the browser reload them.
- **The tab registry** (each tab's account and whether it's private) is filled from two sources: messages from site cores (with `sender.tab.incognito`), and on-demand probes. Recency comes from `tabs.query`'s `lastAccessed` rather than event tracking.

**Picking a YouTube Music tab for a job that names no tab** (a browser-level quick-action key, [ticket 08](08-shortcuts.md)), in this order:
1. the focused window's active tab, if it's YouTube Music;
2. else the audible YouTube Music tab (`tab.audible`);
3. else the most recently accessed one.

For youtube.com, a key outside a YouTube tab does nothing unless ticket 08 says otherwise.

**Writes from the popup** go popup → background → serving tab. A popup that closes mid-request then loses only the answer, not the write. The result reaches the cache through the background.

**Runner-up:** a static content script on every YouTube page that reports its tab (ticket 02's design). It lost because it puts code on every YouTube page while every feature is off, which breaks "off costs nothing".

### 6. Filling in the routes from ticket 25

Each row shows what a live check's result switches. The route table in the gateway is a single constant, one row per job, so filling this in changes data, not design.

| Live check | Ticket 25 item | If it passes | If it fails |
|---|---|---|---|
| **L1** `ytd-app.resolveCommand(playlistEditEndpoint, {commandController})`: options forwarded, `onSuccess` / `onServerError` get the response, and YouTube shows nothing on success *and* on a failure (e.g. a full or deleted playlist) | Own client | Add and undo use the YouTube command | Add and undo use the service request if L2 passes for `playlistEditEndpoint`, else the signed request |
| **L2** `yt-service-request` from a temporary element under `ytd-app` returns the response with no popup, toast or navigation. Run once each for: `get_add_to_playlist`, `browse FEplaylist_aggregation`, `createPlaylistServiceEndpoint`, `account/account_menu`, `playlistEditEndpoint` | Own client; `yt-service-request` | That job uses the service request | That job uses the signed request |
| **L3** A same-origin request with cookies and no `Authorization` gets a signed-in answer and can write | Cookies only | The signed request sends no hash; nothing reads cookies; no Authentication-information disclosure | The signed request computes the hash (section 3) |
| **L4** `SAPISID` (or `__Secure-3PAPISID`) is readable from `document.cookie` while signed in; the hash is checked against `Origin` / `X-Origin` | SAPISID; Cookies only | The signed request works as specified | If cookies can't be read, the signed request can't exist. Jobs left without a qualifying route are unavailable, and each gap becomes a new ticket. Not expected: YouTube's own code reads the cookie this way. |
| **L5** The shapes of `get_add_to_playlist` (old renderer or view model, paging, privacy, Watch Later) and of the `FEplaylist_aggregation` lockups | Response shape | Parsers fixed to those shapes | — (shape detail, not a route) |
| **L6** A duplicate add on www; whether `ACTION_REMOVE_VIDEO` with `setVideoId` removes one entry; the full-playlist error | Duplicate add | Ticket 12's duplicate rules apply as written | Ticket 12's PROVISIONAL rule for unattended adds |
| **L7** `DATASYNC_ID` stability, and the presence of `responseContext…datasyncId` | `DATASYNC_ID` | Account guard as specified | Ticket 11's fallback (matching playlist ownership) |
| **L8** *(new)* After `addToPlaylistCommand` on an existing queue, the video shows up in the miniplayer's playlist-panel `data`, and which field holds it | (add to 25) | Queue confirmation reads that field | Fallback signal only; appends to an open queue report `unconfirmed` |
| **L9** `#shorts-player`'s player API, and `yt-navigate-finish` on every swipe | `#shorts-player` | Page reads as specified | Shorts channel by plain request; progress from the `<video>` alone |
| **M1** The menu-item spike (`viaMenuItem` in `live-check.js`) queues correctly, shows nothing once `commands` are stripped, and forwards to a cast session; queue replay works signed in | YouTube Music | Play next and Add to queue use the menu behaviour, with replay as fallback; casting needn't be detected | Queue replay is primary, and queue actions are unavailable while casting (M5, ticket 26) |
| **M2** `networkManager.fetch` returns signed answers for `get_add_to_playlist`, `browse/edit_playlist`, `playlist/create` and `account/account_menu`; the `get_add_to_playlist` answer carries membership (`containsSelectedVideos`); responses carry `datasyncId` | YouTube Music | Membership is read on YouTube Music | Membership comes from a www serving tab, else none. Without a `datasyncId` in YouTube Music responses, the YouTube Music account guard relies on `ytcfg` at page load only. |
| **M3** A like through `handleServiceEndpoint` sticks, repaints the like button, and shows no YouTube Music toast | YouTube Music | As specified | If YouTube Music shows its own toast, there's no quiet route. That toast stands in for ours on likes, and tickets 26 and 27 are told. |
| **M4** *(new)* In the installed YouTube Music app (Chrome, Edge), `tabs.query` finds the app's tab, `scripting.executeScript` and registered scripts run there, and the popup's active tab is the app's | YouTube Music; app windows | The app is first-class, as specified | The app gets only what reaches it, and ticket 27 records the gap |
| **M5** *(new)* Where an active cast session shows in the YouTube Music page: the app's state store (the state `IP` reads before forwarding inserts), or `#movie_player`'s API | (add to 25) | Casting is detected from that signal, and queue actions are unavailable while casting (ticket 26) | If no signal is found, queue actions stay available and their toast names this tab's queue |
| **P1** The exact install prompts for the final manifest (section 10); the 1.4.5 → 2.0 Firefox update shows no prompt; Chrome's prompt for the optional YouTube Music access | Prompt text | Listing and upgrade note copy (ticket 19) | Ticket 19 adjusts its copy |
| **P2** *(new)* Registered scripts apply at browser start before the background runs (`persistAcrossSessions`), and the start-up reconcile restores them after an extension update | (add to 25) | As specified | The reconcile also listens for `runtime.onStartup` and injects into tabs that are already open |
| Hidden frame (`/embed/`, `/robots.txt` in an offscreen document / event page) | Hidden frame | **Not needed for 2.0** (section 9). Run it only if convenient; it informs a possible 2.x. | — |

### 7. Runtime rules

- **Route unavailable vs. job failed.**
  - **Route unavailable:** the hook is missing, it throws before sending, or no answer arrives within the budget. The gateway then moves to the job's next shipped route and records a breakage signal ([ticket 18](18-breakage.md)).
  - **Job failed:** YouTube answered: `STATUS_FAILED`, HTTP 4xx/5xx, signed out, or a different account. The failure is reported as it is, with no second route.
- **Writes never run twice.** A write falls back only when the first route provably sent nothing: hook missing, or a synchronous throw. If a write may have been sent but its answer is lost, it's reported as failed or unconfirmed, never retried. Reads may fall back on timeout.
- **Account guard** (ticket 11), applied in three places:
  - **Before a job:** the tab's `ytcfg` `DATASYNC_ID` must match the account the job is for.
  - **Before every write:** the membership read that precedes every add (ticket 12) must name the same account. That stops a stale tab writing to another account's Watch Later.
  - **After every response:** a mismatch stops the tab sending (ticket 11's "account changed" state).
  - **Likes on YouTube Music** return nothing the gateway can read, so they rely on the tab having already tripped from an earlier response. *Runner-up:* an extra signed read before every like. It lost because the worst case is one like on the other account, which the user can undo, and the read would double every like's requests.
- **Success** is read from the response (`status`, expected fields), never from the HTTP code.
- **Human scale** (ticket 03):
  - one request per user intent, sent one at a time per tab;
  - no crawling: lists refresh only when stale or on Refresh ([ticket 16](16-storage-and-sync.md));
  - on HTTP 429, a 60 s pause per account (ticket 12).
- **Private tabs:** results from private tabs are never persisted. The background refuses those writes (ticket 11).

### 8. Off costs nothing: per-feature registration

- **No static `content_scripts` and no `web_accessible_resources`.** Every page script is registered at runtime with `scripting.registerContentScripts`, under these IDs:
  - **`core-www` and `core-music`:** each site's core (the isolated bridge, plus the MAIN-world gateway with `world: "MAIN"`). A site's core is registered while at least one feature for that site is on and the site's access is granted.
  - **`feature-<name>`:** one per feature, registered while the feature is on. Each has its own JS and CSS, and matches only its site: `https://www.youtube.com/*` or `https://music.youtube.com/*`, top frame only.
- **The reconciler** lives in the background:
  - **What it does:** works out the desired set from the shared feature switches (ticket 11: switches are per browser, not per account) and the granted access. It compares that with `getRegisteredContentScripts()` and registers, updates or unregisters by ID.
  - **When it runs:**
    - on every background start, which also covers extension updates (both browsers clear registrations on update);
    - on a change to any feature switch;
    - on `permissions.onAdded` and `permissions.onRemoved`.
  - **Persistence:** scripts are registered with `persistAcrossSessions: true`, so they apply at browser start before the background wakes (Chrome 96+, Firefox 105+).
- **Switching a feature on** also injects it (and the site core, if missing) into the matching tabs already open, with `scripting.executeScript`. It works without a reload.
- **Switching a feature off** unregisters it, then tells the open tabs to tear it down. Each feature removes its elements, styles and listeners. Code already parsed stays until the page reloads, but nothing remains drawn or listening.
- **On-demand probe and site core.** When the popup or settings needs an account or fresh data from a tab with no core, it injects the site core into that one tab with `scripting.executeScript`. The core draws nothing and stays inert until reload. It's the only code that reaches a YouTube page while every feature is off, and only after the user opens the popup or settings.
- **Runner-up:** a tiny always-registered core on every YouTube page. It lost because code would be on every page with everything off (ticket 24).
- **Not registered per account.** Scripts match URLs, not accounts. An account with no choices keeps features idle, per ticket 11.

### 9. No YouTube tab; not signed in; no site access

- **No YouTube tab** (no candidate in section 5):
  - **Popup and settings:** they show the account's cached data, stamped with when it was fetched, plus an **Open YouTube** button (**Open YouTube Music** in the YouTube Music section). The button opens `https://www.youtube.com/` (or `https://music.youtube.com/`) in a new tab, which needs no `tabs` permission.
  - **Settings stays open** and refreshes when a tab of the account in view answers.
  - **Ticket 11's copy:** "{Name} isn't open in any tab. Open YouTube and switch to this account to refresh its playlists."
  - **Needs a tab:** creating a playlist, the picker, typed handles and every quick action. Everything else works from cache.
  - **Runner-up:** a hidden youtube.com frame in a Chrome offscreen document or the Firefox event page. It lost for these reasons:
    - it sees only the default cookie store, so it's the wrong account for container and private users;
    - it loads YouTube's embed client on each wake-up;
    - it needs the signed request plus a second code path;
    - it's unproven;
    - its only benefit is fresher data in the popup, which the cache already covers.

    It could be added in a 2.x without a prompt (`offscreen` has no warning), so leaving it out is cheap to reverse. Fog for after 2.0.
  - **Second runner-up:** reopening ticket 03 for `cookies` plus a rewritten Origin. It lost because it breaks ticket 03 and fakes YouTube's own security check.
- **Not signed in** (`LOGGED_IN` false; the visitor-shaped `DATASYNC_ID`):
  - jobs that need an account aren't sent, and the gateway answers `signedOut`;
  - Add to queue, the card menu and YouTube Music's queue actions keep working;
  - what users see is tickets 11 and 12's copy (auto-add silent; explicit adds "Sign in to YouTube to save videos.").
- **No site access** (Firefox revoked, Firefox 125–126 installs, Chrome "on click" or withheld):
  - **Check:** `permissions.contains` per site on every background start and on `permissions.onAdded` / `onRemoved`.
  - **Missing access:** a toolbar badge, plus a **Give access to YouTube** (or YouTube Music) button in the popup and settings. `permissions.request` is called first and synchronously in the click handler, preferably from the settings tab ([ticket 06](06-upgrade-path.md)).
  - **Features on a site without access** show as on but "needs access", and nothing is registered for them.
  - **Chrome 133+** can also add `permissions.addHostAccessRequest`; placement is [ticket 09](09-where-things-live.md)'s call.

### 10. The Data API: none

**2.0 never calls the YouTube Data API**, not as a fallback, and not on the user's own Google credentials:
- Every job has a session route (ticket 01).
- The same extension can't both be an API client and use undocumented YouTube APIs (YouTube API Services Developer Policies §III.D and §III.E, ticket 03).

**When something can't be done through the session,** its feature gets a weaker local version or is dropped. If YouTube ever closes the session route altogether, 2.0 needs a new decision, not a fallback.

ADR-0001's fallback clause is withdrawn. No `googleapis.com` or `accounts.google.com` host and no `identity` permission ship. The revision text goes with this ticket's report.

### 11. Permissions and manifest outline

| Key | Chrome build | Firefox build |
|---|---|---|
| `manifest_version` | 3 | 3 |
| `minimum_chrome_version` / `browser_specific_settings.gecko.strict_min_version` | `"121"` | `"140.0"` |
| `browser_specific_settings.gecko.id` | — | `{cc70cd21-2cc6-444b-bd89-496909346091}` (kept) |
| `browser_specific_settings.gecko.data_collection_permissions` | — | `{ "required": ["none"] }`, pending [ticket 23](23-ask-amo.md) |
| `permissions` | `["storage", "scripting"]` | `["storage", "scripting"]` |
| `host_permissions` | `["https://www.youtube.com/*"]` | `["*://*.youtube.com/*"]` |
| `optional_host_permissions` | `["https://music.youtube.com/*"]`, requested from the click that first switches on a YouTube Music feature | — (covered by the host permission) |
| `background` | `service_worker` | `scripts` (event page) |
| `action` | popup | popup |
| `options_ui` | settings page, `open_in_tab: true` | same |
| `commands` | [ticket 08](08-shortcuts.md) | ticket 08 |
| `content_scripts`, `web_accessible_resources` | none (section 8) | none |
| `incognito` | default (ticket 11) | default |

**Permission notes:**
- **Not requested:** `tabs`, `activeTab`, `cookies`, `identity`, `offscreen`, `declarativeNetRequest*`, `webRequest*`, `unlimitedStorage`, and any Google host.
- **If ticket 08 or 09 wants `contextMenus` / `menus`,** check its prompt line first: the Firefox update stays silent only if it has none.
- **Why Firefox keeps the wildcard:** it's the exact pattern 1.4.5's content script was granted.
  - Firefox MV3 never grants new origins on update (ticket 06).
  - Today Firefox keeps an old grant even when the manifest narrows. But its code marks extending "revoke origins no longer declared" to all extensions as planned (Bug 2022704, `Extension.sys.mjs`). Narrowing could then strip every upgrader's access.
  - Dynamic script matches stay narrow (`https://www.youtube.com/*`, `https://music.youtube.com/*`).
- **Why Chrome is narrow:** Chrome is a fresh listing, and Chrome Web Store policy asks for the narrowest set.
  - YouTube Music access is optional, so the install prompt names only www.youtube.com. That fits "every part is opt-in".
  - Optional permissions never disable the extension on update.
- **Runner-up:** the same `*://*.youtube.com/*` on both browsers, for one manifest. It lost because, on Chrome, it covers every youtube.com host (m., studio. and the rest) where we run nothing, and it asks up front for YouTube Music, which most users never switch on.

**What users see** (the exact text comes from P1):

| Situation | Prompt |
|---|---|
| **Chrome install** | "Read and change your data on www.youtube.com" only |
| **Chrome, first YouTube Music feature** | An access prompt for music.youtube.com |
| **Firefox install** | One host line for the youtube.com domain |
| **Firefox 1.4.5 → 2.0 update** | None |

**Why the Firefox update is silent:**
- `scripting` and `storage` were already held, and `scripting` has no prompt (`OptionalPermissionNoPrompt`).
- Dropping `identity` and `activeTab` is silent.
- The origin is unchanged.
- `data_collection_permissions: none` doesn't prompt.

**Chrome Web Store justification for `scripting`:** "Adds each feature's script to YouTube pages only while that feature is switched on, and reads data from an open YouTube tab when the popup or settings need it."

### 12. Minimum versions

**Chrome 121.**
- Tailwind v4, under shadcn-svelte, needs 111.
- Dynamic MAIN-world registration and `optional_host_permissions` need 102.
- Tab routing relies on `Tab.lastAccessed`, which needs 121.
- `Tab.frozen` (132) and `permissions.addHostAccessRequest` (133) are used where present.
- Current Stable is 155.
- **Runner-up:** 111. It lost because routing would need a second ordering path for no real users. Chrome 121 shipped in January 2024, and Chromium browsers riding on the Chrome build track recent Chromium.

**Firefox 140.**
- MAIN-world registration needs 128.
- 140 is Mozilla's own recommended floor for `data_collection_permissions`. It also brings built-in data consent, so if ticket 23's answer is "it counts", declaring `websiteActivity` needs no custom consent screen and no second floor bump.
- **Who stays on 1.4.5:** only users on 128–139, which have been unsupported for over a year.
- **Runner-up:** 153, the only live ESR. It lost because ESR 140 ended on 2026-09-29, and organisations still moving from 140 to 153 would silently stay on 1.4.5.
- **Second runner-up:** 128, the technical minimum. It lost because a "yes, it counts" from AMO would then need a custom consent screen, and every build would carry linter warnings.

**Testing promise.** These are API floors. Testing covers Chrome Stable, Firefox release and Firefox ESR 153.

### 13. Judgement calls at a glance

| Decision | Chosen | Runner-up, and why it lost |
|---|---|---|
| Reading the session cookie | Allowed in the www page world, only where no YouTube route qualifies | Never: leaves create and labels depending on an unproven internal, to save one disclosure line |
| Route preference | YouTube's own routes first, but only if quiet on success *and* failure | YouTube's route even when it shows its own toasts: breaks "nothing shows twice" (ticket 12) and lets YouTube show feedback the user switched off |
| Copying YouTube's headers | Rejected | Patches every page at start-up and still handles the credential |
| No YouTube tab | Cached data plus Open YouTube | Hidden frame: default cookie store only, heavy, unproven; addable later without a prompt |
| Data API | Never, not even as a fallback | Fallback on the user's own credentials: breaches YouTube API policies §III.D/E when mixed |
| Firefox host pattern | `*://*.youtube.com/*`, exactly as granted | Narrow patterns: risk losing upgraders' access under Firefox's planned revocation |
| Chrome hosts | www required, music optional | Wildcard: broader than needed; asks up front for a feature most never use |
| Discarded tabs | Skipped without a ping | Ping (ticket 11): a discarded tab can't answer, and must not be reloaded |
| Registration | All scripts at runtime per feature; an on-demand probe for the popup | A tiny always-on core: code on every page with everything off |
| YouTube Music queue | Menu-item behaviour, with replay as fallback; success and undo IDs from the queue's own growth | Replay first: proven by Pear Desktop, but skips casting and YouTube Music's own empty-queue handling |
| YouTube Music saves | `networkManager.fetch` | `handlePlaylistEditEndpoint`: may show YouTube Music's own toast and doesn't hand back the response |
| Membership in a YouTube Music tab | YouTube Music's own answer, else a www tab of the same account, else none | Always ask a www tab: needless for YouTube Music-only users when YouTube Music's answer carries membership |
| Account guard for YouTube Music likes | Rely on the tab's guard | An extra read per like: doubles requests to prevent a reversible mistake |
| Chrome minimum | 121 | 111: a second tab-ordering path for no real users |
| Firefox minimum | 140 | 153 strands ESR 140 users mid-migration; 128 forces a custom consent screen if AMO says data collection counts |

Also from [ticket 29](29-youtube-queue-undo.md) (adopted after resolution): YouTube's queue adds use `playlistEditEndpoint` `ACTION_ADD_VIDEO` with `params: "IAE%3D"` when a queue exists. Undo uses `ACTION_REMOVE_VIDEO` by `setVideoId`, then `refreshPlaylistCommand`, all through `ytd-app.resolveCommand`. Confirm and retry on HTTP 409. PROVISIONAL on ticket 25's Q1–Q8.

Also from [ticket 25](25-live-checks.md)'s signed-out validation (after resolution): **YouTube's command resolver has moved.** No element has `resolveCommand`, and `ytd-app`'s handler passes no `commandController`. The working resolver is the global `default_kevlar_base.<key>.instance.resolveCommand`, found by shape (the key is minified, e.g. `O5`), and it calls `onSuccess` with the response. The route table's "YouTube's own command" means that resolver, located by shape at page load. The cast state on YouTube Music is readable at `state.castStatus` (M5).
