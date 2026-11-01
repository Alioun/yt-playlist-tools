import { expect, test } from "bun:test"
import { isBreakageSignal, isJobResultFor, isProbeReportFor } from "../shared/contracts"
import type { BreakageSignal, PlayerData, Stream } from "../shared/contracts"
import { isVideoId } from "../shared/model/validation"
import { createGateway } from "./gateway"
import { readRoutes, readVocabulary, readWatches } from "./read-port"
import {
  rawMusicPlayer, rawNavigation, rawPlayer, rawQueueItem, rawResponse, rawSong, scriptedPage, specimenProvenance,
  syntheticChannel, syntheticIdentity, syntheticNextVideo, syntheticVideo
} from "./gateway.specimens"

function videoId(value = syntheticVideo) {
  if (!isVideoId(value)) throw new Error("Invalid synthetic video")
  return value
}
const unavailable = { ok: false, reason: "unavailable" }
const content = {
  ad: false, at: 10, player: "watch", videoId: syntheticVideo, pos: 15, len: 120, listedLength: 120,
  rate: 1.25, playing: true, seeking: false, content: "video",
  isPostLiveDvr: false, isLive: false, isUpcoming: false, isLiveContent: false
}
const success = (data: unknown, route: unknown) => ({ ok: true, data, route })

test("raw identity is pinned whole only in PageJobResult, and is never a shared account result", async () => {
  const p = scriptedPage(), signals: BreakageSignal[] = []
  const g = createGateway({ site: "www", page: p.port, now: () => 10, signals: value => signals.push(value) })
  const answer = await g.run({ kind: "account" })
  expect(answer).toEqual<unknown>(success({ signedIn: true, datasyncId: syntheticIdentity }, readRoutes.account))
  expect(isJobResultFor({ kind: "account" }, answer)).toBe(false)
  p.config.DATASYNC_ID = "different-synthetic-identity"
  p.config.LOGGED_IN = false
  expect(await g.run({ kind: "account" })).toEqual(answer)
  expect(p.configReads).toEqual(["LOGGED_IN", "DATASYNC_ID"])
  expect(signals).toEqual([])
  expect(p.active()).toBe(0)
  g.dispose()
})

test("signed-out visitor IDs stay signed out and missing or throwing config is unavailable", async () => {
  for (const mode of ["signed-out", "missing", "throws"] as const) {
    const p = scriptedPage(), signals: BreakageSignal[] = []
    if (mode === "signed-out") { p.config.LOGGED_IN = false; p.config.DATASYNC_ID = "VSYNTHETIC||" }
    if (mode === "missing") delete p.config.DATASYNC_ID
    if (mode === "throws") p.faults.add("config")
    const g = createGateway({ site: "music", page: p.port, signals: value => signals.push(value), now: () => 10 })
    expect(await g.run({ kind: "account" })).toEqual<unknown>(mode === "signed-out" ? success({ signedIn: false, datasyncId: null }, readRoutes.account) : unavailable)
    expect(signals.every(value => isBreakageSignal(value, readVocabulary))).toBe(true)
    expect(JSON.stringify(signals)).not.toContain(syntheticIdentity)
    g.dispose()
  }
})

test("navigation response precedes the player response and channel reads never fabricate absence", async () => {
  const p = scriptedPage(), g = createGateway({ site: "www", page: p.port })
  p.values.watchPlayer = rawPlayer(syntheticVideo, { response: rawResponse(syntheticVideo, { title: "Player title" }) })
  expect(await g.run({ kind: "videoInfo" })).toEqual<unknown>(success({ videoId: syntheticVideo, title: "Synthetic video", length: 120, kind: "video" }, readRoutes.videoInfo))
  expect(await g.run({ kind: "channelOf", videoId: videoId() })).toEqual<unknown>(success({ channelId: syntheticChannel, title: "Synthetic channel" }, readRoutes.channelOf))
  p.values.navigation = { ...rawNavigation(), response: {} }
  expect(await g.run({ kind: "videoInfo" })).toEqual<unknown>(success({ videoId: syntheticVideo, title: "Player title", length: 120, kind: "video" }, readRoutes.videoInfo))
  expect(await g.run({ kind: "channelOf", videoId: videoId(syntheticNextVideo) })).toEqual<unknown>(unavailable)
  p.values.watchPlayer = rawPlayer(syntheticVideo, { response: { videoDetails: { videoId: syntheticVideo, title: "No channel" } } })
  expect(await g.run({ kind: "channelOf", videoId: videoId() })).toEqual<unknown>(unavailable)
  g.dispose()
})

