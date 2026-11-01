import { afterEach, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { defineRaw, trackNativeEvents } from "../../page/live-read.specimens"
import { rawNavigation, rawPlayer } from "../../page/gateway.specimens"
import { recogniseWwwItem } from "./items-www"
import { focusVisibility, move } from "../../../tools/fixtures/pointer-keys/harness"
import { flush, itemsFixture } from "../../../tools/fixtures/items-www/harness"
import { card, firstVideo, secondVideo, shortVideo, unknownCard, playlist } from "../../../tools/fixtures/items-www/specimens"
import { runItemsConsumer } from "../../../tools/fixtures/items-www/run"

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })
async function fixture(dom = false) {
  const h = await itemsFixture(dom)
  cleanups.push(() => h.dispose())
  return h
}

test("every required www card family resolves its actual target through the serialized gateway", async () => {
  const h = await fixture(true)
  h.items.track(h.owner())
  for (const [tag, family, videoId, kind] of [
    ["yt-lockup-view-model", "lockup", secondVideo, "video"],
    ["ytd-video-renderer", "video", firstVideo, "video"],
    ["ytd-rich-grid-media", "rich-grid", firstVideo, "video"],
    ["ytd-grid-video-renderer", "grid", firstVideo, "video"],
    ["ytd-compact-video-renderer", "compact", firstVideo, "video"],
    ["ytd-playlist-panel-video-renderer", "playlist-panel", firstVideo, "video"],
    ["ytd-playlist-video-renderer", "playlist-row", firstVideo, "video"],
    ["ytm-shorts-lockup-view-model", "shorts", shortVideo, "short"]
  ] satisfies [string, string, string, string][]) {
    const row = card(tag, videoId)
    h.point(row.button)
    const result = await h.items.resolve()
    expect(result.kind).toBe("pointed-item")
    if (result.kind !== "pointed-item") throw Error(`Missing ${tag}`)
    expect(result.target.element).toBe(row.element)
    expect(result.target.family).toBe<unknown>(family)
    expect(result.video).toMatchObject({ videoId, kind })
    expect(h.reads.at(-1)?.target).toBe(row.element)
    row.element.remove()
  }
  expect(h.errors).toEqual([])
})

test("unsupported cards block current-video fallback", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  h.player(); h.navigate(rawNavigation(), `/watch?v=${firstVideo}`)
  for (const [markup, reason] of [
    ["<yt-lockup-view-model><a href='/playlist?list=PLsynthetic'>List</a></yt-lockup-view-model>", "playlist"],
    ["<yt-lockup-view-model><a href='/playlist?list=RDsynthetic'>Mix</a></yt-lockup-view-model>", "mix"],
    ["<yt-lockup-view-model><yt-collection-thumbnail-view-model></yt-collection-thumbnail-view-model><a href='/watch?v=synthetic01'>List</a></yt-lockup-view-model>", "playlist"],
    ["<yt-lockup-view-model><span aria-label='Play all'></span><a href='/watch?v=synthetic01'>List</a></yt-lockup-view-model>", "playlist"],
    ["<ytd-radio-renderer><a href='/watch?v=synthetic01'>Mix</a></ytd-radio-renderer>", "mix"],
    ["<ytd-channel-renderer><button>Channel</button></ytd-channel-renderer>", "channel"],
    ["<yt-lockup-view-model><a href='/@synthetic'>Channel</a></yt-lockup-view-model>", "channel"],
    ["<ytd-backstage-post-renderer><button>Post</button></ytd-backstage-post-renderer>", "post"],
    ["<yt-lockup-view-model><a href='/post/synthetic'>Post</a></yt-lockup-view-model>", "post"],
    ["<ytd-ad-slot-renderer><ytd-video-renderer><a href='/watch?v=synthetic01'>Ad</a></ytd-video-renderer></ytd-ad-slot-renderer>", "ad"],
    ["<ytd-in-feed-ad-layout-renderer><button>Ad</button></ytd-in-feed-ad-layout-renderer>", "ad"]
  ]) {
    if (!markup || !reason) throw Error("Invalid unsupported specimen")
    const host = document.createElement("section")
    host.innerHTML = markup
    document.body.append(host)
    const hit = host.querySelector("button, a")
    if (!hit) throw Error("Missing synthetic hit")
    h.point(hit)
    const before = h.reads.length
    expect(await h.items.resolve()).toMatchObject({ kind: "unsupported-item", reason })
    expect(h.reads.length).toBe(before)
    host.remove()
  }
})

