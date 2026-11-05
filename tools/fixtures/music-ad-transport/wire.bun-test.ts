import { afterEach, expect, test } from "bun:test"
import { rawMusicPlayer, rawQueueItem, rawSong } from "../../../src/page/gateway.specimens"
import { installRawPlayer, trackNativeEvents } from "../../../src/page/live-read.specimens"
import { readRoutes } from "../../../src/page/read-port"
import type { PageRead } from "../../../src/page/read-port"
import { isBuildId, isJobFailure, isJobResultFor, isMusicAdFailure, isPageRequestId, isStreamData } from "../../../src/shared/contracts"
import type { JsonValue, QueueItemId } from "../../../src/shared/contracts"
import { isPageJobResultFor, isPageRunAnswerFor } from "../../../src/shared/contracts/page"
import { musicFixture, flush } from "../items-music/harness"
import { firstVideo, secondVideo, row } from "../items-music/specimens"
import { adFailure, indicators, jobs } from "./cases"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})
async function fixture(dom: boolean, overrides: Partial<Record<PageRead, unknown>> = {}) {
  const h = await musicFixture(dom, overrides)
  cleanups.push(() => h.dispose())
  h.items.track(h.owner())
  return h
}

for (const dom of [false, true]) {
  for (const evidence of indicators) {
    test(`${dom ? "DOM" : "direct"} explicit ${evidence} crosses the complete wire without a route diagnosis`, async () => {
      const h = await fixture(dom),
        player = h.player()
      h.setMetadata({ title: "Song", artist: "Artist" })
      const values: unknown[] = []
      cleanups.push(h.link.watch("nowPlaying", value => values.push(value)))
      h.signals.length = 0
      if (evidence === "adShowing") player.root.classList.add("ad-showing")
      if (evidence === "adActive") player.root.dispatchEvent(new Event("onAdStart"))
      if (evidence === "presentingPlayerType") player.update({ ...rawMusicPlayer(), presentingPlayerType: 2 })
      player.root.dispatchEvent(new Event("onVideoDataChange"))
      expect(await h.link.run({ job: { kind: "nowPlaying" } })).toEqual(adFailure(evidence))
      expect(await h.items.resolve()).toEqual({ kind: "ad-playing", evidence })
      expect(h.answers.at(-1)).toMatchObject({ kind: "run", result: adFailure(evidence) })
      expect(h.signals.filter(signal => signal.job === "nowPlaying")).toEqual([])
      expect(values).toEqual([])
      expect(h.clock.count).toBe(0)
    })
  }

  test(`${dom ? "DOM" : "direct"} explicit ad with null metadata stays an ad and missing data stays diagnosed`, async () => {
    const h = await fixture(dom),
      player = h.player()
    h.setMetadata(null)
    player.root.classList.add("ad-showing")
    h.signals.length = 0
    expect(await h.items.resolve()).toEqual({ kind: "ad-playing", evidence: "adShowing" })
    expect(h.signals.filter(signal => signal.job === "nowPlaying")).toEqual([])
    h.setMetadata(undefined)
    expect(await h.items.resolve()).toEqual({ kind: "unavailable", failure: { ok: false, reason: "unavailable" } })
    expect(h.signals.some(signal => signal.job === "nowPlaying" && signal.kind === "missing")).toBe(true)
  })

  test(`${dom ? "DOM" : "direct"} ordinary failures never imply an ad and PageLink keeps its safe projection`, async () => {
    const h = await fixture(dom)
    for (const reason of ["unavailable", "unconfirmed", "failed", "signedOut"] as const) {
      h.transformResult(() => ({ ok: false, reason, http: 403, status: "Synthetic page text" }))
      expect(await h.link.run({ job: { kind: "nowPlaying" } })).toEqual({ ok: false, reason, http: 403 })
      expect(await h.items.resolve()).toEqual({ kind: "unavailable", failure: { ok: false, reason, http: 403 } })
    }
    h.transformResult(() => ({ ok: false, reason: "accountChanged", status: "Synthetic page text" }))
    expect(await h.link.run({ job: { kind: "nowPlaying" } })).toEqual({ ok: false, reason: "accountChanged" })
    expect(h.link.state.kind).toBe("accountChanged")
    expect(await h.items.resolve()).toMatchObject({ kind: "unavailable" })
  })

  test(`${dom ? "DOM" : "direct"} malformed wire detail is ignored until the ordinary deadline`, async () => {
    const h = await fixture(dom)
    const malformed: JsonValue[] = [
      { ...adFailure(), reason: "failed" },
      { ...adFailure(), http: 200 },
      { ...adFailure(), status: "ad" },
      { ...adFailure(), extra: true },
      { ...adFailure(), detail: { kind: "music-ad", evidence: "unknown" } },
      { ...adFailure(), detail: { kind: "music-ad", evidence: "adShowing", extra: true } },
      { ...adFailure(), detail: null },
      { ...adFailure(), detail: "adShowing" }
    ]
    for (const result of malformed) {
      h.transformResult(() => result)
      const pending = h.link.run({ job: { kind: "nowPlaying" } })
      await flush()
      h.clock.advance(10_000)
      expect(await pending).toEqual({ ok: false, reason: "unconfirmed" })
      expect(h.clock.count).toBe(0)
    }
    h.transformResult(() => adFailure())
    const pending = h.link.run({ job: { kind: "castState" } })
    await flush()
    h.clock.advance(10_000)
    expect(await pending).toEqual({ ok: false, reason: "unconfirmed" })
  })

  test(`${dom ? "DOM" : "direct"} ad answers recheck freshness and lifetime before producing an outcome`, async () => {
    const h = await fixture(dom),
      player = h.player()
    h.setMetadata({ title: "Song", artist: "Artist" })
    player.root.classList.add("ad-showing")
    h.delayAnswers()
    const pending = h.items.resolve()
    await flush()
    expect(h.heldAnswers).toBe(1)
    player.root.classList.remove("ad-showing")
    h.releaseAnswers()
    expect(await pending).toEqual({ kind: "stale-target", reason: "identity" })
    player.root.classList.add("ad-showing")
    h.delayAnswers()
    const disposed = h.items.resolve()
    await flush()
    h.items.dispose()
    h.releaseAnswers()
    expect(await disposed).toEqual({ kind: "stale-target", reason: "lifetime" })
  })

  test(`${dom ? "DOM" : "direct"} selected queue targets expose an ad without inventing queue success`, async () => {
    const h = await fixture(dom),
      player = h.player(),
      selected = row("ytmusic-player-queue-item", firstVideo, { selected: true, id: 7 })
    h.setQueue([selected.data])
    h.setMetadata(null)
    h.point(selected.button)
    player.root.classList.add("ad-showing")
    expect(await h.items.resolve("next")).toEqual({ kind: "ad-playing", evidence: "adShowing" })
    expect(await h.link.run({ job: { kind: "queueMove", id: 7 as QueueItemId, to: "end" } })).toEqual({ ok: false, reason: "unavailable" })
  })

  test(`${dom ? "DOM" : "direct"} selected queue ad answers recheck native target identity`, async () => {
    const h = await fixture(dom),
      player = h.player(),
      selected = row("ytmusic-player-queue-item", firstVideo, { selected: true, id: 7 })
    h.setQueue([selected.data])
    h.setMetadata(null)
    h.point(selected.button)
    player.root.classList.add("ad-showing")
    let held = false
    h.transformResult(result => {
      if (!held && isMusicAdFailure(result)) {
        held = true
        h.delayAnswers()
      }
      return result
    })
    const pending = h.items.resolve("next")
    await flush()
    expect(h.heldAnswers).toBe(1)
    selected.update({ ...rawSong(secondVideo), selected: true })
    h.releaseAnswers()
    expect(await pending).toEqual({ kind: "stale-target", reason: "identity" })
  })

  test(`${dom ? "DOM" : "direct"} replaced players and stale native callbacks cannot retain an ad`, async () => {
    const h = await musicFixture(dom)
    cleanups.push(() => h.dispose())
    const first = h.player(),
      retired = trackNativeEvents(first.root)
    cleanups.push(retired.restore)
    h.items.track(h.owner())
    expect(retired.active()).toBeGreaterThan(0)
    h.setMetadata({ title: "Song", artist: "Artist" })
    first.root.dispatchEvent(new Event("onAdStart"))
    expect(await h.items.resolve()).toEqual({ kind: "ad-playing", evidence: "adActive" })
    first.root.remove()
    const replacement = installRawPlayer(document, "movie_player", rawMusicPlayer()),
      events = trackNativeEvents(replacement.root)
    cleanups.push(events.restore)
    expect(await h.items.resolve()).toMatchObject({ kind: "current-song", song: { videoId: firstVideo } })
    expect(retired.active()).toBe(0)
    expect(events.active()).toBeGreaterThan(0)
    retired.stale("onAdStart", new Event("onAdStart"))
    expect(await h.items.resolve()).toMatchObject({ kind: "current-song" })
    replacement.root.dispatchEvent(new Event("onAdStart"))
    expect(await h.items.resolve()).toEqual({ kind: "ad-playing", evidence: "adActive" })
    replacement.video.replaceWith(document.createElement("video"))
    expect(await h.link.run({ job: { kind: "nowPlaying" } })).not.toHaveProperty("detail")
    h.items.dispose()
    expect(events.active()).toBe(0)
  })
}