test("targeted video and Music item reads forward the actual element without marker writes", async () => {
  const target = document.createElement("article"), p = scriptedPage({ targetData: { videoId: syntheticNextVideo, title: { simpleText: "Target" } } })
  const www = createGateway({ site: "www", page: p.port })
  expect(await www.run({ kind: "videoInfo" }, { target })).toEqual<unknown>(success({ videoId: syntheticNextVideo, title: "Target", length: null, kind: "video" }, readRoutes.videoInfo))
  expect(p.reads).toEqual([{ what: "targetData", target }])
  const music = createGateway({ site: "music", page: p.port })
  p.values.targetData = rawSong()
  const answer = await music.run({ kind: "itemInfo" }, { target })
  expect(answer).toEqual<unknown>(success({
    kind: "song", type: { kind: "music-video", musicVideoType: "MUSIC_VIDEO_TYPE_ATV" }, title: "Synthetic song",
    selected: false, autoplay: false, hasOwnLike: true, likeState: "not-liked", videoId: syntheticVideo, queueItemId: 7,
    endpoints: {
      end: { queueAddEndpoint: { queueTarget: { videoId: syntheticVideo }, queueInsertPosition: "INSERT_AT_END" } },
      save: { addToPlaylistEndpoint: { videoId: syntheticVideo } },
      next: { queueAddEndpoint: { queueTarget: { videoId: syntheticVideo }, queueInsertPosition: "INSERT_AFTER_CURRENT_VIDEO" } }
    }
  }, readRoutes.itemInfo))
  expect(p.reads.at(-1)?.target).toBe(target)
  expect(target.attributes.length).toBe(0)
  expect(await music.run({ kind: "itemInfo" })).toEqual<unknown>(unavailable)
  www.dispose(); music.dispose()
})

test("unknown kinds and invalid native endpoint targets are unavailable", async () => {
  const target = document.createElement("article"), p = scriptedPage(), g = createGateway({ site: "music", page: p.port })
  p.values.targetData = { ...rawSong(), musicVideoType: "UNKNOWN_NEW_KIND" }
  expect(await g.run({ kind: "itemInfo" }, { target })).toEqual<unknown>(unavailable)
  p.values.targetData = { ...rawSong(), menu: { menuRenderer: { items: [{ menuServiceItemRenderer: { serviceEndpoint: {
    queueAddEndpoint: { queueInsertPosition: "INSERT_AT_END", queueTarget: { videoId: "invalid" } }
  } } }] } } }
  expect(await g.run({ kind: "itemInfo" }, { target })).toEqual<unknown>(unavailable)
  p.values.targetData = { ...rawSong(), selected: true, navigationEndpoint: { watchEndpoint: { videoId: syntheticVideo } } }
  expect(await g.run({ kind: "itemInfo" }, { target })).toEqual<unknown>(unavailable)
  g.dispose()
})

test("navigation disagreement suppresses both stale reads and counting; Shorts use their own player", async () => {
  const p = scriptedPage(), g = createGateway({ site: "www", page: p.port, now: () => 10 }), readings: unknown[] = []
  const stop = g.watch("player", value => readings.push(value))
  p.emit("player")
  expect(readings).toEqual([content])
  p.values.navigation = rawNavigation("shorts", syntheticNextVideo)
  p.values.location = { pathname: `/shorts/${syntheticNextVideo}`, search: "" }
  p.values.shortsPlayer = rawPlayer()
  p.emit("navigation")
  expect(readings).toEqual([content])
  expect(await g.run({ kind: "videoInfo" })).toEqual<unknown>(unavailable)
  p.values.shortsPlayer = rawPlayer(syntheticNextVideo)
  p.emit("player")
  expect(readings).toEqual([content, { ...content, player: "shorts", videoId: syntheticNextVideo }])
  expect(await g.run({ kind: "videoInfo" })).toEqual<unknown>(success({ videoId: syntheticNextVideo, title: "Synthetic video", length: 120, kind: "short" }, readRoutes.videoInfo))
  stop(); g.dispose()
})

