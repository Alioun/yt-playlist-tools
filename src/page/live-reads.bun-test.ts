import { afterEach, expect, test } from "bun:test"
import { createGateway } from "./gateway"
import { wwwGateway } from "./gateway/www"
import { musicGateway } from "./gateway/music"
import { createLiveReadPort } from "./live-reads"
import { defineRaw, installRawPlayer, trackNativeEvents } from "./live-read.specimens"
import { rawNavigation, rawPlayer, rawQueueItem, rawSong, syntheticIdentity, syntheticNextVideo, syntheticVideo } from "./gateway.specimens"
import { readRoutes, readWatches } from "./read-port"

const siteGateways = { www: wwwGateway, music: musicGateway }

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })

function localPage(site: "www" | "music" = "www") {
  const doc = document.implementation.createHTMLDocument("Synthetic page")
  const oldUrl = window.location.href
  window.history.replaceState(null, "", `https://www.youtube.com/watch?v=${syntheticVideo}`)
  cleanups.push(() => window.history.replaceState(null, "", oldUrl))
  cleanups.push(defineRaw(window, "ytcfg", { get(key: string) { return key === "LOGGED_IN" ? true : key === "DATASYNC_ID" ? syntheticIdentity : undefined } }))
  let navigation: unknown = rawNavigation()
  const page = createLiveReadPort({ site, window, document: doc, bindings: { navigation: { read: () => navigation } } })
  cleanups.push(() => page.dispose())
  const gateway = createGateway({ site: siteGateways[site], page, now: () => 10 })
  cleanups.push(() => gateway.dispose())
  return { doc, page, gateway, setNavigation(value: unknown) { navigation = value } }
}

test("counting player beats an earlier inline preview and media position comes from the content API", () => {
  const h = localPage()
  const preview = installRawPlayer(h.doc, "inline-preview-player", rawPlayer(syntheticNextVideo, { currentTime: 99 }))
  const counting = installRawPlayer(h.doc)
  const values: unknown[] = []
  const stop = h.gateway.watch("player", value => values.push(value))
  preview.video.dispatchEvent(new Event("timeupdate"))
  expect(values).toEqual([])
  counting.video.dispatchEvent(new Event("timeupdate"))
  expect(values).toEqual([{
    ad: false, at: 10, player: "watch", videoId: syntheticVideo, pos: 15, len: 120, listedLength: 120, rate: 1.25,
    playing: true, seeking: false, content: "video", isPostLiveDvr: false, isLive: false, isUpcoming: false, isLiveContent: false
  }])
  expect(preview.calls).toEqual([])
  stop()
})

test("exact native listener counts stay shared and all release once on the last watcher", () => {
  const h = localPage(), player = installRawPlayer(h.doc)
  const docEvents = trackNativeEvents(h.doc), rootEvents = trackNativeEvents(player.root), videoEvents = trackNativeEvents(player.video)
  cleanups.push(docEvents.restore, rootEvents.restore, videoEvents.restore)
  expect(docEvents.active() + rootEvents.active() + videoEvents.active()).toBe(0)
  const a = h.gateway.watch("player", () => {}), b = h.gateway.watch("player", () => {})
  expect([docEvents.active(), rootEvents.active(), videoEvents.active()]).toEqual([2, 3, 9])
  expect(docEvents.records.filter(record => record.active).map(record => record.type)).toEqual(["yt-navigate-finish", "yt-player-updated"])
  a(); a()
  expect([docEvents.active(), rootEvents.active(), videoEvents.active()]).toEqual([2, 3, 9])
  b(); b()
  expect([docEvents.active(), rootEvents.active(), videoEvents.active()]).toEqual([0, 0, 0])
  expect([...docEvents.records, ...rootEvents.records, ...videoEvents.records].map(record => record.removals).every(count => count === 1)).toBe(true)
})