test("all unrelated jobs refuse playback details and both result guards agree", () => {
  const build = "music-ad-census",
    id = "music:request:1"
  if (!isBuildId(build) || !isPageRequestId(id)) throw Error("Invalid synthetic envelope")
  for (const job of jobs) {
    for (const evidence of indicators) {
      const result = adFailure(evidence),
        expected = job.kind === "nowPlaying"
      expect(isJobResultFor(job, result)).toBe(expected)
      expect(isPageJobResultFor(job, result)).toBe(expected)
      expect(isPageRunAnswerFor({ id, job }, { v: 1, build, kind: "run", id, result }, build)).toBe(expected)
      expect(isJobFailure(result)).toBe(false)
    }
    for (const reason of ["signedOut", "accountChanged", "unavailable", "unconfirmed", "failed"] as const) {
      const failure = { ok: false, reason, http: 403, status: "Synthetic status" }
      expect(isJobResultFor(job, failure)).toBe(true)
      expect(isPageJobResultFor(job, failure)).toBe(true)
    }
  }
})

test("malformed and conflicting raw playback remains unavailable with route evidence", async () => {
  const badPlayers: unknown[] = [
    undefined,
    null,
    {},
    { adShowing: true },
    ...[
      { adShowing: "true" },
      { adActive: 1 },
      { presentingPlayerType: "2" },
      { presentingPlayerType: -1 },
      { presentingPlayerType: 2.5 },
      { presentingPlayerType: 999 },
      { adShowing: true, adActive: "true" },
      { adActive: true, presentingPlayerType: "2" },
      { adShowing: true, videoData: { video_id: "bad" } },
      { adShowing: true, video: {} },
      { adShowing: true, response: { videoDetails: { videoId: secondVideo } } }
    ].map(value => ({ ...rawMusicPlayer(), ...value }))
  ]
  for (const watchPlayer of badPlayers) {
    const h = await fixture(true, { watchPlayer, mediaMetadata: { title: "Song", artist: "Artist" }, musicQueue: [] })
    h.signals.length = 0
    expect(await h.items.resolve()).toEqual({ kind: "unavailable", failure: { ok: false, reason: "unavailable" } })
    expect(h.signals.some(signal => signal.job === "nowPlaying" && (signal.kind === "missing" || signal.kind === "unrecognised"))).toBe(true)
    h.dispose()
  }
  for (const overrides of [
    { mediaMetadata: undefined },
    { musicQueue: undefined },
    { mediaMetadata: { title: 3 } },
    { musicQueue: [rawQueueItem(secondVideo, 7, { selected: true })] },
    { musicQueue: [rawQueueItem(undefined, 7, { selected: true }), rawQueueItem(secondVideo, 8, { selected: true })] },
    { musicQueue: [rawQueueItem(undefined, 7, { selected: "true" })] }
  ]) {
    const h = await fixture(true, { watchPlayer: { ...rawMusicPlayer(), adShowing: true }, mediaMetadata: null, musicQueue: [], ...overrides })
    expect(await h.items.resolve()).toEqual({ kind: "unavailable", failure: { ok: false, reason: "unavailable" } })
    expect(h.signals.some(signal => signal.job === "nowPlaying")).toBe(true)
    h.dispose()
  }
})

