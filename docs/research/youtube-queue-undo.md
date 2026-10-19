# Can one entry be removed from YouTube's queue quietly?

Research for [ticket 29](../../.scratch/rebuild/issues/29-youtube-queue-undo.md) of the 2.0 rebuild map, compiled 2026-10-19.

## Answer

**Yes, through YouTube's own command resolver, and one route is quiet. Nothing has been tried signed in yet.**

- **What the queue is:** both of the options the ticket asks about.
  - On the server it's a temporary playlist with an ID starting `TLPQ`. It belongs to the browser session that created it.
  - In the tab, a queue proxy in YouTube's playlist manager mirrors it.
  - Each entry is identified by its `playlistSetVideoId`, so the same video can be in the queue twice as two separate entries.
- **The quiet route:**
  1. Resolve `playlistEditEndpoint {playlistId: "TLPQ…", actions: [{action: "ACTION_REMOVE_VIDEO", setVideoId}], params: "IAE%3D"}`, with no `clientActions`.
  2. Then resolve `refreshPlaylistCommand {listId}` so the miniplayer's panel catches up.
  - With `params: "IAE%3D"`, the server's answer carries no `actions`, so there's nothing that could show a toast. YouTube's own Undo buttons send this same value.
  - Status: verified signed out at the request level; the in-page behaviour comes from reading the code. Both need a **(live check)**.
- **The routes that aren't quiet:**
  - the queue panel's own remove item;
  - `playlistRemoveVideosAction`, the client-side remove command that remove item carries.
  - Both make YouTube send an edit without `params`. Its answer is a "Removed from Queue" toast with an Undo button. YouTube's response processor runs the `actions` of every `playlistEditEndpoint` answer, so that toast shows.
- **The last-added entry:** take its `playlistSetVideoId` from the queue panel's data once YouTube has refreshed it after the add. Never remove by video ID: that removes every copy of the video.
- **How fragile it is: medium–high.**
  - The command and action names are old and widely used.
  - The weak points are:
    - the opaque `IAE%3D` value. If it stops working, the entry is still removed, but YouTube's toast shows.
    - where the panel data lives;
    - `ytd-app.resolveCommand`;
    - the server rejecting overlapping edits (HTTP 409).
- **Side finding:** today's Add to queue probably already shows YouTube's own "Added to Queue" toast for every add after the first (§6). That would break [ticket 12](../../.scratch/rebuild/issues/12-adding.md)'s "Nothing shows twice" rule. There's a quiet add route with the same `IAE%3D` value. Both need a live check.

## Sources and method