test("failed independent recognition blocks fallback and reports item-unrecognised", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  h.player(); h.navigate(rawNavigation(), `/watch?v=${firstVideo}`)
  const unknown = unknownCard()
  h.point(unknown.button)
  expect(await h.items.resolve()).toEqual({ kind: "unrecognised-item", element: unknown.button })
  expect(h.failures).toEqual([{ kind: "item-unrecognised", site: "www", source: "pointer", element: unknown.button }])
  expect(h.reads).toEqual([])
  h.point(unknown.anchor)
  expect(await h.items.resolve()).toHaveProperty("kind", "unrecognised-item")
  expect(h.failures).toHaveLength(2)
})

test("an unrelated element does not inherit the entire page's one video", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  const main = document.createElement("main"), ordinary = document.createElement("p")
  ordinary.textContent = "Ordinary content"
  main.append(ordinary); document.body.append(main)
  card("ytd-video-renderer", firstVideo, main)
  h.point(ordinary)
  expect(await h.items.resolve()).toMatchObject({ kind: "current-unavailable", failure: { ok: false, reason: "unavailable" } })
  expect(h.failures).toEqual([])
  expect(h.reads).toEqual([{ job: "videoInfo", target: undefined }])
})

test("player contents and end-screen tiles use the current video before nested cards", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  const player = h.player()
  h.navigate(rawNavigation(), `/watch?v=${firstVideo}`)
  const tile = card("ytd-video-renderer", secondVideo, player.root)
  h.point(tile.anchor)
  expect(await h.items.resolve()).toMatchObject({ kind: "current-video", video: { videoId: firstVideo } })
  expect(h.reads.at(-1)?.target).toBeUndefined()
})

test("search preview hit order resolves the covered result", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  const row = card()
  const preview = document.createElement("ytd-video-preview")
  preview.innerHTML = "<div id='inline-preview-player'><button>Preview</button></div>"
  document.body.append(preview)
  const hit = preview.querySelector("button")
  if (!hit) throw Error("Missing preview hit")
  h.point(hit, [row.button, row.element, document.body])
  expect(await h.items.resolve()).toMatchObject({ kind: "pointed-item", video: { videoId: firstVideo } })
  expect(h.reads.at(-1)?.target).toBe(row.element)
})

test("keyboard focus wins until the pointer moves again", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  const pointed = card(), focused = card("yt-lockup-view-model", secondVideo)
  h.point(pointed.button)
  const visible = focusVisibility(focused.button)
  cleanups.push(visible.restore)
  focused.button.focus()
  expect(await h.items.resolve()).toMatchObject({ kind: "pointed-item", video: { videoId: secondVideo } })
  h.stack.set([pointed.button]); move(pointed.button, 44, 55)
  expect(await h.items.resolve()).toMatchObject({ kind: "pointed-item", video: { videoId: firstVideo } })
})

test("stationary pointer scrolling resolves a fresh hit stack at action time", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  const first = card(), next = card("yt-lockup-view-model", secondVideo)
  h.point(first.button)
  expect(await h.items.resolve()).toMatchObject({ kind: "pointed-item", video: { videoId: firstVideo } })
  const before = h.stack.reads
  h.stack.set([next.button])
  expect(await h.items.resolve()).toMatchObject({ kind: "pointed-item", video: { videoId: secondVideo } })
  expect(h.stack.reads).toBeGreaterThan(before)
})

