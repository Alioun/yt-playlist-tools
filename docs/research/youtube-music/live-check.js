// Live check for docs/research/youtube-music.md. Not part of the build.
//
// Paste into DevTools on a signed-in https://music.youtube.com tab (top frame,
// page context). Running it only READS: it prints which internals exist and
// what the current song and the first row on the page carry. The write checks
// sit on `window.ytptCheck` and only run when you call them, e.g.
//   await ytptCheck.playNext("gx7GyiDZQms")
//
// Every path here was read from the YouTube Music client bundle served on
// 2026-10-19 (`/s/39d19629/music_polymer_inlined_html.js`, client version
// 1.20261013.15.00). Nothing here was run signed in; that is what this is for.

(() => {
  const app = document.querySelector("ytmusic-app")
  const queue = app?.queue
  const store = queue?.store
  const player = document.querySelector("#movie_player")
  const fns = (obj, names) => names.filter((n) => typeof obj?.[n] === "function")
  const endpointKey = (ep) =>
    Object.keys(ep ?? {}).find((k) => k !== "clickTrackingParams" && k !== "commandMetadata")

  const current = () => {
    const items = queue?.getItems?.() ?? []
    const item = items[queue?.getCurrentItemIndex?.() ?? -1]
    const r =
      item?.playlistPanelVideoRenderer ??
      item?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer
    return {
      fromQueue: r && { videoId: r.videoId, title: r.title?.runs?.map((x) => x.text).join("") },
      fromPlayer: player?.getVideoData?.(),
      progress: player?.getProgressState?.(),
      mediaSession: navigator.mediaSession?.metadata && {
        title: navigator.mediaSession.metadata.title,
        artist: navigator.mediaSession.metadata.artist,
        album: navigator.mediaSession.metadata.album
      }
    }
  }

  const row = document.querySelector(
    "ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer"
  )
  const rowMenu = row?.data?.menu?.menuRenderer

  console.table({
    "ytmusic-app": Boolean(app),
    "app methods": fns(app, [
      "handleServiceEndpoint",
      "handleNavigationEndpoint",
      "handlePlaylistEditEndpoint",
      "handleCommandWithCommandHandler",
      "navigate",
      "resolveCommand"
    ]).join(" "),
    "networkManager.fetch": typeof app?.networkManager?.fetch,
    "queue methods": fns(queue, ["getItems", "getCurrentItemIndex", "removeItem", "isEmpty"]).join(" "),
    "store.dispatch": typeof store?.dispatch,
    "queue state keys": Object.keys(store?.getState?.().queue ?? {}).join(" "),
    "like button updateLikeStatus": typeof document.querySelector("ytmusic-player-bar #like-button-renderer")
      ?.updateLikeStatus,
    "new player bar like (view model)": Boolean(document.querySelector("like-button-view-model button")),
    "row tag": row?.tagName,
    "row videoId": row?.data?.playlistItemData?.videoId,
    "row setVideoId": row?.data?.playlistItemData?.playlistSetVideoId,
    "row menu": rowMenu?.items
      ?.map((i) => {
        const r = Object.values(i)[0]
        const ep = r.serviceEndpoint ?? r.navigationEndpoint ?? r.defaultServiceEndpoint
        return `${r.text?.runs?.[0]?.text ?? r.defaultText?.runs?.[0]?.text ?? "?"}=${endpointKey(ep)}`
      })
      .join(", "),
    "row like button": JSON.stringify(rowMenu?.topLevelButtons?.[0]?.likeButtonRenderer?.target)
  })
  console.log("now playing", current())

  /** Same request + store update as the ⋮ menu's "Play next" / "Add to queue". */
  async function queueAdd(target, position) {
    if (queue.isEmpty()) {
      // The app itself navigates instead of queueing when nothing is queued.
      app.handleNavigationEndpoint({ watchEndpoint: target })
      return "navigated"
    }
    const state = store.getState().queue
    const body = { queueContextParams: state.queueContextParams, queueInsertPosition: position }
    if (target.playlistId) body.playlistId = target.playlistId
    if (target.videoId) body.videoIds = [target.videoId]
    const response = await app.networkManager.fetch("/music/get_queue", body)
    if (response.queueContextParams)
      store.dispatch({ type: "SET_QUEUE_CONTEXT_PARAMS", payload: response.queueContextParams })
    const items = (response.queueDatas ?? []).map((d) => d.content)
    const index =
      position === "INSERT_AFTER_CURRENT_VIDEO" ? queue.getCurrentItemIndex() + 1 : queue.getItems().length
    store.dispatch({
      type: "ADD_ITEMS",
      payload: { nextQueueItemId: state.nextQueueItemId, index, items, shouldAssignIds: true }
    })
    return items.length
  }

  window.ytptCheck = {
    current,
    playNext: (videoId) => queueAdd({ videoId }, "INSERT_AFTER_CURRENT_VIDEO"),
    addToQueue: (videoId) => queueAdd({ videoId }, "INSERT_AT_END"),
    playNextPlaylist: (playlistId) => queueAdd({ playlistId }, "INSERT_AFTER_CURRENT_VIDEO"),
    /** Queue item id = String(item's watchEndpoint.index), assigned by ADD_ITEMS. */
    removeFromQueue: (position) => {
      const item = queue.getItems()[position]
      const r =
        item?.playlistPanelVideoRenderer ??
        item?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer
      return queue.removeItem(String(r.navigationEndpoint.watchEndpoint.index))
    },
    /** status: "LIKE" | "DISLIKE" | "INDIFFERENT". Watch the player bar's like state update. */
    like: (videoId, status = "LIKE") =>
      app.handleServiceEndpoint({ likeEndpoint: { status, target: { videoId } } }),
    /** One-click save to a known playlist. Check the response for duplicate handling. */
    saveTo: (playlistId, videoId) =>
      app.networkManager.fetch("/browse/edit_playlist", {
        playlistId,
        actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: videoId }]
      }),
    /** Look for any membership signal per playlist (containsSelectedVideos, icons, subtitles). */
    playlistsFor: (videoId) =>
      app.networkManager
        .fetch("/playlist/get_add_to_playlist", { videoIds: [videoId], excludeWatchLater: false })
        .then((r) => {
          const opts = []
          JSON.stringify(r, (k, v) => (k === "playlistAddToOptionRenderer" && opts.push(v), v))
          return opts.map((o) => ({
            playlistId: o.playlistId,
            title: o.title?.runs?.map((x) => x.text).join(""),
            containsSelectedVideos: o.containsSelectedVideos,
            additionalIcons: o.additionalIcons,
            keys: Object.keys(o).join(" ")
          }))
        }),
    startRadio: (videoId) =>
      app.handleNavigationEndpoint({
        watchEndpoint: { videoId, playlistId: `RDAMVM${videoId}`, params: "wAEB" }
      }),
    goTo: (browseId) => app.handleNavigationEndpoint({ browseEndpoint: { browseId } }),
    /**
     * Spike: run a command through the ⋮ menu item's own handler (toasts, casting
     * and empty-queue handling included) without opening any menu.
     */
    viaMenuItem: (command) => {
      const el = document.createElement("ytmusic-menu-service-item-renderer")
      return el.ytmusicServiceMenuItemBehavior?.handleCommand(command) ?? "no behaviour on a detached element"
    }
  }
})()
