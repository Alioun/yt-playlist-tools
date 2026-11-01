import { afterEach, expect, test } from "bun:test"
import { rawMusicPlayer, rawSong } from "../../../src/page/gateway.specimens"
import { parseNowPlaying } from "../../../src/page/read-parsers"
import { readRoutes } from "../../../src/page/read-port"
import type { PageRead } from "../../../src/page/read-port"
import { installRawPlayer, trackNativeEvents } from "../../../src/page/live-read.specimens"
import { isJobResultFor, isStreamData } from "../../../src/shared/contracts"
import { isPageJobResultFor, isPageRunAnswerFor } from "../../../src/shared/contracts/page"
import { isBuildId, isPageRequestId } from "../../../src/shared/contracts"
import { musicFixture } from "./harness"
import { firstVideo, secondVideo } from "./specimens"

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })
async function fixture(dom = false, overrides: Partial<Record<PageRead, unknown>> = {}) {
  const value = await musicFixture(dom, overrides); cleanups.push(() => value.dispose()); return value
}

for (const dom of [false, true]) {
  test(`${dom ? "DOM" : "direct"} actual gateway and PageLink preserve song and null goldens`, async () => {
    const h = await fixture(dom); h.items.track(h.owner())
    expect(await h.link.run({ job: { kind: "nowPlaying" } })).toEqual({ ok: true, route: readRoutes.nowPlaying, data: null })
    const player = h.player(); h.setMetadata({ title: "Synthetic song", artist: "Synthetic artist", album: "Synthetic album",
      artwork: [{ src: "https://synthetic.invalid/small", sizes: "96x96" }, { src: "https://synthetic.invalid/large", sizes: "512x512" }] })
    expect(document.querySelector("ytmusic-player-bar")).toBeNull()
    const golden = { ok: true, route: readRoutes.nowPlaying, data: { videoId: firstVideo, title: "Synthetic song", artist: "Synthetic artist",
      album: "Synthetic album", artwork: "https://synthetic.invalid/large", pos: 12, len: 180 } }
    expect(await h.link.run({ job: { kind: "nowPlaying" } })).toEqual<unknown>(golden)
    player.update({ ...rawMusicPlayer(), video: { currentTime: 12, duration: 180, playbackRate: 1, paused: true, seeking: false } })
    expect(await h.link.run({ job: { kind: "nowPlaying" } })).toEqual<unknown>(golden)
    expect(await h.items.resolve()).toMatchObject({ kind: "current-song", song: golden.data })
  })

  test(`${dom ? "DOM" : "direct"} selected queue fallback preserves exact song data and refuses conflicting IDs`, async () => {
    const h = await fixture(dom); h.items.track(h.owner()); h.player(); h.setMetadata(null)
    h.setQueue([{ ...rawSong(), selected: true, longBylineText: { runs: [{ text: "Fallback artist" }] } }])
    expect(await h.link.run({ job: { kind: "nowPlaying" } })).toEqual<unknown>({ ok: true, route: readRoutes.nowPlaying,
      data: { videoId: firstVideo, title: "Synthetic song", artist: "Fallback artist", pos: 12, len: 180 } })
    h.setQueue([{ ...rawSong(secondVideo), selected: true, longBylineText: "Fallback artist" }])
    expect(await h.items.resolve()).toMatchObject({ kind: "unavailable" })
    h.setQueue([{ ...rawSong(), selected: true }, { ...rawSong(secondVideo, 8), selected: true }])
    expect(await h.items.resolve()).toMatchObject({ kind: "unavailable" })
  })

  test(`${dom ? "DOM" : "direct"} positive ad evidence never becomes a null stream or a song`, async () => {
    const h = await fixture(dom); h.items.track(h.owner()); const player = h.player()
    h.setMetadata({ title: "Song", artist: "Artist", artwork: [] })
    const stream: unknown[] = [], stop = h.link.watch("nowPlaying", data => stream.push(data))
    cleanups.push(stop)
    const before = stream.length
    player.root.classList.add("ad-showing"); player.root.dispatchEvent(new Event("onAdStart"))
    expect(await h.link.run({ job: { kind: "nowPlaying" } })).toMatchObject({ ok: false, reason: "unavailable" })
    expect(stream.slice(before)).toEqual([])
    player.root.classList.remove("ad-showing"); player.root.dispatchEvent(new Event("onAdEnd"))
    expect(stream.at(-1)).toMatchObject({ videoId: firstVideo })
  })

  for (const indicator of ["adShowing", "adActive", "presentingPlayerType"] satisfies ("adShowing" | "adActive" | "presentingPlayerType")[]) {
    test(`${dom ? "DOM" : "direct"} required distinct ad outcome for ${indicator}`, async () => {
      const h = await fixture(dom); h.items.track(h.owner()); const player = h.player()
      h.setMetadata({ title: "Song", artist: "Artist" })
      if (indicator === "adShowing") player.root.classList.add("ad-showing")
      if (indicator === "adActive") player.root.dispatchEvent(new Event("onAdStart"))
      if (indicator === "presentingPlayerType") player.update({ ...rawMusicPlayer(), presentingPlayerType: 2 })
      expect(await h.items.resolve()).toEqual({ kind: "ad-playing", evidence: indicator })
    })
  }
}