test("fullscreen uses current video and outside-page pointer may fall back", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  const player = h.player(), list = playlist()
  h.navigate(rawNavigation(), `/watch?v=${firstVideo}`)
  h.point(list.anchor)
  const restore = defineRaw(document, "fullscreenElement", player.root)
  cleanups.push(restore)
  expect(await h.items.resolve()).toMatchObject({ kind: "current-video", video: { videoId: firstVideo } })
  restore()
  document.dispatchEvent(new PointerEvent("pointerout", { relatedTarget: null, bubbles: true }))
  expect(await h.items.resolve()).toMatchObject({ kind: "current-video", video: { videoId: firstVideo } })
})

test("target detail failure never falls back to an available player", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  h.player(); h.navigate(rawNavigation(), `/watch?v=${firstVideo}`)
  const row = card("yt-lockup-view-model", secondVideo)
  defineRaw(row.element, "data", { contentId: secondVideo, contentType: "LOCKUP_CONTENT_TYPE_CHANNEL" })
  h.point(row.button)
  expect(await h.items.resolve()).toMatchObject({ kind: "detail-failed", failure: { ok: false, reason: "unavailable" } })
  expect(h.reads).toEqual([{ job: "videoInfo", target: row.element }])
})

test("detached and recycled targets reject delayed page answers", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  for (const change of ["detach", "recycle"] as const) {
    const row = card()
    h.point(row.button); h.delayAnswers()
    const pending = h.items.resolve()
    await flush()
    expect(h.heldAnswers).toBe(1)
    if (change === "detach") row.element.remove()
    else row.anchor.href = `/watch?v=${secondVideo}`
    h.releaseAnswers()
    expect(await pending).toEqual({ kind: "stale-target", reason: "identity" })
    row.element.remove()
  }
})

test("old navigation and released lifetimes cannot accept delayed details", async () => {
  const h = await fixture()
  const owner = h.owner(), release = h.items.track(owner), row = card()
  h.point(row.button); h.delayAnswers()
  const pending = h.items.resolve()
  await flush(); h.navigate(); h.releaseAnswers()
  expect(await pending).toEqual({ kind: "stale-target", reason: "navigation" })
  h.delayAnswers()
  const obsolete = h.items.resolve()
  await flush(); release(); h.items.track(h.owner()); h.releaseAnswers()
  expect(await obsolete).toEqual({ kind: "stale-target", reason: "lifetime" })
})

function census(total: number, known: number) {
  const main = document.createElement("main")
  document.body.append(main)
  for (let n = 0; n < total; n++) {
    const id = `vid${String(n).padStart(8, "0")}`
    if (n < known) card("ytd-video-renderer", id, main)
    else unknownCard(id, main)
  }
  return main
}

test("settle boundaries distinguish five links, six links and exactly half recognised", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  for (const [total, known, missing] of [[5, 0, false], [6, 2, true], [6, 3, false]] satisfies [number, number, boolean][]) {
    const main = census(total, known)
    h.navigate()
    const before = h.observations.length
    h.timers.advance(2999)
    expect(h.observations).toHaveLength(before)
    h.timers.advance(1)
    expect(h.observations.at(-1)).toMatchObject({ distinctMainLinks: total, recognised: known, anchorMissing: missing })
    main.remove()
  }
})

test("settle census deduplicates IDs and excludes player, description, comments and hidden content", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  const main = census(6, 2)
  for (let n = 0; n < 4; n++) unknownCard("vid00000000", main)
  for (const id of ["movie_player", "description", "comments"]) {
    const excluded = document.createElement("section")
    excluded.id = id
    for (let n = 6; n < 12; n++) unknownCard(`vid${String(n).padStart(8, "0")}`, excluded)
    main.append(excluded)
  }
  const hidden = document.createElement("section"); hidden.hidden = true
  unknownCard(secondVideo, hidden); main.append(hidden)
  unknownCard(shortVideo)
  h.navigate(); h.timers.advance(3000)
  expect(h.observations.at(-1)).toMatchObject({ distinctMainLinks: 6, recognised: 2, anchorMissing: true })
})

