import { afterEach, expect, test } from "bun:test"
import { createLiveReadPort } from "../../../src/page/live-reads"
import { createGateway } from "../../../src/page/gateway"
import { wwwGateway } from "../../../src/page/gateway/www"
import { musicGateway } from "../../../src/page/gateway/music"
import { defineRaw } from "../../../src/page/live-read.specimens"
import { rawSong } from "../../../src/page/gateway.specimens"
import { parseTargetVideo } from "../../../src/page/read-parsers"
import { readRoutes, readWatches } from "../../../src/page/read-port"
import { firstVideo, secondVideo, shortVideo, legacyData, lockupData, shortsData } from "./specimens"

const siteGateways = { www: wwwGateway, music: musicGateway }

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })
function pageFixture(site: "www" | "music" = "www") {
  const doc = document.implementation.createHTMLDocument("Explicitly synthetic renderer data")
  const page = createLiveReadPort({ site, document: doc, window })
  const gateway = createGateway({ site: siteGateways[site], page, now: () => 0 })
  cleanups.push(() => gateway.dispose(), () => page.dispose())
  function target(tag: string, key: string, raw: unknown) {
    const element = doc.createElement(tag), button = doc.createElement("button")
    element.append(button); doc.body.append(element)
    defineRaw(element, key, raw)
    return { element, button }
  }
  return { doc, page, gateway, target }
}

test("synthetic modern lockup admits validated metadata and command identity", async () => {
  const h = pageFixture()
  for (const key of ["data", "lockupViewModel"]) {
    const row = h.target("yt-lockup-view-model", key, lockupData())
    expect(h.page.has(readWatches.targetData)).toBe(true)
    expect(await h.gateway.run({ kind: "videoInfo" }, { target: row.button })).toEqual<unknown>({ ok: true, route: readRoutes.videoInfo,
      data: { videoId: secondVideo, title: "Synthetic lockup", length: null, kind: "video" } })
    expect(row.element.attributes.length + row.button.attributes.length).toBe(0)
    row.element.remove()
  }
  const wrapped = h.target("yt-lockup-view-model", "data", { lockupViewModel: lockupData() })
  expect(await h.gateway.run({ kind: "videoInfo" }, { target: wrapped.button })).toHaveProperty("data.videoId", secondVideo)
})

test("synthetic Shorts data preserves the short kind", async () => {
  const h = pageFixture()
  for (const key of ["data", "shortsLockupViewModel"]) {
    const row = h.target("ytm-shorts-lockup-view-model", key, shortsData())
    expect(await h.gateway.run({ kind: "videoInfo" }, { target: row.button })).toEqual<unknown>({ ok: true, route: readRoutes.videoInfo,
      data: { videoId: shortVideo, title: "Synthetic Short", length: null, kind: "short" } })
    row.element.remove()
  }
})

test("legacy target paths and playlist rows keep the successful VideoInfo contract", async () => {
  const h = pageFixture()
  for (const tag of ["ytd-video-renderer", "ytd-rich-grid-media", "ytd-grid-video-renderer", "ytd-compact-video-renderer", "ytd-playlist-panel-video-renderer", "ytd-playlist-video-renderer"]) {
    const row = h.target(tag, "data", legacyData())
    expect(await h.gateway.run({ kind: "videoInfo" }, { target: row.button })).toEqual<unknown>({ ok: true, route: readRoutes.videoInfo,
      data: { videoId: firstVideo, title: "Synthetic legacy", length: 120, kind: "video" } })
    row.element.remove()
  }
})

test("invalid modern variants and ambiguous identities fail closed", async () => {
  const h = pageFixture(), valid = lockupData()
  const variants: unknown[] = [
    { ...valid, contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST" },
    { ...valid, contentType: "LOCKUP_CONTENT_TYPE_CHANNEL" },
    { ...valid, contentType: null },
    { ...valid, contentId: "bad" },
    { ...valid, contentId: firstVideo },
    { ...valid, videoId: firstVideo },
    { ...valid, isAd: true },
    { ...valid, isAd: "false" },
    { ...valid, adClientParams: {} },
    { ...valid, metadata: { lockupMetadataViewModel: { title: { content: "" } } } },
    { ...valid, metadata: { lockupMetadataViewModel: { title: { content: 42 } } } },
    { ...valid, rendererContext: {} },
    { ...valid, rendererContext: { commandContext: { onTap: { innertubeCommand: { watchEndpoint: { videoId: firstVideo } } } } } },
    { ...valid, rendererContext: { commandContext: { onTap: { innertubeCommand: { watchEndpoint: { videoId: secondVideo }, reelWatchEndpoint: { videoId: secondVideo } } } } } },
    { ...valid, navigationEndpoint: { browseEndpoint: { browseId: "UCsynthetic" } } },
    { ...valid, navigationEndpoint: { watchEndpoint: { videoId: firstVideo } } },
    { ...valid, lengthSeconds: -1 },
    { videoId: secondVideo, title: "Legacy data on a modern renderer" }
  ]
  for (const raw of variants) {
    const row = h.target("yt-lockup-view-model", "data", raw)
    expect(await h.gateway.run({ kind: "videoInfo" }, { target: row.button })).toEqual({ ok: false, reason: "unavailable" })
    row.element.remove()
  }
})

test("Shorts admission rejects malformed commands and playlist or ad masquerades", async () => {
  const h = pageFixture(), valid = shortsData()
  for (const raw of [
    { ...valid, onTap: { innertubeCommand: { watchEndpoint: { videoId: shortVideo } } } },
    { ...valid, onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: shortVideo, adClientParams: { isAd: true } } } } },
    { ...valid, onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: shortVideo }, browseEndpoint: {} } } },
    { ...valid, onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: "bad" } } } },
    { ...valid, contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST" },
    { ...valid, contentId: firstVideo },
    { ...valid, overlayMetadata: { primaryText: { content: null } } },
    { ...valid, metadata: { lockupMetadataViewModel: { title: { content: "Ambiguous" } } } }
  ]) {
    const row = h.target("ytm-shorts-lockup-view-model", "data", raw)
    expect(await h.gateway.run({ kind: "videoInfo" }, { target: row.button })).toEqual({ ok: false, reason: "unavailable" })
    row.element.remove()
  }
})