test("malformed ad flags and generic missing data remain unavailable through real serialization", async () => {
  for (const malformed of [{ adShowing: "true" }, { adActive: 1 }, { presentingPlayerType: "2" }, { presentingPlayerType: -1 }, { presentingPlayerType: 2.5 }]) {
    const h = await fixture(true, { watchPlayer: { ...rawMusicPlayer(), ...malformed }, mediaMetadata: { title: "Song", artist: "Artist" }, musicQueue: [] })
    h.items.track(h.owner())
    expect(await h.items.resolve()).toEqual({ kind: "unavailable", failure: { ok: false, reason: "unavailable" } })
    h.dispose()
  }
  const h = await fixture(true, { watchPlayer: undefined, musicQueue: undefined, mediaMetadata: undefined })
  h.items.track(h.owner())
  expect(await h.items.resolve()).toMatchObject({ kind: "unavailable" })
})

test("native ad listener state cannot cross player replacement and every listener is owned", async () => {
  const h = await fixture(), first = h.player(), oldEvents = trackNativeEvents(first.root)
  cleanups.push(oldEvents.restore)
  h.items.track(h.owner()); h.setMetadata({ title: "Song", artist: "Artist" })
  first.root.dispatchEvent(new Event("onAdStart"))
  expect(await h.link.run({ job: { kind: "nowPlaying" } })).toMatchObject({ ok: false, reason: "unavailable" })
  first.root.remove()
  const second = installRawPlayer(document, "movie_player", rawMusicPlayer()), newEvents = trackNativeEvents(second.root)
  cleanups.push(newEvents.restore)
  expect(await h.link.run({ job: { kind: "nowPlaying" } })).toHaveProperty("data.videoId", firstVideo)
  expect(oldEvents.active()).toBe(0)
  expect(newEvents.active()).toBeGreaterThan(0)
  oldEvents.stale("onAdStart", new Event("onAdStart"))
  expect(await h.items.resolve()).toMatchObject({ kind: "current-song" })
  h.items.dispose()
  expect(newEvents.active()).toBe(0)
})

test("current reader reconciles replacement even before any native identity notification", async () => {
  const h = await fixture(), first = h.player(); h.items.track(h.owner())
  h.setMetadata({ title: "Song", artist: "Artist" }); first.root.dispatchEvent(new Event("onAdStart"))
  first.root.id = "retired-player"
  const second = first.root.cloneNode(true)
  if (!(second instanceof HTMLElement)) throw Error("Expected synthetic player")
  second.id = "movie_player"
  Object.defineProperties(second, { getVideoData: { value: () => ({ video_id: firstVideo }) }, getPlayerResponse: { value: () => ({}) }, getPresentingPlayerType: { value: () => 1 } })
  document.body.append(second)
  expect(h.page.read("watchPlayer")).toHaveProperty("adActive", false)
})

test("ordinary failure shapes remain valid and playback detail cannot enter an unrelated job", () => {
  for (const failure of [{ ok: false, reason: "unavailable" }, { ok: false, reason: "failed", http: 403, status: "DENIED" }]) {
    expect(isJobResultFor({ kind: "nowPlaying" }, failure)).toBe(true)
    expect(isPageJobResultFor({ kind: "itemInfo" }, failure)).toBe(true)
  }
  const detail = { ok: false, reason: "unavailable", detail: { kind: "music-ad", evidence: "adShowing" } }
  expect(isJobResultFor({ kind: "itemInfo" }, detail)).toBe(false)
  expect(isPageJobResultFor({ kind: "account" }, detail)).toBe(false)
  expect(isStreamData("nowPlaying", { kind: "ad-playing" })).toBe(false)
  for (const malformed of [{ ...detail, reason: "failed" }, { ...detail, http: 403 }, { ...detail, status: "ad" },
    { ...detail, extra: true }, { ...detail, detail: { kind: "music-ad", evidence: "unknown" } },
    { ...detail, detail: { kind: "music-ad", evidence: "adShowing", extra: true } }]) {
    expect(isJobResultFor({ kind: "nowPlaying" }, malformed)).toBe(false)
  }
})

test("required job-aware playback failure survives page guards", () => {
  const build = "music-obligation", id = "music:request:1"
  if (!isBuildId(build) || !isPageRequestId(id)) throw Error("Invalid synthetic envelope")
  const result = { ok: false, reason: "unavailable", detail: { kind: "music-ad", evidence: "adShowing" } }
  expect(isJobResultFor({ kind: "nowPlaying" }, result)).toBe(true)
  expect(isPageJobResultFor({ kind: "nowPlaying" }, result)).toBe(true)
  expect(isPageRunAnswerFor({ id, job: { kind: "nowPlaying" } }, { v: 1, build, kind: "run", id, result }, build)).toBe(true)
})

test("malformed ad flags cannot produce a successful parser song", () => {
  expect(parseNowPlaying({ player: { ...rawMusicPlayer(), adShowing: "yes" }, metadata: { title: "Song", artist: "Artist" }, queue: [] })).toBeUndefined()
})

test("replacing a video node or releasing media ownership clears event-only ad state", async () => {
  const h = await fixture(), player = h.player()
  const release = h.items.track(h.owner())
  player.root.dispatchEvent(new Event("onAdStart"))
  expect(h.page.read("watchPlayer")).toHaveProperty("adActive", true)
  player.video.replaceWith(document.createElement("video"))
  expect(h.page.read("watchPlayer")).toHaveProperty("adActive", false)
  player.root.dispatchEvent(new Event("onAdStart"))
  expect(h.page.read("watchPlayer")).toHaveProperty("adActive", true)
  release()
  h.items.track(h.owner())
  expect(h.page.read("watchPlayer")).toHaveProperty("adActive", false)
})