test("navigation cancels its previous settle deadline", async () => {
  const h = await fixture()
  h.items.track(h.owner()); census(6, 0)
  h.navigate(); h.timers.advance(2999)
  h.navigate(); h.timers.advance(1)
  expect(h.observations).toEqual([])
  expect(h.timers.count).toBe(1)
  h.timers.advance(2999)
  expect(h.observations).toHaveLength(1)
  h.timers.advance(3000)
  expect(h.observations).toHaveLength(1)
})

test("two owners share resources, last release cancels, and reacquisition is fresh", async () => {
  const h = await fixture()
  const events = trackNativeEvents(document)
  cleanups.push(events.restore)
  expect(h.navStarts).toBe(0)
  expect(events.active()).toBe(0)
  const a = h.items.track(h.owner()), b = h.items.track(h.owner())
  const sharedCount = events.active()
  expect(sharedCount).toBeGreaterThan(0)
  expect(h.navStarts).toBe(1)
  h.navigate()
  a(); a()
  expect(events.active()).toBe(sharedCount)
  expect(h.timers.count).toBe(1)
  b(); b()
  expect([events.active(), h.timers.count, h.navStops]).toEqual([0, 0, 1])
  expect(h.pointer.read()).toEqual({ kind: "none", reason: "inactive" })
  const again = h.items.track(h.owner())
  expect(h.navStarts).toBe(2)
  events.stale("yt-navigate-finish", new Event("yt-navigate-finish"))
  h.timers.advance(3000)
  expect(h.observations).toEqual([])
  const row = card(); h.point(row.button)
  expect(await h.items.resolve()).toHaveProperty("kind", "pointed-item")
  again()
  expect(events.active()).toBe(0)
})

test("disposal reentry cannot reacquire ended Items or leak owners", async () => {
  const h = await fixture()
  const owner = h.owner(), reentered = h.owner()
  h.items.track(owner)
  owner.add(() => { h.items.dispose(); h.items.track(reentered) })
  owner.dispose(); h.items.dispose()
  expect([owner.resourceCount, reentered.resourceCount, h.timers.count]).toEqual([0, 0, 0])
  expect(await h.items.resolve()).toEqual({ kind: "inactive" })
  expect(h.navStops).toBe(1)
})

test("current playback uses fresh nav and player data for watch, Shorts, ads and miniplayer", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  const player = h.player()
  h.navigate(rawNavigation(), `/watch?v=${firstVideo}`)
  expect(await h.items.resolve()).toMatchObject({ kind: "current-video", video: { videoId: firstVideo } })
  player.root.classList.add("ad-showing")
  expect(await h.items.resolve()).toMatchObject({ kind: "current-video", video: { videoId: firstVideo } })
  player.root.classList.remove("ad-showing")
  player.update(rawPlayer(secondVideo)); h.navigate(rawNavigation("other"))
  player.root.dispatchEvent(new Event("onVideoDataChange"))
  expect(await h.items.resolve()).toMatchObject({ kind: "current-video", video: { videoId: secondVideo } })
  player.root.id = "shorts-player"
  player.update(rawPlayer(shortVideo)); h.navigate(rawNavigation("shorts", shortVideo), `/shorts/${shortVideo}`)
  expect(await h.items.resolve()).toMatchObject({ kind: "current-video", video: { videoId: shortVideo, kind: "short" } })
  player.root.remove(); h.navigate(rawNavigation("other"))
  expect(await h.items.resolve()).toHaveProperty("kind", "current-unavailable")
})

test("independent consumer expectation matches direct and DOM channel output through EOF", async () => {
  const expected = await readFile(new URL("../../../tools/fixtures/items-www/expected.jsonl", import.meta.url), "utf8")
  expect(await runItemsConsumer(false)).toBe(expected)
  expect(await runItemsConsumer(true)).toBe(expected)
})

test("recognition is independent of page renderer properties", () => {
  const row = card("yt-lockup-view-model", secondVideo)
  defineRaw(row.element, "data", { malformed: true })
  expect(recogniseWwwItem(row.button)).toHaveProperty("kind", "pointed-item")
  row.element.remove()
})
