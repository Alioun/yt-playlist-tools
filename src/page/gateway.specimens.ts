import type { PageEvent, PageRead, PageReadPort } from "./read-port"
import { readWatches } from "./read-port"

export const syntheticVideo = "synthetic01"
export const syntheticNextVideo = "synthetic02"
export const syntheticIdentity = "SYNTHETIC-OPAQUE-IDENTITY||COMPLETE-SUFFIX"
export const syntheticChannel = `UC${"a".repeat(22)}`

export const specimenProvenance = {
  kind: "synthetic",
  evidence: [
    ".scratch/rebuild/spec/06-architecture.md:170-264",
    ".scratch/rebuild/issues/07-watched.md:89-143,250-280",
    ".scratch/rebuild/issues/10-youtube-access.md:144-183",
    ".scratch/rebuild/issues/21-youtube-music-internals.md:46-59",
    ".scratch/rebuild/issues/25-live-checks.md:51-58",
    ".scratch/rebuild/issues/27-youtube-music-controls.md:180-188"
  ],
  limitations: [
    "Hand-written raw specimens, not response captures or live qualification.",
    "Navigation envelopes, renderer nesting and kind enums require actual captured variants.",
    "Boolean cast-status and bound cast-player values are test-only supported conditions. Live encodings remain pending.",
    "The selected-queue title and byline envelope, header count, and library toggle fields need capture confirmation.",
    "Queue entries use the playlistPanelVideoRenderer wrapper that app.queue.getItems() returns per tickets 21 and 28, not a capture.",
    "A fake change binding does not prove Music store subscription or mediaSession metadata notification compatibility."
  ]
}

export function rawResponse(videoId = syntheticVideo, flags: Record<string, unknown> = {}) {
  return { videoDetails: { videoId, title: "Synthetic video", lengthSeconds: "120", channelId: syntheticChannel, author: "Synthetic channel", ...flags } }
}
export function rawNavigation(kind: "watch" | "shorts" | "other" = "watch", videoId = syntheticVideo) {
  return {
    pageType: kind === "other" ? "HOME" : kind === "shorts" ? "SHORTS" : "WATCH",
    endpoint: kind === "other" ? {} : kind === "shorts" ? { reelWatchEndpoint: { videoId } } : { watchEndpoint: { videoId } },
    response: { playerResponse: rawResponse(videoId) }
  }
}
export function rawPlayer(videoId = syntheticVideo, overrides: Record<string, unknown> = {}) {
  return {
    videoData: { video_id: videoId }, response: rawResponse(videoId), currentTime: 15, duration: 120,
    presentingPlayerType: 1, adShowing: false, adActive: false,
    video: { currentTime: 901, duration: 999, paused: false, seeking: false, playbackRate: 1.25 },
    ...overrides
  }
}
export function rawMusicPlayer(videoId = syntheticVideo) {
  return rawPlayer(videoId, { video: { currentTime: 12, duration: 180, paused: false, seeking: false, playbackRate: 1 } })
}
export function rawSong(videoId = syntheticVideo, index = 7) {
  return {
    title: { runs: [{ text: "Synthetic song" }] }, musicVideoType: "MUSIC_VIDEO_TYPE_ATV",
    navigationEndpoint: { watchEndpoint: { videoId, index } }, selected: false, likeStatus: "INDIFFERENT",
    menu: { menuRenderer: { items: [
      { menuServiceItemRenderer: { serviceEndpoint: { queueAddEndpoint: { queueTarget: { videoId }, queueInsertPosition: "INSERT_AT_END" } } } },
      { menuServiceItemRenderer: { serviceEndpoint: { addToPlaylistEndpoint: { videoId } } } },
      { menuServiceItemRenderer: { serviceEndpoint: { queueAddEndpoint: { queueTarget: { videoId }, queueInsertPosition: "INSERT_AFTER_CURRENT_VIDEO" } } } }
    ] } }
  }
}
export function rawQueueItem(videoId = syntheticVideo, index = 7, extra: Record<string, unknown> = {}) {
  return { playlistPanelVideoRenderer: { ...rawSong(videoId, index), videoId, ...extra } }
}

export function scriptedPage(initial: Partial<Record<PageRead, unknown>> = {}) {
  const values: Partial<Record<PageRead, unknown>> = {
    navigation: rawNavigation(), location: { pathname: "/watch", search: `?v=${syntheticVideo}` }, watchPlayer: rawPlayer(),
    targetContext: { inAutomix: false }, ...initial
  }
  const config: Record<string, unknown> = { LOGGED_IN: true, DATASYNC_ID: syntheticIdentity }
  const faults = new Set<PageRead | "config" | "has">()
  const reads: { what: PageRead; target: Element | undefined }[] = []
  const configReads: string[] = []
  const callbacks: { event: PageEvent; changed: (detail: unknown) => void; active: boolean; stops: number }[] = []
  let queueChanges = true
  const port: PageReadPort = {
    config(key) {
      configReads.push(key)
      if (faults.has("config")) throw new Error(syntheticIdentity)
      return config[key]
    },
    read(what, target) {
      reads.push({ what, target })
      if (faults.has(what)) throw new Error(syntheticIdentity)
      return values[what]
    },
    on(event, changed) {
      const record = { event, changed, active: true, stops: 0 }
      callbacks.push(record)
      return () => { if (record.active) { record.active = false; record.stops++ } }
    },
    has(id) {
      if (faults.has("has")) throw new Error(syntheticIdentity)
      if (id === readWatches.identity) return config.LOGGED_IN !== undefined
      if (id === readWatches.queueChanges) return queueChanges
      return Object.entries(readWatches).some(([what, watch]) => watch === id && Object.hasOwn(values, what) && Reflect.get(values, what) !== undefined)
    }
  }
  return {
    port, values, config, faults, reads, callbacks, configReads,
    setQueueChanges(value: boolean) { queueChanges = value },
    active() { return callbacks.filter(record => record.active).length },
    emit(event: PageEvent, detail?: unknown) {
      for (const record of [...callbacks]) if (record.active && record.event === event) record.changed(detail)
    },
    stale(event: PageEvent, detail?: unknown) {
      for (const record of [...callbacks]) if (!record.active && record.event === event) record.changed(detail)
    }
  }
}