test("miniplayer IDs count only after their own watch-context identity event", () => {
  const p = scriptedPage({ navigation: rawNavigation("other"), location: { pathname: "/", search: "" } })
  const g = createGateway({ site: "www", page: p.port, now: () => 10 }), values: unknown[] = []
  const stop = g.watch("player", value => values.push(value))
  p.emit("player")
  expect(values).toEqual([])
  p.emit("playerIdentity", { id: "shorts-player" })
  expect(values).toEqual([])
  p.emit("playerIdentity", { id: "movie_player" })
  expect(values).toEqual([content])
  p.values.watchPlayer = rawPlayer(syntheticNextVideo)
  p.emit("player")
  expect(values).toEqual([content])
  p.emit("playerIdentity", { id: "movie_player" })
  expect(values).toEqual([content, { ...content, videoId: syntheticNextVideo }])
  stop(); g.dispose()
})

test("ordinary and Shorts ads emit only the ad variant without content reads", () => {
  for (const ad of ["class", "presenting", "event", "shorts-navigation"] as const) {
    const shorts = ad === "shorts-navigation"
    const p = scriptedPage({ navigation: shorts ? { ...rawNavigation("shorts"), endpoint: { reelWatchEndpoint: { videoId: syntheticVideo, adClientParams: { isAd: true } } } } : rawNavigation(),
      location: { pathname: shorts ? `/shorts/${syntheticVideo}` : "/watch", search: shorts ? "" : `?v=${syntheticVideo}` } })
    const raw = {
      adShowing: ad === "class", presentingPlayerType: ad === "presenting" ? 2 : 1, adActive: ad === "event",
      get videoData(): never { throw new Error("Content read during ad") }, get currentTime(): never { throw new Error("Position read during ad") }
    }
    p.values[shorts ? "shortsPlayer" : "watchPlayer"] = raw
    const g = createGateway({ site: "www", page: p.port, now: () => 10 }), values: unknown[] = []
    g.watch("player", value => values.push(value))
    p.emit("player")
    expect(values).toEqual([{ ad: true, at: 10, player: shorts ? "shorts" : "watch" }])
    g.dispose()
  }
})

test("clip, provisional kids marker and all documented live flags are preserved", () => {
  const variants = [
    { extra: { clipConfig: { startTimeMs: 1000, endTimeMs: 5000 } }, flags: {}, expected: { content: "clip" } },
    { extra: { playabilityStatus: { miniplayer: { miniplayerRenderer: { playbackMode: "PLAYBACK_MODE_PAUSED_ONLY" } } } }, flags: {}, expected: { content: "made-for-kids" } },
    ...[{ isLive: true, isLiveContent: true }, { isLive: true, isLiveContent: false }, { isUpcoming: true },
      { isPostLiveDvr: true }, { isLiveContent: true }, { isLiveContent: false }].map(flags => ({ extra: {}, flags, expected: flags }))
  ]
  for (const variant of variants) {
    const p = scriptedPage({ watchPlayer: rawPlayer(syntheticVideo, { response: { ...rawResponse(syntheticVideo, variant.flags), ...variant.extra } }) })
    const g = createGateway({ site: "www", page: p.port, now: () => 10 }), values: PlayerData[] = []
    g.watch("player", value => values.push(value)); p.emit("player")
    expect(values).toEqual<unknown>([{ ...content, ...variant.expected }])
    g.dispose()
  }
  expect(specimenProvenance.kind).toBe("synthetic")
})

test("nonfinite or invalid raw times, lengths, rates and flags never become readings", () => {
  const invalid = [
    { currentTime: -1 }, { currentTime: NaN }, { currentTime: Infinity }, { duration: 0 }, { duration: Infinity },
    { response: rawResponse(syntheticVideo, { lengthSeconds: "NaN" }) },
    { response: rawResponse(syntheticVideo, { isLive: "yes" }) },
    { video: { paused: false, seeking: false, playbackRate: 0 } },
    { video: { paused: false, seeking: false, playbackRate: Infinity } }
  ]
  for (const override of invalid) {
    const p = scriptedPage({ watchPlayer: rawPlayer(syntheticVideo, override) })
    const g = createGateway({ site: "www", page: p.port }), values: unknown[] = []
    g.watch("player", value => values.push(value)); p.emit("player")
    expect(values).toEqual([])
    g.dispose()
  }
})