test("modern properties do not silently choose between conflicting sources or renderer kinds", async () => {
  const h = pageFixture()
  const row = h.target("yt-lockup-view-model", "data", lockupData())
  defineRaw(row.element, "lockupViewModel", lockupData(firstVideo))
  expect(h.page.read("targetData", row.button)).toBeUndefined()
  const mixed = h.target("yt-lockup-view-model", "data", { lockupViewModel: lockupData(), contentId: firstVideo })
  expect(h.page.read("targetData", mixed.button)).toBeUndefined()
  const wrongFamily = h.target("ytm-shorts-lockup-view-model", "data", lockupData())
  expect(h.page.read("targetData", wrongFamily.button)).toBeUndefined()
  const twoWrappers = h.target("yt-lockup-view-model", "data", { lockupViewModel: lockupData(), shortsLockupViewModel: shortsData() })
  expect(h.page.read("targetData", twoWrappers.button)).toBeUndefined()
  const ad = h.doc.createElement("ytd-ad-slot-renderer")
  const advertised = h.target("yt-lockup-view-model", "data", lockupData())
  ad.append(advertised.element); h.doc.body.append(ad)
  expect(h.page.read("targetData", advertised.button)).toBeUndefined()
  const detached = h.target("yt-lockup-view-model", "data", lockupData())
  detached.element.remove()
  expect(h.page.read("targetData", detached.button)).toBeUndefined()
})

test("legacy conflicting video IDs and unsupported endpoints fail closed", () => {
  expect(parseTargetVideo({ ...legacyData(), navigationEndpoint: { watchEndpoint: { videoId: secondVideo } } })).toBeUndefined()
  expect(parseTargetVideo({ ...legacyData(), navigationEndpoint: { browseEndpoint: {} } })).toBeUndefined()
  expect(parseTargetVideo({ ...legacyData(), navigationEndpoint: { watchEndpoint: { videoId: firstVideo }, watchPlaylistEndpoint: {} } })).toBeUndefined()
  expect(parseTargetVideo({ ...legacyData(), navigationEndpoint: { watchEndpoint: { videoId: firstVideo }, reelWatchEndpoint: { videoId: firstVideo } } })).toBeUndefined()
})

test("Music itemInfo keeps exact legacy endpoints, queue identity and selection", async () => {
  const h = pageFixture("music")
  for (const tag of ["ytmusic-responsive-list-item-renderer", "ytmusic-two-row-item-renderer", "ytmusic-player-queue-item", "ytmusic-responsive-header-renderer"]) {
    const row = h.target(tag, "data", rawSong())
    expect(await h.gateway.run({ kind: "itemInfo" }, { target: row.button })).toEqual<unknown>({ ok: true, route: readRoutes.itemInfo, data: {
      kind: "song", type: { kind: "music-video", musicVideoType: "MUSIC_VIDEO_TYPE_ATV" }, title: "Synthetic song",
      videoId: firstVideo, queueItemId: 7, selected: false, autoplay: false, hasOwnLike: true, likeState: "not-liked",
      endpoints: {
        end: { queueAddEndpoint: { queueTarget: { videoId: firstVideo }, queueInsertPosition: "INSERT_AT_END" } },
        save: { addToPlaylistEndpoint: { videoId: firstVideo } },
        next: { queueAddEndpoint: { queueTarget: { videoId: firstVideo }, queueInsertPosition: "INSERT_AFTER_CURRENT_VIDEO" } }
      }
    } })
    row.element.remove()
  }
  const modern = h.target("yt-lockup-view-model", "data", lockupData())
  expect(h.page.read("targetData", modern.button)).toBeUndefined()
})