test("replacement counting players drop old listeners and stale callbacks publish nothing", () => {
  const h = localPage(), old = installRawPlayer(h.doc)
  const oldRoot = trackNativeEvents(old.root), oldVideo = trackNativeEvents(old.video)
  cleanups.push(oldRoot.restore, oldVideo.restore)
  const values: unknown[] = [], stop = h.gateway.watch("player", value => values.push(value))
  old.root.remove()
  const next = installRawPlayer(h.doc, "movie_player", rawPlayer(syntheticNextVideo))
  h.setNavigation(rawNavigation("watch", syntheticNextVideo))
  window.history.replaceState(null, "", `https://www.youtube.com/watch?v=${syntheticNextVideo}`)
  next.root.dispatchEvent(new CustomEvent("yt-player-updated", { bubbles: true }))
  expect(oldRoot.active() + oldVideo.active()).toBe(0)
  const atReplacement = values.length
  old.video.dispatchEvent(new Event("timeupdate"))
  oldVideo.stale("timeupdate", new Event("timeupdate"))
  oldRoot.stale("onVideoDataChange", new Event("onVideoDataChange"))
  expect(values.length).toBe(atReplacement)
  next.video.dispatchEvent(new Event("timeupdate"))
  expect(values.length).toBe(atReplacement + 1)
  const last = values.at(-1)
  expect(last).toEqual({
    ad: false, at: 10, player: "watch", videoId: syntheticNextVideo, pos: 15, len: 120, listedLength: 120, rate: 1.25,
    playing: true, seeking: false, content: "video", isPostLiveDvr: false, isLive: false, isUpcoming: false, isLiveContent: false
  })
  stop(); h.gateway.dispose()
  next.video.dispatchEvent(new Event("timeupdate"))
  expect(values.length).toBe(atReplacement + 1)
})

test("the raw event cache exists only while navigation is watched and nav streams own no timeupdate listener", () => {
  const doc = document.implementation.createHTMLDocument("Synthetic navigation"), player = installRawPlayer(doc)
  const page = createLiveReadPort({ site: "www", window, document: doc }), gateway = createGateway({ site: wwwGateway, page })
  const tracked = trackNativeEvents(player.video)
  cleanups.push(tracked.restore, () => page.dispose(), () => gateway.dispose())
  const values: unknown[] = [], stop = gateway.watch("nav", value => values.push(value))
  expect(tracked.active()).toBe(0)
  doc.dispatchEvent(new CustomEvent("yt-navigate-finish", { detail: rawNavigation(), bubbles: true }))
  expect(values).toHaveLength(1)
  expect(values[0]).toHaveProperty("navigation", { kind: "watch", videoId: syntheticVideo })
  expect(page.has(readWatches.navigation)).toBe(true)
  stop()
  expect(page.has(readWatches.navigation)).toBe(false)
})

test("ad classes and native ad events suppress content API reads and resume after onAdEnd", () => {
  const h = localPage(), player = installRawPlayer(h.doc), values: unknown[] = []
  h.gateway.watch("player", value => values.push(value))
  player.root.classList.add("ad-showing")
  player.video.dispatchEvent(new Event("timeupdate"))
  expect(values).toEqual([{ ad: true, at: 10, player: "watch" }])
  expect(player.calls).toEqual([])
  player.root.classList.remove("ad-showing")
  player.root.dispatchEvent(new Event("onAdStart"))
  player.video.dispatchEvent(new Event("timeupdate"))
  expect(values).toEqual(Array.from({ length: 3 }, () => ({ ad: true, at: 10, player: "watch" })))
  expect(player.calls).toEqual([])
  player.root.dispatchEvent(new Event("onAdEnd"))
  expect(values.at(-1)).toHaveProperty("ad", false)
})

test("live targeted row data comes from the closest actual renderer and sets no attributes", async () => {
  const h = localPage("music"), row = h.doc.createElement("ytmusic-responsive-list-item-renderer"), button = h.doc.createElement("button")
  row.append(button); h.doc.body.append(row)
  defineRaw(row, "data", rawSong())
  expect((await h.gateway.run({ kind: "itemInfo" }, { target: button }))).toHaveProperty("ok", true)
  expect(row.attributes.length + button.attributes.length).toBe(0)
  const unrelated = h.doc.createElement("div")
  defineRaw(unrelated, "data", rawSong())
  expect(await h.gateway.run({ kind: "itemInfo" }, { target: unrelated })).toEqual({ ok: false, reason: "unavailable" })
})

test("Music live metadata and explicit raw state bindings work without a player bar", async () => {
  const doc = document.implementation.createHTMLDocument("Synthetic Music"), player = installRawPlayer(doc)
  player.update(rawPlayer(syntheticVideo, { video: { currentTime: 12, duration: 180, playbackRate: 1, paused: false, seeking: false } }))
  const app = doc.createElement("ytmusic-app")
  defineRaw(app, "queue", { getItems: () => [] }); doc.body.append(app)
  cleanups.push(defineRaw(window.navigator, "mediaSession", { metadata: { title: "Song", artist: "Artist", artwork: [] } }))
  const page = createLiveReadPort({ site: "music", window, document: doc, bindings: {
    musicState: { read: () => { throw new Error(syntheticIdentity) } }, castPlayer: { read: () => false }
  } })
  const gateway = createGateway({ site: musicGateway, page })
  cleanups.push(() => page.dispose(), () => gateway.dispose())
  expect(await gateway.run({ kind: "nowPlaying" })).toEqual<unknown>({ ok: true, route: readRoutes.nowPlaying, data: { videoId: syntheticVideo, title: "Song", artist: "Artist", pos: 12, len: 180 } })
  expect(await gateway.run({ kind: "castState" })).toEqual({ ok: true, route: readRoutes.castState, data: { casting: false } })
  expect(doc.querySelector("ytmusic-player-bar")).toBe(null)
})