test("Music reads metadata and largest artwork without a player bar, with selected-queue fallback", async () => {
  const p = scriptedPage({ watchPlayer: rawMusicPlayer(), musicQueue: [], mediaMetadata: {
    title: "Synthetic song", artist: "Synthetic artist", album: "Synthetic album",
    artwork: [{ src: "https://synthetic.invalid/small", sizes: "96x96" }, { src: "https://synthetic.invalid/large", sizes: "512x512" }]
  } })
  const g = createGateway({ site: "music", page: p.port })
  expect(await g.run({ kind: "nowPlaying" })).toEqual<unknown>(success({ videoId: syntheticVideo, title: "Synthetic song", artist: "Synthetic artist", album: "Synthetic album", artwork: "https://synthetic.invalid/large", pos: 12, len: 180 }, readRoutes.nowPlaying))
  p.values.mediaMetadata = null
  p.values.musicQueue = [rawQueueItem(syntheticVideo, 7, { selected: true, longBylineText: { runs: [{ text: "Fallback artist" }] } })]
  expect(await g.run({ kind: "nowPlaying" })).toEqual<unknown>(success({ videoId: syntheticVideo, title: "Synthetic song", artist: "Fallback artist", pos: 12, len: 180 }, readRoutes.nowPlaying))
  p.values.musicQueue = [rawQueueItem(syntheticNextVideo, 7, { selected: true, longBylineText: "Fallback artist" })]
  expect(await g.run({ kind: "nowPlaying" })).toEqual<unknown>(unavailable)
  p.values.musicQueue = []; p.values.watchPlayer = undefined
  expect(await g.run({ kind: "nowPlaying" })).toEqual<unknown>(success(null, readRoutes.nowPlaying))
  p.values.mediaMetadata = undefined
  expect(await g.run({ kind: "nowPlaying" })).toEqual<unknown>(unavailable)
  g.dispose()
})

test("cast primary, malformed and throwing hooks fall back safely under supported test encodings", async () => {
  const p = scriptedPage({ musicState: { castStatus: true }, castPlayer: false })
  const signals: BreakageSignal[] = [], g = createGateway({ site: "music", page: p.port, signals: value => signals.push(value), now: () => 10 })
  expect(await g.run({ kind: "castState" })).toEqual<unknown>(success({ casting: true }, readRoutes.castState))
  p.values.musicState = { castStatus: "unqualified-enum" }
  expect(await g.run({ kind: "castState" })).toEqual<unknown>(success({ casting: false }, readRoutes.castState))
  p.faults.add("musicState")
  expect(await g.run({ kind: "castState" })).toEqual<unknown>(success({ casting: false }, readRoutes.castState))
  p.faults.add("castPlayer")
  expect(await g.run({ kind: "castState" })).toEqual<unknown>(unavailable)
  expect(signals.every(signal => isBreakageSignal(signal, readVocabulary))).toBe(true)
  expect(signals.some(signal => signal.kind === "threw" && signal.watchId === readWatches.musicState)).toBe(true)
  expect(JSON.stringify(signals)).not.toContain(syntheticIdentity)
  g.dispose()
})

test("probe and diagnostics share IDs, scrub unknown keys and contain no identity, values or exception strings", async () => {
  const p = scriptedPage({ targetData: { [syntheticIdentity]: "https://synthetic.invalid/private", musicVideoType: syntheticIdentity } })
  const signals: BreakageSignal[] = [], g = createGateway({ site: "music", page: p.port, now: () => 10, signals: value => signals.push(value) })
  const report = await g.probe()
  expect(isProbeReportFor({ site: "music", watchIds: readVocabulary.watchIds }, report)).toBe(true)
  await g.run({ kind: "itemInfo" }, { target: document.createElement("article") })
  p.faults.add("mediaMetadata"); await g.run({ kind: "nowPlaying" })
  expect(signals.length).toBeGreaterThan(0)
  expect(signals.every(signal => isBreakageSignal(signal, readVocabulary))).toBe(true)
  for (const signal of signals) expect(report.entries.some(entry => entry.id === signal.watchId)).toBe(true)
  const serialized = JSON.stringify(signals)
  expect(serialized).not.toContain(syntheticIdentity)
  expect(serialized).not.toContain("synthetic.invalid")
  expect(serialized).toContain("<key>")
  g.dispose()
})

test("watchers share exact ownership, tolerate throwing subscribers and reject stale callbacks after release", () => {
  const p = scriptedPage(), g = createGateway({ site: "www", page: p.port, now: () => 10 }), values: unknown[] = []
  const first = g.watch("player", () => { throw new Error("Synthetic subscriber failure") })
  const second = g.watch("player", value => values.push(value))
  expect(p.active()).toBe(3)
  expect(p.callbacks.map(callback => callback.event)).toEqual(["navigation", "playerIdentity", "player"])
  p.emit("player"); expect(values).toEqual([content])
  first(); first(); expect(p.active()).toBe(3)
  second(); second(); expect(p.active()).toBe(0)
  expect(p.callbacks.map(callback => callback.stops)).toEqual([1, 1, 1])
  p.stale("player"); expect(values).toEqual([content])
  const third = g.watch("player", value => values.push(value))
  p.stale("player"); expect(values).toEqual([content])
  g.dispose(); g.dispose(); p.stale("player"); third()
  expect(values).toEqual([content])
  expect(p.active()).toBe(0)
  expect(p.callbacks.map(callback => callback.stops)).toEqual([1, 1, 1, 1, 1, 1])
})

