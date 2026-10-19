# Moving a song that's already in YouTube Music's queue

Research for [ticket 28](../../.scratch/rebuild/issues/28-queue-reorder.md) of the 2.0 rebuild map. Researched 2026-10-19.

It builds on [ticket 21's research](https://github.com/Alioun/yt-playlist-tools/blob/research/youtube-music/docs/research/youtube-music.md), cited as "T21 §n". Everything about the web app was read from the YouTube Music client bundle (**B**), the same build T21 read. music.youtube.com still served that build at 11:56 the same day. I couldn't sign in, so anything that needs an account is marked **(live check)**. [Live checks](#7-live-checks) has a DevTools snippet for them.

Source keys such as **B**, **PEAR** and **YMC** are defined under [Sources](#sources).

## Answer

**Yes, through YouTube Music's own path.** When a drag in the queue panel ends, the panel's drop handler does four things. A page script can trigger that handler without touching the visible UI.

1. **What the drag does.** A drag in the queue panel (`ytmusic-player-queue`) ends in a private function that:
   - moves the entry in the tab's store (`MOVE_ITEM`);
   - clears the responsive-radio flag, as adding and removing do;
   - tells the server's queue: `browse/edit_playlist` with `ACTION_MOVE_VIDEO_AFTER`, the moved entry's `setVideoId` and its new predecessor's;
   - forwards the move to a cast session.
2. **How to reach it.** `app.queue` has `removeItem` but no move method, so there is nothing to call directly. The way in is the event the drag code fires: a `ytmusic-reorderable-list-drop` event on `ytmusic-player-queue`, with `detail.dragEl`.
   - The handler reads two things from `dragEl`: its `data`, which says which entry moves, and its index among its parent's children, which says where it goes.
   - A page script can fire the same event with a stand-in element that carries both.
3. **The server's copy stays in step**, as far as YouTube Music's own drag does. It's the same request.
   - The request is fire-and-forget. Nothing returns a promise, nothing rolls back, and a failure is only an unhandled rejection plus a telemetry counter.
   - It needs three fields on the entries: `playlistEditParams`, `playlistSetVideoId` and the queue's `playlistId`. Signed out, the entries lack `playlistEditParams`, so the server step throws and only the tab's copy moves. YouTube Music's own drag behaves the same. Whether signed-in entries carry all three is a **(live check)**.
4. **Don't dispatch `MOVE_ITEM` yourself.** Pear Desktop, its open queue-reorder PR and youtube-music-companion all do. That moves only the tab's copy. The server's copy keeps the old order and can bring it back: on queue restore after a reload, on a server queue update that overwrites the local one, and on server shuffle.
5. **Fragility: medium.**
   - **Survives minification:** the element tag, the event name and the element's `data` property are all strings in the bundle. Third parties have reached `#queue` since 2024-12, and it survived the 2026-09 player-UI test.
   - **Internal:** the shape of `detail.dragEl` is private, and nobody else uses this event, so it has no breakage history.
   - **Dangerous failure:** if the stand-in's `data` doesn't match an entry, the handler moves the **last** entry instead. So check the entry first and confirm the result afterwards (§3.3).

**Where to move it** (`cur` = index of the playing song; `from` = the entry's index in `queue.items`):

| Action | Target index (`to`) | Already there when |
|---|---|---|
| **Play next** | `from > cur ? cur + 1 : cur` | `from === cur + 1` |
| **Add to queue** | `items.length - 1`, the end of the user's queue, before autoplay suggestions | `from === items.length - 1` |

The playing song itself and autoplay suggestions can't be moved this way. Suggestions live in a separate list that has no drag (§1.5).

**For ticket 26:** the runner-up "on a queued song, Play next moves it up" is buildable:
- **Play next and Add to queue** on a queue item move the entry. Undo moves it back.
- **Remove from queue's Undo** ("puts the song back at its old position") can reuse this path: re-insert the song with the Add-to-queue replay, then move it to its old index.

Whether one name with two meanings is acceptable stays ticket 26's call.

## 1. What the queue panel's drag does

### 1.1 The drag code

- **The panel.** `ytmusic-player-queue` (component `AU`) is the queue panel, stamped as `<ytmusic-player-queue id="queue">` inside the player page's tab renderer (B@3612178, B@3595083 `is:"ytmusic-player-queue"`).
  - Its `data` property is bound to the store's `queue.items` (B@3591524 `U({selector:bN})`; `bN` returns `a.queue.items`, B@2463560).
  - Its `queue` is the same singleton as `app.queue` (B@3588389 `this.queue=H().resolve(CN)`; T21 §2.1).
- **The drag controller.** Once the panel has stamped its rows, it attaches a reorderable-list controller to `#contents` and to nothing else (`onRendererstamperFinished`, B@3589670). The controller (`eIb`, B@2953431):
  - wraps Closure's `DragListGroup` (`setHysteresis(2)`, `dragLists_`);
  - only starts on `pointerType === "mouse"` (B@2953598), so there is no touch drag;
  - fires `ytmusic-reorderable-list-drop` on the panel when the drag ends, with `{dragEl: currDragItem}` (B@2954729 `this.onDragEnd`). `currDragItem` is the row element that `DragListGroup` has already moved to its new DOM position.
- **How the event is sent.** `jx` builds a `CustomEvent` with `{bubbles: true, composed: true, detail}` and dispatches it on the host (B@1095886).
- **How the panel listens.** The panel listens with `@listen("ytmusic-reorderable-list-drop")` on `onDrop` (B@3594892). The decorator adds a plain `addEventListener` on the host element when the component is created. Only `tap`, `track`, `down` and `up` go through Polymer gestures (B@1547564 `vdb`, B@1547969 `ydb`, B@1547327 `udb`).
  - So a synthetic event dispatched on the panel reaches `onDrop` exactly as YouTube Music's own does.
  - `AU.prototype.onDrop` is also exported by name (B@3591017).
- **No per-item permission.** Every queue entry in the signed-out responses carries `canReorder: true` (R-next, R-queue), but the client never reads the field. Its only occurrence sets it to `false` for offline entries (B@4421469).

### 1.2 The drop handler

```js
// B@3590175, de-minified
onDrop(event) {
  const dragEl = event.detail.dragEl
  const from = this.data.findIndex((entry) =>
    dragEl.data.primaryRenderer
      ? entry.playlistPanelVideoWrapperRenderer === dragEl.data
      : entry.playlistPanelVideoRenderer === dragEl.data)
  const to = Array.from(dragEl.parentElement.children).indexOf(dragEl)
  moveQueueItem(this.queue, from, to) // mCb
}
```

- **`from`** is found by **object identity**: `dragEl.data` must be the very object stored in the entry. That is `entry.playlistPanelVideoRenderer`, or `entry.playlistPanelVideoWrapperRenderer` for entries that have both an audio and a video version.
- **`to`** is the dragged row's final index, read from the DOM.
- **Nothing is validated.** If no entry matches, `from` is −1 (see §5).

### 1.3 The move itself

```js
// B@2602742 "var mCb=function", de-minified
function moveQueueItem(queue, from, to) {
  const moved = queue.getItems()[from]
  queue.store.dispatch({ type: "MOVE_ITEM", payload: { fromIndex: from, toIndex: to } })
  if (flag("music_enable_responsive_radio_client"))
    queue.store.dispatch({ type: "SET_IS_RAAR_ENABLED", payload: false })
  if (queue.serverQueuesEnabled)
    serverMoveAfter(queue.serverQueueApi, moved, queue.getItems()[to - 1]) // lCb, not awaited
  if (casting) mdx.controlProxy?.moveVideo(videoIdOf(moved), from, to)    // B@2603053
}
```

- **The reducer** (B@2513968, `case"MOVE_ITEM"`) copies the array, splices the entry out at `fromIndex` and back in at `toIndex`. `toIndex` is therefore the entry's index **after** the move.
  - The entry objects stay the same objects, so the entry keeps its queue item ID (`navigationEndpoint.watchEndpoint.index`, T21 §2.2).
  - With `fromIndex` −1, `splice(-1, 1)` takes the **last** entry.
- **The playing song follows automatically.** The current index isn't stored: it is `items.findIndex(e => e.selected)` (B@2463840 `var gN=mw(bN`), so a move can't confuse it.
- **The responsive-radio flag** (`isRaarEnabled`) is cleared exactly as YouTube Music's own Add to queue (B@3440275) and `queue.removeItem` (B@2602225) clear it.
  - In the client, with server queues on, the flag only decides whether a skip is marked as a responsive-radio skip (B@2601553). With server queues off, it also decides whether queue fetches carry `responsiveSignals` (B@2617547).
  - What the server does differently is not visible from the client.

### 1.4 The server step

```js
// B@2627288 "lCb=function", de-minified
async function serverMoveAfter(api, moved, predecessor) {   // the caller doesn't await it
  const r = rendererOf(moved)                                // primary or counterpart, per playback mode
  const { playlistSetVideoId, playlistId } = r.navigationEndpoint.watchEndpoint
  if (!(r.playlistEditParams && playlistSetVideoId && playlistId)) {
    streamz.increment("REORDER", /* failed */ true)
    throw Error("Error moving item from server queue")
  }
  await sendPlaylistEdit(api, {                              // PCb, B@2628778
    playlistId,
    params: r.playlistEditParams,
    actions: [{
      action: "ACTION_MOVE_VIDEO_AFTER",
      setVideoId: playlistSetVideoId,
      movedSetVideoIdPredecessor: predecessor && setVideoIdOf(predecessor),
    }],
  })
}
```

- **Where it goes.** `sendPlaylistEdit` wraps the edit in a `playlistEditEndpoint` (class `EM`, B@2446897). It sends it with `JO.instance.sendRequest`, the app's own signed request path (B@2526724), to `/browse/edit_playlist` (B@2546253). It then runs the response's `actions`.
- **Telemetry.** The server-queue class files the move under telemetry type `"REORDER"` (B@2624667 `playlistActionTypeToQueueEditRequestTypeMap`), next to `"DELETE"` for removals.
- **Nothing reports back.** `lCb` starts its async body without returning it, and `mCb` returns nothing. A failed server move becomes an unhandled promise rejection, and the local move stays.
- **The shape matches the libraries.** youtubei.js sends exactly this action for playlist reordering (YJS `src/core/managers/PlaylistManager.ts:194-228`). ytmusicapi uses the mirror form, `ACTION_MOVE_VIDEO_BEFORE` with `movedSetVideoIdSuccessor` (YMA `ytmusicapi/mixins/playlists.py:381-388`).
- **Playlist pages are different.** YouTube Music's own playlist-page drag uses the BEFORE form through the generic service path (B@2961181 `buildReorderServiceEndpoint`). Only the queue uses AFTER with `params`.

### 1.5 What isn't exposed

- **No public move method.** `tP`, the class behind `app.queue`, has `removeItem` and `shuffle` but no move method. `mCb` is a module-private function, and its only caller is the panel's `onDrop` (2 occurrences in B: its definition and that call).
- **Nothing else moves entries.** `MOVE_ITEM` is dispatched nowhere else. B has no "move up/down" menu item or shortcut, and no other reorder path.
- **Autoplay suggestions** (`queue.automixItems`) are rendered in `#automix-contents`, which gets no drag controller (B@3589670). YouTube Music moves a suggestion into the queue only when it is played or selected, using `SHIFT_AUTOPLAY_ITEMS` and a server "promote" (B@2594913 `UAb`).
- **An unused flag.** `music_web_enable_reorder_controller` is `true` in the page config (H), but B never reads it.

## 2. The server's copy of the queue

- **Server queues are on.** `queue.serverQueuesEnabled` is the `music_web_enable_server_queues` flag (B@2613685), which is on (H). T21 §2.1 explains how adds keep the server's copy in step through `queueContextParams`.
- **The server's copy is a playlist.** Moves and removals edit it like one, addressed by each entry's `playlistSetVideoId` and `playlistId` (§1.4; removal: B@2626670 `var MCb`, `ACTION_REMOVE_VIDEO`).
- **The server's copy can replace the tab's.** These paths would reapply a server order that lacks a store-only move:
  - **Restore on reload.** `/next` with `watchNextType: "WATCH_NEXT_TYPE_GET_QUEUE"` and the stored `queueContextParams` (B@2615877 `QBb`).
    - It runs only when `shouldRestoreServerQueue` is true. That needs the restoration flag **and `IS_SUBSCRIBER`**, i.e. YouTube Music Premium (B@2595619).
    - So "the order survives a reload" can only be observed on a Premium account.
  - **Server queue updates.** A `queueUpdateCommand` with `syncMode: "QUEUE_UPDATE_SYNC_MODE_OVERWRITE_LOCAL"` replaces the tab's entries outright (`RESET_ITEMS`). One for the `QUEUE` section replaces them via `UPDATE_ITEMS` (B@2599609 `jCb`, B@4484471 `handleQueueUpdateCommand`).
  - **Playlist polling.** `pollPlaylistCommand` polling, behind `music_web_enable_queue_reflection_polling` (on), feeds such updates for the playing playlist (B@4484325, B@2589504 `vBb`).
  - **Shuffle.** With server queues, shuffle asks the server for the new order (B@2603358 `tP.prototype.shuffle`).
- **When the update commands arrive is server-side** and can't be read from the client.
  - The native move puts the new order into the server's copy, so those paths keep it.
  - A store-only `MOVE_ITEM` loses it whenever one of them runs.
- **Signed out**, entries have `playlistSetVideoId` and a radio `playlistId` (`RDAMVM…`) but no `playlistEditParams` (R-next, R-queue). The server step throws, and the move is local only, for YouTube Music's own drag too.

## 3. Doing it from a page script

### 3.1 Recommended: fire the panel's drop event

All of this runs in the page world, in the existing injected bridge. On Firefox, build the event and `dragEl` there too: a `CustomEvent` built in the content-script world would hide `detail` from the page behind Xray wrappers.

```js
const app = document.querySelector("ytmusic-app")
const panel = document.querySelector("ytmusic-player-queue#queue")

function moveQueueEntry(itemId, where /* "next" | "end" */) {
  const items = panel.data                                   // what onDrop will search
  if (items !== app.queue.store.getState().queue.items) return "stale"   // see 3.3
  const rendererOf = (e) =>
    e.playlistPanelVideoRenderer ?? e.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer
  const idOf = (e) => String(rendererOf(e).navigationEndpoint.watchEndpoint.index)
  const from = items.findIndex((e) => idOf(e) === itemId)
  const cur = app.queue.getCurrentItemIndex()
  if (from < 0 || from === cur) return "not movable"
  const to = where === "next" ? (from > cur ? cur + 1 : cur) : items.length - 1
  if (to === from) return "already there"

  const parent = document.createElement("div")              // stand-in for the panel's #contents
  for (let i = 0; i <= to; i++) parent.append(document.createElement("div"))
  const dragEl = parent.children[to]                         // index = target position
  dragEl.data = items[from].playlistPanelVideoRenderer ?? items[from].playlistPanelVideoWrapperRenderer
  panel.dispatchEvent(new CustomEvent("ytmusic-reorderable-list-drop",
    { detail: { dragEl }, bubbles: true, composed: true }))  // same options as YouTube Music's jx

  return idOf(app.queue.getItems()[to]) === itemId ? "moved" : "failed"
}
```

- **What this gives.** YouTube Music's exact move:
  - store, responsive-radio flag, server queue and cast session, in YouTube Music's order;
  - the panel repaints from the store, as after a drag.
- **What it doesn't need.** No visible UI is touched and no request is built by us.
- **What happens synchronously.** `dispatchEvent` runs the listener synchronously, and `mCb`'s store dispatch is synchronous. So the post-check can run on the next line. The server request then runs in the background.
- **The panel probably doesn't have to be open.** Pear Desktop's API server has addressed `#queue` since 2024-12 without ever opening the panel (PEAR `src/renderer.ts:182-258`). Whether it exists before anything has played, and while the Lyrics or Related tab is showing, is a **(live check)**.

### 3.2 Not recommended

- **Store-only `MOVE_ITEM`**, as Pear and youtube-music-companion do (§4).
  - It is simpler, and its payload has been stable since at least 2024-12.
  - But it diverges from the server's copy (§2), skips the cast session, and leaves the responsive-radio flag set.
- **Re-implementing `mCb`.** That would mean dispatching `MOVE_ITEM` and `SET_IS_RAAR_ENABLED` ourselves, then sending the same `ACTION_MOVE_VIDEO_AFTER` through `app.networkManager.fetch("/browse/edit_playlist", …)` or `app.handlePlaylistEditEndpoint`.
  - It keeps the server in step without the event.
  - But it hand-copies more internals: the item fields and the edit body. It also can't reach the cast session, whose service sits behind a renamed property (`JSC$13050_mdxService`).
  - Keep it in reserve for the case where the event path breaks but the item fields are still there.

### 3.3 Guards, confirmation and undo

- **Before firing:**
  - The entry must be in `panel.data`, which is `queue.items`. Autoplay suggestions are not.
  - The entry must not be the playing song.
  - `panel.data` must be the store's current array. If it's stale, `onDrop` could match the wrong entry or none, and none means the last entry moves (§1.3).
  - If the identity check proves too strict in practice, compare IDs instead **(live check)**.
- **Success** is confirmed by the store: the entry with that ID sits at `to`. This follows ticket 26's "confirmed only once the queue has actually grown" rule.
  - The server step can't be confirmed per move. Its promise isn't exposed, and re-reading the server's copy (§7) costs a request.
  - YouTube Music's own drag has the same blind spot.
- **Undo** moves the entry back, by the same path, to the index it had. Find it by queue item ID, which a move doesn't change.
  - If the entry has since started playing, there is nothing to undo, as in ticket 26's undo rule for inserts.
- **Concurrency.** Ticket 26 already runs queue actions one at a time per tab, which covers this.
- **Adapter check at page load:**
  - `customElements.get("ytmusic-player-queue")` exists;
  - `panel.queue === app.queue`;
  - `Array.isArray(panel.data)`;
  - `typeof panel.onDrop === "function"`.

  The last one is the method the listener calls, and the best available sign that the listener exists.

## 4. What others do

| Project | How it moves a queue entry | Server's copy |
|---|---|---|
| **Pear Desktop**, API server `PATCH /api/v1/queue/{index}` | `#queue.dispatch({type: "MOVE_ITEM", payload: {fromIndex, toIndex}})` (PEAR `src/renderer.ts:246-258`; route `src/plugins/api-server/backend/routes/control.ts:474-494, 835-841`). Added in #2767 (2024-12-25) as `ytmd:move-in-queue`. | Not updated |
| **Pear Desktop**, Music Together | Wraps the raw store's `dispatch` and catches the panel's own `MOVE_ITEM` to broadcast it (PEAR `src/plugins/music-together/queue/queue.ts:301-308, 416-432`). It replays remote moves with `MOVE_ITEM` (`:253-269`). This independently confirms that a panel drag dispatches `MOVE_ITEM {fromIndex, toIndex}`. | Not updated |
| **Pear Desktop PR #4615** (open, head `b65e9835`) | New `/queue/reorder` applies a permutation as successive `MOVE_ITEM`s (`src/renderer.ts` in the PR) | Not updated |
| **youtube-music-companion** | `store.dispatch({type: "MOVE_ITEM", …})` on `ytmusic-player-queue`'s raw store, with its own index checks. Success means "the order changed" (YMC `content/bridge.js:900-925`, called from the popup's drag list, `popup/popup.js:926-943`). | Not updated |
| **YTMQ** | No move. Removal falls back from `REMOVE_ITEM` to `removeFromQueueEndpoint` to clicking the panel (YTMQ `src/bridge/ytmusic-bridge.ts:1023-1147`). | n/a |
| **ytmusicapi, youtubei.js** | Playlist reordering only (`edit_playlist` moves, §1.4). They have no notion of the tab's queue. | n/a |

None of them fires the panel's drop event or sends the server move for the queue.

## 5. Fragility

| Depends on | Kind | Seen to change? | If it breaks |
|---|---|---|---|
| `ytmusic-player-queue#queue`, its `queue` and `data` | Element tag, id and property names, all strings in B | Used by Pear since 2024-12. It survived the 2026-09 Wiz miniplayer test, which Pear PR #4750 tested signed in. | Adapter check fails, and the action is withheld (ticket 26) |
| Event `ytmusic-reorderable-list-drop` | String literal shared by the queue and playlist-page drags (B@2965732, B@3594895) | No history; no third party uses it | Nothing moves. The post-check reports failure. |
| `detail.dragEl.data` identity and `parentElement.children` index | Private handler contract | No history | Mostly caught by the post-check. A handler that read the target some other way could move the wrong entry to the wrong place before the check notices. |
| Queue item ID `navigationEndpoint.watchEndpoint.index` | Assigned by `ADD_ITEMS` (T21 §2.2) | Shared with Remove from queue | Entry not found, so "not movable" |
| Server step | Item fields plus server acceptance of `ACTION_MOVE_VIDEO_AFTER` | Can't be observed from outside | Silent: the tab moves, the server keeps the old order. Same as YouTube Music's own drag. |
| `MOVE_ITEM` payload `{fromIndex, toIndex}` | Internal Redux action | Unchanged since at least 2024-12 (PEAR #2767 to today, B@2513968) | Only matters for the §3.2 fallback |

Overall, this is the same risk class as the Play next replay from T21: a private client contract, with string-keyed entry points. It's slightly better in one way: the request is YouTube Music's own rather than a copy. It's slightly worse in another: nobody else exercises the event, so a breakage would surface first in our post-check.

## 6. Side findings for other tickets

- **Ticket 26 / T21's Play next replay.**
  - YouTube Music's own `handleQueueAddEndpoint` dispatches `SET_IS_RAAR_ENABLED false` after every insert (B@3440275). T21's `live-check.js` `queueAdd` and Pear's `add-to-queue` don't.
  - Adding that dispatch keeps our insert identical to YouTube Music's. It's cheap, and harmless if the action type disappears.
- **Remove from queue's Undo** can be built from this path (see the Answer).
- **Server queue restore is Premium-only** (B@2595619). T21 §8 check 2 ("survive a reload") can only pass on a Premium account. On a free account, use the server-order read in §7 instead.

## 7. Live checks

Add these to [ticket 25](../../.scratch/rebuild/issues/25-live-checks.md). Paste the snippet into DevTools on a signed-in music.youtube.com tab (top frame, page context) with a few songs queued. Running it only reads. The moves run when you call them.

```js
(() => {
  const app = document.querySelector("ytmusic-app")
  const panel = document.querySelector("ytmusic-player-queue#queue")
  const store = app.queue.store
  const r = (e) =>
    e?.playlistPanelVideoRenderer ?? e?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer
  const id = (e) => String(r(e).navigationEndpoint.watchEndpoint.index)
  const title = (e) => (r(e)?.title?.runs ?? []).map((x) => x.text).join("")

  console.table({
    "panel exists": Boolean(panel),
    "panel.queue === app.queue": panel?.queue === app.queue,
    "panel.data is the store's items": panel?.data === store.getState().queue.items,
    "panel.onDrop": typeof panel?.onDrop
  })
  console.table(
    app.queue.getItems().map((e) => {
      const ep = r(e).navigationEndpoint.watchEndpoint
      return {
        id: id(e),
        title: title(e),
        playing: Boolean(r(e).selected),
        playlistId: ep.playlistId,
        playlistSetVideoId: ep.playlistSetVideoId,
        playlistEditParams: Boolean(r(e).playlistEditParams)
      }
    })
  )

  function move(itemId, where) {
    const items = panel.data
    if (items !== store.getState().queue.items) return "panel.data is stale"
    const from = items.findIndex((e) => id(e) === itemId)
    const cur = app.queue.getCurrentItemIndex()
    if (from < 0) return "not in the queue"
    if (from === cur) return "that's the playing song"
    const to = where === "next" ? (from > cur ? cur + 1 : cur) : items.length - 1
    if (to === from) return "already there"
    const parent = document.createElement("div")
    for (let i = 0; i <= to; i++) parent.append(document.createElement("div"))
    const dragEl = parent.children[to]
    dragEl.data = items[from].playlistPanelVideoRenderer ?? items[from].playlistPanelVideoWrapperRenderer
    panel.dispatchEvent(
      new CustomEvent("ytmusic-reorderable-list-drop", { detail: { dragEl }, bubbles: true, composed: true })
    )
    return id(app.queue.getItems()[to]) === itemId ? "moved" : "NOT moved"
  }

  /** The server's copy, read the way queue restoration reads it (B@2615877). */
  async function serverOrder() {
    const res = await app.networkManager.fetch("/next", {
      watchNextType: "WATCH_NEXT_TYPE_GET_QUEUE",
      queueContextParams: store.getState().queue.queueContextParams
    })
    let list
    JSON.stringify(res, (k, v) => (k === "playlistPanelRenderer" && !list && (list = v), v))
    return (list?.contents ?? []).map(title).filter(Boolean)
  }

  window.ytptMove = {
    next: (itemId) => move(itemId, "next"),
    end: (itemId) => move(itemId, "end"),
    localOrder: () => app.queue.getItems().map(title),
    serverOrder
  }
})()
```

Confirm:

1. **Fields.** Signed in, the table shows `playlistEditParams: true`, a `playlistSetVideoId` and a `playlistId` on every entry:
   - entries from the started playlist or radio;
   - entries added by YouTube Music's own Play next and Add to queue;
   - entries added by T21's `ytptCheck.playNext`.

   Note what kind of ID `playlistId` is.
2. **The native request.** Drag an entry in the panel by hand.
   - The Network tab shows `browse/edit_playlist` with `ACTION_MOVE_VIDEO_AFTER`, `setVideoId` and `movedSetVideoIdPredecessor`.
   - Record the response (`status`, `actions`).
3. **Our move.**
   - `ytptMove.next(id)` and `ytptMove.end(id)` return `"moved"`.
   - The panel repaints, and the same request goes out.
   - With `next`, the moved song plays after the current one ends.
   - Try an entry before the playing song as well as one after it.
4. **The server's copy.**
   - After a move, `await ytptMove.serverOrder()` matches `ytptMove.localOrder()`.
   - Then dispatch a raw `MOVE_ITEM` (`app.queue.store.dispatch({type: "MOVE_ITEM", payload: {fromIndex, toIndex}})`) and confirm that `serverOrder()` does **not** follow it. This is the evidence against the store-only route.
   - Check that `serverOrder()` doesn't disturb playback.
   - On a Premium account, also reload and check that the moved order is restored.
5. **Survival.** After a move in a radio (`RDAMVM…`) queue, skip twice and let the queue extend. The moved entry stays where it was put.
6. **Where the panel lives.**
   - The snippet's first table shows `true` for every row: before anything has played, with the player page closed, with the Lyrics or Related tab showing, and in the Wiz miniplayer UI if your account is in that test.
   - `ytptMove.next` works in each of those states.
7. **Casting (Chrome).** While casting, `ytptMove.next(id)` reorders the cast device's queue too.
8. **Signed out.** The move works locally. The console shows `Error moving item from server queue`, which is expected.
9. **Browsers.** Run all of the above in Chrome, Firefox, and the installed app window. From the extension, fire the event from the page-world bridge, not from the isolated content script.

## Sources

| Key | Source |
|---|---|
| **B** | YouTube Music web client bundle `https://music.youtube.com/s/39d19629/music_polymer_inlined_html.js`, client version `1.20261013.15.00`, SHA-256 `7410a6b84431e7b4f0d8883112c48262e2949ecb02c0385e39ba04b60fae4798`. It is T21's file; a fresh signed-out fetch of music.youtube.com at 11:56 on 2026-10-19 still referenced this build. It is minified, so it's cited as `B@<character offset>` plus an identifier to grep for. Offsets only hold for this build. |
| **H** | The music.youtube.com page config from the same fetch: `EXPERIMENT_FLAGS` `music_web_enable_server_queues`, `music_web_enable_server_queue_restoration`, `music_web_enable_queue_reflection_polling`, `music_enable_responsive_radio_client` and `music_web_enable_reorder_controller`, all `true`. These are the signed-out flags. |
| **R-next**, **R-queue** | T21's signed-out `WEB_REMIX` responses: `next {videoId: "gx7GyiDZQms", playlistId: "RDAMVMgx7GyiDZQms", params: "wAEB"}` and `music/get_queue {videoIds: ["gx7GyiDZQms"]}` (plus T21's album variant) |
| **T21** | [docs/research/youtube-music.md](https://github.com/Alioun/yt-playlist-tools/blob/research/youtube-music/docs/research/youtube-music.md) on branch `research/youtube-music` |
| **PEAR** | [pear-devs/pear-desktop](https://github.com/pear-devs/pear-desktop) (formerly th-ch/youtube-music) at `fb3923ce` (2026-10-12, still `master` on 2026-10-19); PR [#2767](https://github.com/pear-devs/pear-desktop/pull/2767) (merged 2024-12-25, `1d6251ba`); PR [#4615](https://github.com/pear-devs/pear-desktop/pull/4615) (open, head `b65e9835`); PR [#4750](https://github.com/pear-devs/pear-desktop/pull/4750) (open, 2026-10-13) |
| **YMC** | [benesmartin/youtube-music-companion](https://github.com/benesmartin/youtube-music-companion) at `329d9419` (2026-10-13, latest on 2026-10-19) |
| **YTMQ** | [T3lluz/YTMQ](https://github.com/T3lluz/YTMQ) at `35b0ff52` (2026-10-10, latest on 2026-10-19) |
| **YMA** | [sigma67/ytmusicapi](https://github.com/sigma67/ytmusicapi) at `4da34b6` (2026-10-12) |
| **YJS** | [LuanRT/YouTube.js](https://github.com/LuanRT/YouTube.js) at `c4a7b3f` (2026-10-18) |