test("success and stream schemas remain exact song or null", async () => {
  const h = await fixture(true)
  expect(await h.link.run({ job: { kind: "nowPlaying" } })).toEqual({ ok: true, route: readRoutes.nowPlaying, data: null })
  const player = h.player(),
    song = { videoId: firstVideo, title: "Song", artist: "Artist", pos: 12, len: 180 }
  h.setMetadata({ title: "Song", artist: "Artist" })
  const values: unknown[] = []
  cleanups.push(h.link.watch("nowPlaying", value => values.push(value)))
  for (const paused of [false, true]) {
    player.update({ ...rawMusicPlayer(), video: { ...rawMusicPlayer().video, paused } })
    player.root.dispatchEvent(new Event("onVideoDataChange"))
    expect(await h.link.run({ job: { kind: "nowPlaying" } })).toEqual<unknown>({ ok: true, route: readRoutes.nowPlaying, data: song })
    expect(values.at(-1)).toEqual(song)
  }
  expect(values.every(value => isStreamData("nowPlaying", value))).toBe(true)
  for (const data of [{ kind: "ad-playing", evidence: "adShowing" }, adFailure(), { ...song, ad: true }]) {
    expect(isStreamData("nowPlaying", data)).toBe(false)
    expect(isJobResultFor({ kind: "nowPlaying" }, { ok: true, route: readRoutes.nowPlaying, data })).toBe(false)
    expect(isPageJobResultFor({ kind: "nowPlaying" }, { ok: true, route: readRoutes.nowPlaying, data })).toBe(false)
  }
})