test("unsupported streams attach nothing and gateway instances own independent watchers", async () => {
  for (const site of ["www", "music"] as const) {
    const p = scriptedPage(), g = createGateway({ site, page: p.port })
    const unsupported: Stream[] = site === "www" ? ["nowPlaying", "queue"] : ["player"]
    for (const stream of unsupported) g.watch(stream, () => { throw new Error("Unsupported stream") })()
    expect(p.active()).toBe(0)
    expect(await g.run(site === "www" ? { kind: "nowPlaying" } : { kind: "videoInfo" })).toEqual<unknown>(unavailable)
    expect(await g.run({ kind: "accountLabel" })).toEqual<unknown>(unavailable)
    g.dispose()
  }
  const p = scriptedPage(), a = createGateway({ site: "www", page: p.port }), b = createGateway({ site: "www", page: p.port })
  a.watch("nav", () => {}); b.watch("nav", () => {})
  expect(p.active()).toBe(4)
  a.dispose(); expect(p.active()).toBe(2)
  b.dispose(); expect(p.active()).toBe(0)
})

test("Music queue and nowPlaying push only on owned events and refuse absent notification binding", () => {
  const p = scriptedPage({ musicQueue: [rawQueueItem()], watchPlayer: rawMusicPlayer(), mediaMetadata: { title: "Song", artist: "Artist", artwork: [] } })
  const g = createGateway({ site: "music", page: p.port }), queues: unknown[] = [], playing: unknown[] = []
  const stopQueue = g.watch("queue", value => queues.push(value)), stopNow = g.watch("nowPlaying", value => playing.push(value))
  p.emit("queue")
  expect(queues).toEqual([{ ids: [7] }])
  expect(playing).toEqual([{ videoId: syntheticVideo, title: "Song", artist: "Artist", pos: 12, len: 180 }])
  p.values.musicQueue = [rawQueueItem(syntheticVideo, 7), rawQueueItem(syntheticNextVideo, 7)]
  p.emit("queue"); expect(queues).toEqual([{ ids: [7] }])
  stopQueue(); stopNow(); expect(p.active()).toBe(0)
  p.setQueueChanges(false); g.watch("queue", value => queues.push(value))
  expect(p.active()).toBe(0)
  g.dispose()
})

test("synchronous subscription delivery followed by disposal releases every acquired hook", () => {
  const p = scriptedPage()
  const port = { ...p.port, on(event: Parameters<typeof p.port.on>[0], changed: Parameters<typeof p.port.on>[1]) {
    const stop = p.port.on(event, changed)
    changed({ id: "movie_player" })
    return stop
  } }
  const g = createGateway({ site: "www", page: port })
  g.watch("player", () => { g.dispose() })
  expect(p.active()).toBe(0)
  expect(p.callbacks.every(callback => callback.stops === 1)).toBe(true)
})

test("Shorts API absence uses only an agreeing navigation response and the scoped native video", () => {
  const p = scriptedPage({ navigation: rawNavigation("shorts"), location: { pathname: `/shorts/${syntheticVideo}`, search: "" }, shortsPlayer: {
    adShowing: false, adActive: false, video: { currentTime: 9, duration: 120, playbackRate: 1, paused: false, seeking: false }
  } })
  const g = createGateway({ site: "www", page: p.port, now: () => 10 }), values: unknown[] = []
  g.watch("player", value => values.push(value)); p.emit("player")
  expect(values).toEqual([{ ...content, player: "shorts", pos: 9, rate: 1 }])
  p.values.navigation = { ...rawNavigation("shorts"), response: {} }
  p.emit("player"); expect(values).toHaveLength(1)
  g.dispose()
})