test("Music notifications have one owned binding, with exact release and no stale delivery", () => {
  const doc = document.implementation.createHTMLDocument("Synthetic Music queue"), app = doc.createElement("ytmusic-app")
  defineRaw(app, "queue", { getItems: () => [rawQueueItem()] }); doc.body.append(app)
  let rawChanged: (() => void) | undefined, starts = 0, stops = 0
  const page = createLiveReadPort({ site: "music", window, document: doc, bindings: { queueChanges: {
    onChange(changed) { starts++; rawChanged = changed; return () => { stops++ } }
  } } })
  const gateway = createGateway({ site: musicGateway, page }), values: unknown[] = []
  cleanups.push(() => page.dispose(), () => gateway.dispose())
  const a = gateway.watch("queue", value => values.push(value)), b = gateway.watch("queue", () => {})
  expect([starts, stops]).toEqual([1, 0])
  rawChanged?.(); expect(values).toEqual([{ ids: [7] }])
  a(); b(); expect([starts, stops]).toEqual([1, 1])
  rawChanged?.(); expect(values).toEqual([{ ids: [7] }])
  gateway.dispose(); page.dispose(); expect(stops).toBe(1)
})

test("an ad event survives media listener release and reacquisition while nav remains watched", () => {
  const h = localPage(), player = installRawPlayer(h.doc)
  const stopNav = h.gateway.watch("nav", () => {})
  const stopPlayer = h.gateway.watch("player", () => {})
  player.root.dispatchEvent(new Event("onAdStart"))
  stopPlayer()
  const values: unknown[] = []
  const stopAgain = h.gateway.watch("player", value => values.push(value))
  player.calls.length = 0
  player.video.dispatchEvent(new Event("timeupdate"))
  expect(values).toEqual([{ ad: true, at: 10, player: "watch" }])
  expect(player.calls).toEqual([])
  player.root.dispatchEvent(new Event("onAdEnd"))
  expect(values.at(-1)).toHaveProperty("ad", false)
  stopAgain(); stopNav()
})

test("automix membership follows the actual nested target when a queue row moves", async () => {
  const h = localPage("music"), automix = h.doc.createElement("div")
  automix.id = "automix-contents"
  const row = h.doc.createElement("ytmusic-player-queue-item"), button = h.doc.createElement("button")
  defineRaw(row, "data", rawSong())
  row.append(button); automix.append(row); h.doc.body.append(automix)
  const inside = await h.gateway.run({ kind: "itemInfo" }, { target: button })
  expect(inside).toHaveProperty("data.autoplay", true)
  h.doc.body.append(row)
  const outside = await h.gateway.run({ kind: "itemInfo" }, { target: button })
  expect(outside).toEqual<unknown>(inside.ok ? { ...inside, data: { ...inside.data, autoplay: false } } : undefined)
  expect(row.attributes.length + button.attributes.length).toBe(0)
})

test("an old inner video cannot publish before or after its counting root reports replacement", () => {
  const h = localPage(), counting = installRawPlayer(h.doc)
  const oldEvents = trackNativeEvents(counting.video)
  cleanups.push(oldEvents.restore)
  const values: unknown[] = [], stop = h.gateway.watch("player", value => values.push(value))
  const next = installRawPlayer(h.doc, "synthetic-replacement-holder", rawPlayer(syntheticNextVideo))
  counting.video.replaceWith(next.video)
  next.root.remove()
  counting.update(rawPlayer(syntheticNextVideo))
  h.setNavigation(rawNavigation("watch", syntheticNextVideo))
  window.history.replaceState(null, "", `https://www.youtube.com/watch?v=${syntheticNextVideo}`)
  counting.video.dispatchEvent(new Event("timeupdate"))
  expect(values).toEqual([])
  counting.root.dispatchEvent(new Event("onVideoDataChange"))
  expect(oldEvents.active()).toBe(0)
  const afterIdentity = values.length
  next.video.dispatchEvent(new Event("timeupdate"))
  expect(values.length).toBe(afterIdentity + 1)
  expect(values.at(-1)).toHaveProperty("videoId", syntheticNextVideo)
  oldEvents.stale("timeupdate", new Event("timeupdate"))
  expect(values.length).toBe(afterIdentity + 1)
  stop()
})