**YouTube's own desktop web client**
- This is the same file [ticket 01's research](https://github.com/Alioun/yt-playlist-tools/blob/research/youtube-requests/docs/research/youtube-requests.md) used:
  - app bundle `ytmainappweb.kevlar_base.en_US.VRNYTIAj20w.es5.O`;
  - web client `2.20261016.01.00`;
  - fetched again on 2026-10-19, signed out.
- **[B:line]** is a line in that file, followed by the minified name, which changes with every release.

**Signed-out probes of the queue playlist**
- Each probe used a fresh signed-out visitor session: the watch page's cookies and `VISITOR_DATA`, sent back as `X-Goog-Visitor-Id`.
- Each one created the same anonymous `TLPQ…` playlist that YouTube's own client creates for any visitor who presses Add to queue.
- The scripts aren't committed. The requests and what came back are given in [§3](#3-what-the-server-does-signed-out) and are enough to repeat them.
- Refs:

  | Ref | Run (UTC, 2026-10-19) | What it did |
  |---|---|---|
  | **[P1]** | 09:56 and 09:57 | Created a queue, added videos (a duplicate too), and read the panel with `next`. Then removed by `setVideoId` and by video ID. The 09:56 run had no visitor session. |
  | **[P2]** | 10:01 | The same edits with `params` absent, `"IAE%3D"` or `"CAE%3D"`; a repeated remove; a remove-by-video-ID on a duplicate; an edit from another visitor. |
  | **[P3]** | about 10:05 | Read the Add to queue menu item YouTube serves in `search` and `next`. |
  | **[P4]** | 10:08 | Tried Multiselect-for-YouTube's `params`, two removes at once, and an add and a remove at once. |
  | **[P5]** | about 10:10 | Built a 250-entry queue to see how much of it the panel refresh returns. |

**Code that deals with YouTube's queue**, read at fixed commits.

| Ref | Project | Commit | Queue use |
|---|---|---|---|
| [UNS] | [kemus/youtube-up-next-sort](https://github.com/kemus/youtube-up-next-sort) | `src/youtube.ts` at `752282d07`, 2026-10-16 | Removes and reorders queue entries |
| [QP] | [rockinrimmer/youtube-queue-persist](https://github.com/rockinrimmer/youtube-queue-persist) | `lib/youtube.ts` at `67575a3fa`, 2026-10-18 | Reads, clears and rebuilds the queue |
| [QM] | [Lucas544875/youtube-queue-manager](https://github.com/Lucas544875/youtube-queue-manager) | `src/main-world.js` at `ce5e2d2d0`, 2026-09-01 | Adds, reads the length |
| [MS] | [greyt1563/Multiselect-for-YouTube](https://github.com/greyt1563/Multiselect-for-YouTube) | `js/polymer.js` at `daeeca169`, 2024-09-07 | Cut and move in the current list |
| [YJ] | [LuanRT/YouTube.js](https://github.com/LuanRT/YouTube.js) | `c4a7b3f`, 2026-10-18 | `PlaylistManager.removeVideos` |
| [YD] | [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) | `8973412`, 2026-10-10 | None |

- youtubei.js, yt-dlp, NewPipe and Invidious don't implement YouTube's queue (ticket 01, §5). youtubei.js only shows the general playlist remove.

**This repo:** `src/entrypoints/yt-queue-bridge.ts` and `.scratch/rebuild/inventory.md` at `301ae51`.

**Not done:** nothing was run in a browser or while signed in. Everything that depends on the page is marked **(live check)** and collected in [§9](#9-live-checks-for-ticket-25).

## 1. What the queue is

**A server playlist**
- The first Add to queue creates it. The queue proxy sends `createPlaylistServiceEndpoint` with title "Queue" and `params: "CAQ%3D"` (`cHK`, [B:15047]), and the server returns a `TLPQ…` ID.
- Later adds become `browse/edit_playlist` edits on that ID (`x6e.prototype.updatePlaylist`, [B:15049]).
- The panel is filled from a `next` request on that playlist (`_.FiK`, [B:15048]).
- It belongs to the session that created it. The same edit sent from another visitor session fails with HTTP 403 `PERMISSION_DENIED` [P1, P2]. So it must be edited from inside the user's own tab.

**A client mirror** (`_.Ny()`, [B:15069-15070]), a singleton playlist manager that isn't reachable from outside the bundle. It holds:
- `responsePlaylistData`: the last panel data from the server.
- `temporaryItems`: just-added videos that the server hasn't confirmed yet. They have no `playlistSetVideoId`.
- `queueProxy` (`_.T9b`, extending `ti`, [B:15027-15046]):
  - a `videoIds` array and a `currentIndex`;
  - a `pendingUpdates` list, which it sends one edit at a time (`jAF`, [B:15036]);
  - a refresh through `next` after each edit (`bb7`, [B:15037]).
- The panel shown in the miniplayer, or on the watch page, is built from these (`_.i5f`, [B:15085]) and handed to `yt-playlist-manager`.
  - That element's `getPlaylistData()` returns it [B:36060].
  - It fires `yt-playlist-data-updated` whenever the data changes [B:36058].

**How entries are identified**
- Each entry is a `playlistPanelVideoRenderer`. It has `videoId`, `playlistSetVideoId`, `selected`, and `navigationEndpoint.watchEndpoint.index` [P1].
- Duplicates are allowed. Adding a video that's already queued creates a second entry with a new `setVideoId` [P1, P2].
- On queues, the client deletes the menu of the playing entry (`jDn`, [B:3004]). YouTube itself never offers to remove the playing entry.

**Other queues to rule out**
- `removeFromRemoteQueueAction` [B:40744] is the cast (Play on TV) queue, not the miniplayer queue.
- `endPlaylistCommand {listType: "PLAYLIST_EDIT_LIST_TYPE_QUEUE", closeMiniplayer}` (`eEX`, [B:29082]) clears the whole queue in the client and closes the miniplayer. It makes no request. It's the command behind YouTube's own "Close the queue" confirm button [B:15082], and [QP] uses it.

## 2. Every remove route in the client, and whether it's quiet

The playlist manager's handlers are registered as actions [B:35828]:

```
"yt-add-to-playlist-command":     Nyp   (Add to queue)
"yt-end-playlist-command":        eEX   (clear the queue)
"yt-recover-playlist-command":    $nI
"yt-refresh-playlist-command":    hEQ → jJQ   (re-read the panel from the server)
"yt-playlist-remove-videos-action": H5y → _.AwH   (remove entries by setVideoId)
```

| Route | What it changes | YouTube's toast? | Notes |
|---|---|---|---|
| **The queue panel's remove item** ("Remove from playlist" when signed out [P1]) | Client and server, sent twice | Yes | It's served as `playlistEditEndpoint {playlistId: TLPQ…, actions: [{action: "ACTION_REMOVE_VIDEO", setVideoId}], params: "CAE%3D", clientActions: [{playlistRemoveVideosAction: {setVideoIds: [setVideoId]}}]}` [P1].<br>The resolver (`FbP`, [B:25629]) first runs `clientActions`, which is the next row's route, then sends its own `CAE%3D` edit.<br>So two edits remove the same entry. The second gets HTTP 400 `FAILED_PRECONDITION` [P2], and edits that overlap can get 409 [P4].<br>[UNS] saw this too: "Separate edits overlap on YouTube's server, which rejects some of them and later restores those rows". |
| **`playlistRemoveVideosAction {setVideoIds}`** alone | Client at once (panel, proxy `videoIds`, `currentIndex`), then the server through the proxy | Yes | `_.AwH` [B:15073] finds the entry in `responsePlaylistData` by `playlistSetVideoId` and removes it. It queues `{action: "ACTION_REMOVE_VIDEO", setVideoId}` without `params`, and the answer to that is "Removed from Queue" with Undo [P1, P2].<br>It does nothing for an entry outside the loaded panel window (`kZU` returns −1), see §4. |
| **`playlistEditEndpoint` remove, no `params`** | Server only | Yes | Sent through `FbP` with no `clientActions`. The panel goes stale until it's refreshed. |
| **`playlistEditEndpoint` remove, `params: "IAE%3D"`** | Server only | **No** | The answer has no `actions` [P2, P4]. On success `FbP` only calls `commandController.onSuccess` [B:25629]. Follow it with `refreshPlaylistCommand`. **This is the recommended route.** |
| `ACTION_REMOVE_VIDEO_BY_VIDEO_ID` | Server | Depends on `params` | With `IAE%3D` it removed **both** copies of a duplicated video [P2]. Never use it for Undo. YouTube's own "Added to Queue" Undo uses it [P1], so that button removes every copy. |
| `endPlaylistCommand` | Client only, whole queue | No | It isn't single-entry. It's the only option when our add created the queue and is now playing (§4). |

**Why the "not quiet" routes show a toast** (code reading):
- Every request YouTube's transport sends goes through its response processors (`E3.prototype.execute`, [B:25926]).
- These include `vT7` (`RESPONSE_RECEIVED_COMMANDS`, [B:25764]). It resolves the answer's `actions`, `commands`, `onResponseReceived*` and so on, whenever the request's command is on an allowlist.
- The allowlist is `Zil` [B:17014], extended at [B:27026]. It includes `playlistEditEndpoint` (`_.wN`, [B:14618]).
- The request's `config.command` is the command itself (`FD.prototype.execute`, [B:25909]; builder `nX…getRequest`, [B:25545]). So a toast in the answer to any `playlistEditEndpoint` edit is shown through YouTube's popup container (`handleOpenPopupAction`, [B:40011]).
- The queue proxy's own `updatePlaylist` sends a `playlistEditEndpoint` command too [B:15049]. The same applies to it, even though it discards the answer (`Qez`, [B:2963]).

## 3. What the server does (signed out)

All requests are `browse/edit_playlist` on a fresh `TLPQ…` playlist, from the session that created it.

| Edit | `params` | HTTP / `status` | `actions` in the answer |
|---|---|---|---|
| `ACTION_ADD_VIDEO` | none | 200 `STATUS_SUCCEEDED` | `refreshPlaylistCommand`, plus a toast "Added to Queue" whose Undo is `ACTION_REMOVE_VIDEO_BY_VIDEO_ID` with `params: "IAE%3D"` [P1, P2] |
| `ACTION_ADD_VIDEO` | `CAE%3D` | 200 | `refreshPlaylistCommand`, the toast, `updatePlaylistAction` [P2] |
| `ACTION_ADD_VIDEO` | `IAE%3D` | 200 | `refreshPlaylistCommand` only [P2, P4] |
| `ACTION_REMOVE_VIDEO {setVideoId}` | none | 200 | A toast "Removed from Queue" whose Undo is `ACTION_ADD_VIDEO {addedVideoId, addedVideoPosition}` with `params: "IAE%3D"` [P1, P2] |
| `ACTION_REMOVE_VIDEO` | `CAE%3D` | 200 | The toast, `updatePlaylistAction` [P2] |
| `ACTION_REMOVE_VIDEO` | `CAFAAQ%3D%3D` ([MS]'s value) | 200 | The toast, `updatePlaylistAction` [P4] |
| `ACTION_REMOVE_VIDEO` | `IAE%3D` | 200 | **none** [P2, P4] |
| `ACTION_REMOVE_VIDEO_BY_VIDEO_ID` | `IAE%3D` | 200 | none. Every copy of the video is removed [P2]. |
| The same `ACTION_REMOVE_VIDEO` again | none | **400** `FAILED_PRECONDITION` | n/a [P2] |
| Any edit, from another visitor session | none | **403** `PERMISSION_DENIED` [P1, P2] | n/a |
| Two removes at once | `IAE%3D` | 200 and 200 | none [P4] |
| An add and a remove at once | none / `IAE%3D` | 200 and **409** `ABORTED` | The remove was lost [P4] |

Other observations:
- **Every add answer carries `playlistEditResults[].playlistEditVideoAddedResultData.setVideoId`** [P1, P2, P4].
- **`setVideoId`s are only unique within one playlist.** Two fresh queues got the same sequence (`56B44F6D10557CC6` for the first entry, `289F4A46DF0A30D2` for the second, and so on) [P1, P2, P4]. Always pair a `setVideoId` with its `TLPQ…` ID.
- **What `IAE%3D` means:** it decodes to protobuf field 4 = 1, which looks like a "no toast" flag, but the meaning is a guess.
  - It appears nowhere in the client bundle. The server hands it out inside its own Undo commands.
  - Whether a signed-in session gets the same answers is a **(live check)**.

## 4. Finding the last-added entry

**Where the data is**
- The panel data with `playlistId` starting `TLPQ`: `ytd-playlist-panel-renderer` → `.data`, or `.polymerController.data` / `.inst.data` on newer element builds.
  - [QP] and [UNS] both read it this way as of October 2026.
  - [UNS] also unwraps `playlistPanelVideoWrapperRenderer.primaryRenderer`.
- Alternatively, `yt-playlist-manager`'s `getPlaylistData()`. Whether a page script can call it on the element or its controller is a **(live check)**.

**When the `setVideoId` appears**
- Right after the add, the new video shows as a temporary item without a `playlistSetVideoId` (`odQ` → `temporaryItems`, [B:29473]; `_.i5f`, [B:15085]).
- It gets one only after the proxy's edit succeeds and the panel is re-read. Both the proxy (`bb7`) and the answer's own `refreshPlaylistCommand` re-read it.
- So Undo must wait for the entry's `playlistSetVideoId` to appear. It shouldn't fire while the add's edit is still in flight, because overlapping edits can get 409 [P4]. How long the wait is needs a **(live check)**.

**How to recognise our entry**
- Adds without a position go to the end (`ti.prototype.addVideos`, [B:15033]).
- Our entry is the panel entry with our `videoId` whose `playlistSetVideoId` wasn't in the panel before our add. Diffing the before and after sets copes with duplicates.

**Long queues**
- The `next` refresh returns a window of up to about 200 entries on each side of the playing one [P5].
  - With 250 entries and the playing entry at index 0, the panel held entries 0–199, so the last-added entry was missing.
  - With the playing entry at 100 it held all 250; at 240 it held 40–249.
- So for queues more than about 200 entries past the playing one, the panel can't supply the last-added `setVideoId`. `playlistRemoveVideosAction` can't remove such an entry either.
- The add answer's `setVideoId` (§6) avoids this.

**When there's no Undo**
- **The entry has started playing** (`selected`, or it's the panel's `currentIndex`). YouTube offers no remove there either [B:3004]. This matches ticket 26's rule for YouTube Music.
- **Our add created the queue and opened the miniplayer.** The miniplayer then starts playing that video (`aay`, [B:29470]), so it's playing. The only undo is closing the queue with `endPlaylistCommand`, which stops playback. Treat it like ticket 26's "an empty queue started playback": no Undo.
- **The queue was created from a playlist that was playing.** The proxy is seeded with that playlist's panel (`odQ`, [B:29473-29474]), so our entry is a normal entry and can be undone.

## 5. The recommended Undo

All of this runs in the page script (the bridge) through YouTube's resolver. It never clicks anything and builds no request headers.

```js
// 1. The entry: read when the add is confirmed, re-checked when Undo is pressed.
const panel = /* the ytd-playlist-panel-renderer data with playlistId starting "TLPQ" */
const entry = /* panel entry with our playlistSetVideoId, which must not be selected */

// 2. Remove exactly that entry, quietly.
resolver.resolveCommand(
  {
    commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: "/youtubei/v1/browse/edit_playlist" } },
    playlistEditEndpoint: {
      playlistId: panel.playlistId,
      actions: [{ action: "ACTION_REMOVE_VIDEO", setVideoId: entry.playlistSetVideoId }],
      params: "IAE%3D" // no clientActions: playlistRemoveVideosAction would make YouTube send a second, toasting edit
    }
  },
  { commandController: { onSuccess, onServerError } } // whether these fire through ytd-app is a live check
)

// 3. After onSuccess (or a short wait if callbacks don't arrive), refresh the panel.
resolver.resolveCommand({ refreshPlaylistCommand: { listId: panel.playlistId } })

// 4. Confirm: the playlistSetVideoId is gone from the panel data. Otherwise "Couldn't undo."
```

**Details**
- **`resolver`** is `ytd-app`, or its controller when `ytd-app.resolveCommand` isn't a function, as [UNS] already allows for. `FbP` builds the request from `playlistId`, `actions` and `params` (`ERF`, [B:26292-26294]).
- **The refresh** (`jJQ`, [B:29373-29374]):
  - It runs only while something is playing from that same queue (`listId` matches and `response.playingVideoId` is set). That's always so while a queue plays.
  - It re-reads the panel and recomputes "next up" (`setPlaylistData` → `_.i5f`).
  - It doesn't touch playback.
- **Confirming:**
  - An HTTP error (400, 409) never reaches `onServerError`, which needs `errorMetadata`. Depending on YouTube's `web_nm_error_passthrough_ks` flag, it either resolves to nothing, so neither callback fires, or reaches `onSuccess` with an `error` body (`nz4`, [B:25923]; `_.JD`, [B:25783]; `FbP`, [B:25629]). So Undo needs a timeout, and its result must come from the refreshed panel, not from the callbacks.
  - When `onSuccess` does arrive, check `response.status === "STATUS_SUCCEEDED"`.
  - If the answer has an `openPopupAction`, YouTube's toast has already shown, because response processors run before callbacks. That means `IAE%3D` has stopped working. Flag it for [ticket 18](../../.scratch/rebuild/issues/18-breakage.md) and stop offering Undo.
- **Retry once on no confirmation.** A 409 from an overlapping edit (§3) is the likely cause. Queue our Undo behind any edit YouTube has in flight. The `setVideoId` appearing in the panel shows that our add's edit has finished.
- **What stays stale:** the proxy's `videoIds` still lists the removed video. The proxy has no setter for it, and only `_.AwH` (the toasting route) updates it. By code reading, for an entry after the playing one this only affects:
  - `size()`, which decides whether closing the miniplayer asks "Close the queue?" ([B:15082]);
  - `hasVideo()` under `autoSaveToQueue` [B:15081].
  - `currentIndex` and `videoIds[currentIndex]`, which the proxy's refresh sends, don't change, because they come before the removed entry.
  - YouTube's own "Removed from Queue" and "Added to Queue" Undo buttons are plain server edits with no `clientActions` [P1, P2], so they leave the proxy just as stale.
  - Whether anything visible goes wrong afterwards is a **(live check)**: another add, a drag-reorder, playing on into later entries, or closing the miniplayer.

## 6. Side finding: the add path probably shows YouTube's own toast already

**The case:**
- 1.5.0's button resolves `addToPlaylistCommand`, as does YouTube's own ⋮ item, which [P3] shows is served with `openMiniplayer: true` and `onCreateListCommand` every time.
- With a queue already open, that becomes a proxy edit with no `params` (`addVideos` → `jAF` → `updatePlaylist`, [B:15033-15049]).
- The answer to that edit carries "Added to Queue" with an Undo button [P1, P2], and `vT7` resolves it (§2).
- So YouTube's toast should show for every add after the first, from YouTube's own menu and from our button alike.
- The first add is quiet: its `playlist/create` answer has no `actions` [P1], and `createPlaylistServiceEndpoint` isn't on the allowlist.

**Corrections to the map, if confirmed:** **(live check)**
- [Ticket 12](../../.scratch/rebuild/issues/12-adding.md) says "YouTube's own Add to queue has none [Undo]". The server's toast does have one, but it removes every copy of the video.
- Today's route would show YouTube's toast next to ours, which breaks ticket 12's "Nothing shows twice".

**A quiet add for an open queue**, through the same resolver:
- Resolve `playlistEditEndpoint {playlistId, actions: [{action: "ACTION_ADD_VIDEO", addedVideoId}], params: "IAE%3D"}`.
- The answer carries only `refreshPlaylistCommand` [P2, P4]. `vT7` resolves it, so the panel refreshes by itself.
- `onSuccess` would also hand back `STATUS_SUCCEEDED` and the new entry's `setVideoId`. That gives ticket 12 its confirmation and gives Undo an exact entry, even on long queues (§4).
- Costs:
  - No temporary item shows while the request runs.
  - The proxy's `videoIds` misses the entry. That's riskier than in §5, because playback can reach entries the proxy doesn't know about.
  - The first add must still use `addToPlaylistCommand`, because nothing exists to edit yet.
- This is for [ticket 10](../../.scratch/rebuild/issues/10-youtube-access.md) and ticket 12 to weigh.

## 7. How fragile it is

| Piece | Evidence of stability | Breaks if YouTube… | What the user sees | Fragility |
|---|---|---|---|---|
| `playlistEditEndpoint`, `ACTION_REMOVE_VIDEO`, `setVideoId` | Same vocabulary as ytmusicapi since 2020 and youtubei.js since 2024-08 (ticket 01 §3); [YJ] `PlaylistManager.removeVideos` sends exactly this | renames the edit vocabulary | Undo fails, and says so | Low |
| `TLPQ` queue playlist; `refreshPlaylistCommand`; `playlistSetVideoId` in panel data | In today's bundle; [QP] and [UNS] (October 2026) depend on them; [MS] used `playlistRemoveVideosAction` in 2024 | rebuilds the desktop queue (YouTube Music's queue is a different system, ticket 21) | Undo fails | Low–medium |
| `params: "IAE%3D"` | Observed only today, only inside the server's own Undo commands; opaque | stops honouring it | Removal still works, but YouTube's toast shows (loud, not silent). Detectable in the answer when callbacks work | **Medium–high** |
| Panel data location (`.data` / `.polymerController.data`) | Both forms seen in October 2026 extensions [QP], [UNS] | finishes moving elements to controllers, or renames | No `setVideoId`, so no Undo offered | Medium |
| `ytd-app.resolveCommand` | 1.5.0 uses it; [UNS] already falls back to the controller | moves it | Same failure as Add to queue | Medium |
| Server conflicts | 409 on overlapping edits [P4]; [UNS]'s note | n/a: already happens today | A missed Undo, caught by the confirm-and-retry step | Medium |
| Long queues | Panel window of about 200 entries [P5] | n/a | No Undo for entries far beyond the playing one, unless the add returns the `setVideoId` (§6) | Low impact |

## 8. What other projects do

- **[UNS] YouTube Up Next Sort** (`src/youtube.ts`):
  - It removes queue entries through each row's own remove item, merging several into one edit with a single `playlistRemoveVideosAction`. It prefers appending a hidden `ytd-menu-service-item-renderer` to the row and clicking it, and falls back to `resolveCommand` on `ytd-app` or its controller.
  - That's YouTube's toasting route; it accepts YouTube's toast.
  - It reads panel data via `polymerController ?? inst ?? element`.
  - It reorders through the panel's `ytReorderableController.handleDrop`.
- **[QP] youtube-queue-persist:**
  - It reads the queue from the `TLPQ` panel data, and refuses to save a partly loaded queue.
  - It clears the queue with `endPlaylistCommand` and rebuilds it with one `addToPlaylistCommand` carrying every `videoId`, fired as a `yt-action` `yt-command-executor-command` on `ytd-app`.
  - It never removes a single entry.
- **[QM] YouTube Queue Manager:**
  - It adds by firing `yt-add-to-playlist-command` on `ytd-app`.
  - It warns that `contents` is a paging window, not the queue's length: 79 of 18,038 entries for a large playlist.
  - No removal.
- **[MS] Multiselect for YouTube:** its "cut" sends `ACTION_REMOVE_VIDEO` with `params: "CAFAAQ%3D%3D"` and `clientActions: playlistRemoveVideosAction` on the current list. On a queue that value still gets the toast [P4].
- **Libraries:**
  - [YJ] youtubei.js has no queue. Its `PlaylistManager.removeVideos` (`src/core/managers/PlaylistManager.ts:144-185`) sends `ACTION_REMOVE_VIDEO {setVideoId}` without `params` and returns the answer's raw `actions` ("TODO: implement actions in the parser").
  - [YD] yt-dlp has no queue support.
- **No project found removes a queue entry quietly.**

## 9. Live checks for ticket 25

All in Chrome and Firefox, signed in, and once signed out for comparison.

| # | Check | Expected from this research |
|---|---|---|
| Q1 | Two videos are queued with YouTube's own ⋮ Add to queue, then with 1.5.0's button. Does YouTube show "Added to Queue" (with Undo) for the second? | Yes for the second and later, not the first (§6) |
| Q2 | The snippet below: removing the last, not-playing entry with `params: "IAE%3D"` | Entry gone from the server and the panel. No toast. `onSuccess` fires with `STATUS_SUCCEEDED` and no `actions`. |
| Q3 | The same with `params` left out | "Removed from Queue" toast shows. This shows the toast detection works. |
| Q4 | The queue panel's own ⋮ remove, in the miniplayer and on the watch page | Label ("Remove from playlist" or "from queue"), `params: "CAE%3D"` and `clientActions` as in §2; a toast shows |
| Q5 | After Q2, do any of these misbehave: another add, a drag-reorder, playing on to the end, closing the miniplayer? | Nothing visible, apart from maybe the close-confirm count |
| Q6 | How long after an add until the entry's `playlistSetVideoId` appears in the panel data. Pressing Undo at once: does the remove get 409? | About one or two round trips; 409 possible |
| Q7 | Where the panel data is: `ytd-playlist-panel-renderer` `.data` or `.polymerController.data`. Can `yt-playlist-manager.getPlaylistData()` be called, and does `yt-playlist-data-updated` reach a document listener? | Either form |
| Q8 | Quiet add (§6): `playlistEditEndpoint ACTION_ADD_VIDEO` with `params: "IAE%3D"` on an open queue | Appears after the automatic refresh. No toast. `onSuccess` returns `setVideoId`. |

**The snippet for Q2 and Q3.** Paste it into DevTools on youtube.com, in the top frame, with a queue of at least two videos open and the last one not playing. It's untested. The toast selectors are guesses, so also watch the screen.

```js
(async (params = "IAE%3D") => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const ctl = (el) => el?.polymerController ?? el?.inst ?? el
  const panel = () => [...document.querySelectorAll("ytd-playlist-panel-renderer")]
    .map((el) => ctl(el)?.data ?? el.data).find((d) => d?.playlistId?.startsWith("TLPQ"))
  const entries = () => (panel()?.contents ?? []).map((c) => c.playlistPanelVideoRenderer
    ?? c.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer).filter(Boolean)
  const app = document.querySelector("ytd-app")
  const resolver = typeof app?.resolveCommand === "function" ? app : ctl(app)
  const data = panel(), target = entries().at(-1)
  if (!data || !target?.playlistSetVideoId || target.selected) return console.log("Need a TLPQ queue whose last entry isn't playing")
  const seen = new Set(), callbacks = []
  const mo = new MutationObserver(() => document.querySelectorAll(
    "yt-notification-action-renderer, tp-yt-paper-toast, [class*=snackbar], [class*=toast]"
  ).forEach((el) => el.offsetParent && el.textContent.trim() && seen.add(el.textContent.trim())))
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
  resolver.resolveCommand({
    commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: "/youtubei/v1/browse/edit_playlist" } },
    playlistEditEndpoint: { playlistId: data.playlistId, ...(params ? { params } : {}),
      actions: [{ action: "ACTION_REMOVE_VIDEO", setVideoId: target.playlistSetVideoId }] }
  }, { commandController: {
    onSuccess: (_c, r) => callbacks.push({ onSuccess: r?.status, actions: (r?.actions ?? []).map(Object.keys) }),
    onServerError: (_c, r) => callbacks.push({ onServerError: r })
  } })
  await sleep(1500)
  resolver.resolveCommand({ refreshPlaylistCommand: { listId: data.playlistId } })
  let gone = false
  for (let i = 0; i < 20 && !gone; i++) {
    await sleep(250)
    gone = !entries().some((e) => e.playlistSetVideoId === target.playlistSetVideoId)
  }
  await sleep(1500); mo.disconnect()
  console.log({ resolver: resolver === app ? "ytd-app" : "controller", params, removed: target.videoId,
    goneFromPanel: gone, callbacks, toastsSeen: [...seen] })
})()
```

Run it with `params` left as is for Q2, and with `(…)(null)` for Q3.

## 10. Conflicts with the map

- **Ticket 12:**
  - It says no researched path removes one entry from YouTube's queue. One now exists (§5), pending Q2.
  - It says YouTube's own Add to queue has no undo. The server's toast for later adds has one (§6), pending Q1.
  - If Q1 confirms the toast, the queue button breaks "Nothing shows twice" today. Ticket 10 then needs §6's quiet add, or must accept YouTube's toast for queue adds.
- **The 1.5.0 bridge comment** (`yt-queue-bridge.ts:25-32`) says sending `openMiniplayer`/`onCreateListCommand` with an open queue replaces it. YouTube's own menu item always sends both [P3], and `addVideos` uses `onCreateListCommand` only when no list exists [B:15033]. That agrees with ticket 01 §5.
- **"Never drive YouTube's visible UI"** holds. Every step here is a resolved command. [UNS]'s hidden-menu-item click isn't needed.

## Sources

**YouTube's own client (fetched 2026-10-19, signed out)**
- [B] `https://www.youtube.com/s/_/ytmainappweb/_/js/k=ytmainappweb.kevlar_base.en_US.VRNYTIAj20w.es5.O/…/m=kevlar_base_module,kevlar_main_module,kevlar_base_sync_mod_chunk`, loaded by the watch page for client `2.20261016.01.00`. It's the same file as ticket 01, so its [bundle-check.mjs](https://github.com/Alioun/yt-playlist-tools/blob/research/youtube-requests/docs/research/youtube-requests/bundle-check.mjs) markers (`"TLPQ"`, `PLAYLIST_EDIT_LIST_TYPE_QUEUE`, `playlistEditEndpoint`) still hold.
- [P1]–[P5]: signed-out InnerTube requests (`playlist/create`, `browse/edit_playlist`, `next`, `search`), web client `2.20261016.01.00`, run on 2026-10-19 between 09:56 and 10:11 UTC as described above.

**Code, at the commits listed at the top**
- [UNS] https://github.com/kemus/youtube-up-next-sort (`src/youtube.ts`; commit `752282d07` "remove videos in one edit without waiting for confirmation")
- [QP] https://github.com/rockinrimmer/youtube-queue-persist (`lib/youtube.ts`)
- [QM] https://github.com/Lucas544875/youtube-queue-manager (`src/main-world.js:150-246`)
- [MS] https://github.com/greyt1563/Multiselect-for-YouTube (`js/polymer.js:190-300`)
- [YJ] https://github.com/LuanRT/YouTube.js (`src/core/managers/PlaylistManager.ts:144-185`)
- [YD] https://github.com/yt-dlp/yt-dlp
- This repo at `301ae51`: `src/entrypoints/yt-queue-bridge.ts`, `.scratch/rebuild/inventory.md`; ticket 01's research on branch `research/youtube-requests`; ticket 21's on `research/youtube-music`.