test("item autoplay comes from the targeted automix context and missing context stays unavailable", async () => {
  const target = document.createElement("button")
  const p = scriptedPage({ targetData: { ...rawSong(), autoplay: true }, targetContext: { inAutomix: false } })
  const g = createGateway({ site: "music", page: p.port })
  const outside = await g.run({ kind: "itemInfo" }, { target })
  expect(outside).toHaveProperty("data.autoplay", false)
  p.values.targetData = { ...rawSong(), autoplay: false }
  p.values.targetContext = { inAutomix: true }
  const inside = await g.run({ kind: "itemInfo" }, { target })
  expect(inside).toEqual<unknown>(outside.ok ? { ...outside, data: { ...outside.data, autoplay: true } } : undefined)
  expect(p.reads.filter(read => read.what === "targetContext").map(read => read.target)).toEqual([target, target])
  for (const context of [undefined, null, {}, { inAutomix: "yes" }]) {
    p.values.targetContext = context
    expect(await g.run({ kind: "itemInfo" }, { target })).toEqual<unknown>(unavailable)
  }
  p.faults.add("targetContext")
  expect(await g.run({ kind: "itemInfo" }, { target })).toEqual<unknown>(unavailable)
  g.dispose()
})

test("item classification rejects a malformed native navigation endpoint", async () => {
  const target = document.createElement("article"), p = scriptedPage(), g = createGateway({ site: "music", page: p.port })
  p.values.targetData = { title: { simpleText: "Synthetic album" }, navigationEndpoint: { browseEndpoint: {
    browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ALBUM" } }
  } } }
  expect(await g.run({ kind: "itemInfo" }, { target })).toEqual<unknown>(unavailable)
  p.values.targetData = { ...rawSong(), navigationEndpoint: { watchEndpoint: { videoId: "invalid", index: 7 } } }
  expect(await g.run({ kind: "itemInfo" }, { target })).toEqual<unknown>(unavailable)
  g.dispose()
})

test("a throwing cast-status property uses the fallback without leaking its exception", async () => {
  const signals: BreakageSignal[] = []
  const p = scriptedPage({ musicState: { get castStatus(): never { throw new Error(syntheticIdentity) } }, castPlayer: false })
  const g = createGateway({ site: "music", page: p.port, signals: signal => signals.push(signal), now: () => 10 })
  expect(await g.run({ kind: "castState" })).toEqual<unknown>(success({ casting: false }, readRoutes.castState))
  expect(signals).toEqual([{
    site: "music", feature: null, job: "castState", route: readRoutes.castState, kind: "threw", watchId: readWatches.musicState,
    shape: null, clientVersion: null, pageType: "other", count: 1, firstSeen: 10, lastSeen: 10
  }])
  g.dispose()
})

test("a failed stream subscription releases earlier hooks and identifies the failing watch", () => {
  const p = scriptedPage(), signals: BreakageSignal[] = []
  const port = { ...p.port, on(event: Parameters<typeof p.port.on>[0], changed: Parameters<typeof p.port.on>[1]) {
    if (event === "player") throw new Error(syntheticIdentity)
    return p.port.on(event, changed)
  } }
  const g = createGateway({ site: "www", page: port, signals: signal => signals.push(signal), now: () => 10 })
  const stop = g.watch("player", () => { throw new Error("No reading expected") })
  expect(p.active()).toBe(0)
  expect(p.callbacks.map(callback => callback.stops)).toEqual([1, 1])
  expect(signals).toHaveLength(1)
  expect(signals[0]).toMatchObject({ kind: "threw", watchId: readWatches.watchPlayer })
  expect(JSON.stringify(signals)).not.toContain(syntheticIdentity)
  stop(); g.dispose()
})

test("navigation streams serialize the complete reading and suppress stale video metadata on both sites", () => {
  for (const site of ["www", "music"] as const) {
    const p = scriptedPage(), g = createGateway({ site, page: p.port }), values: unknown[] = []
    const stop = g.watch("nav", value => values.push(value))
    p.emit("navigation")
    expect(values).toEqual([{
      pageType: "WATCH", video: { videoId: syntheticVideo, title: "Synthetic video", length: 120, kind: "video" },
      navigation: { kind: "watch", videoId: syntheticVideo }
    }])
    p.values.navigation = rawNavigation("watch", syntheticNextVideo)
    p.values.location = { pathname: "/watch", search: `?v=${syntheticNextVideo}` }
    p.emit("navigation")
    expect(values).toEqual([
      { pageType: "WATCH", video: { videoId: syntheticVideo, title: "Synthetic video", length: 120, kind: "video" }, navigation: { kind: "watch", videoId: syntheticVideo } },
      { pageType: "WATCH", video: null, navigation: { kind: "watch", videoId: syntheticNextVideo } }
    ])
    stop(); expect(p.active()).toBe(0); g.dispose()
  }
})
