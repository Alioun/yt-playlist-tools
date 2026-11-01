import { afterEach, expect, test } from "bun:test"
import { MusicItems, recogniseMusicItem } from "./items-music"
import { defineRaw, trackNativeEvents } from "../../page/live-read.specimens"
import { rawMusicPlayer, rawSong } from "../../page/gateway.specimens"
import { focusVisibility, move } from "../../../tools/fixtures/pointer-keys/harness"
import { flush, musicFixture } from "../../../tools/fixtures/items-music/harness"
import { row, collection, unknownItem, firstVideo, secondVideo } from "../../../tools/fixtures/items-music/specimens"

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })
async function fixture(dom = false) {
  const value = await musicFixture(dom)
  cleanups.push(() => value.dispose())
  return value
}
function requireButton(parent: Element): HTMLElement {
  const button = parent.querySelector("button")
  if (!(button instanceof HTMLElement)) throw Error("Missing synthetic button")
  return button
}

test("construction is inert and disposed owners cannot acquire", async () => {
  const h = await fixture(), owner = h.owner()
  expect(h.navStarts).toBe(0)
  expect(h.items.readPointed()).toEqual({ kind: "no-pointed-item", reason: "inactive" })
  expect(await h.items.resolve()).toEqual({ kind: "inactive" })
  owner.dispose(); h.items.track(owner)
  expect(h.navStarts).toBe(0)
})

test("all four recognized families use actual targeted itemInfo and preserve native capabilities", async () => {
  const h = await fixture()
  h.items.track(h.owner())
  for (const tag of ["ytmusic-responsive-list-item-renderer", "ytmusic-two-row-item-renderer", "ytmusic-player-queue-item", "ytmusic-responsive-header-renderer"]) {
    const item = row(tag)
    h.point(item.button)
    const before = h.reads.length, answer = await h.items.resolve()
    expect(answer).toMatchObject({ kind: "pointed-item", item: { kind: "song", videoId: firstVideo, queueItemId: 7,
      selected: false, autoplay: false, hasOwnLike: true, likeState: "not-liked", type: { musicVideoType: "MUSIC_VIDEO_TYPE_ATV" },
      endpoints: { next: item.data.menu.menuRenderer.items[2]?.menuServiceItemRenderer.serviceEndpoint,
        end: item.data.menu.menuRenderer.items[0]?.menuServiceItemRenderer.serviceEndpoint } } })
    expect(h.reads.slice(before)).toEqual([{ job: "itemInfo", target: item.element }, { job: "itemInfo", target: item.element }])
    item.element.remove()
  }
})

test("unsupported albums playlists and artists retain ItemInfo and never fall back", async () => {
  const h = await fixture(); h.items.track(h.owner()); h.player()
  h.setMetadata({ title: "Song", artist: "Artist", artwork: [] })
  for (const kind of ["album", "playlist", "artist"] satisfies ("album" | "playlist" | "artist")[]) {
    const item = collection(kind)
    h.point(item.button)
    const before = h.reads.length
    expect(await h.items.resolve("save")).toMatchObject({ kind: "unsupported-item", item: { kind },
      message: "Only songs can be saved to playlists." })
    expect(h.reads.slice(before).every(read => read.job === "itemInfo")).toBe(true)
    expect(await h.items.resolve("like")).toMatchObject({ kind: "unsupported-item", message: `Like isn't available for ${kind}s.` })
    item.element.remove()
  }
})

test("autoplay suggestions retain exact queue identity and the specific unsupported hint", async () => {
  const h = await fixture(); h.items.track(h.owner())
  const item = row("ytmusic-player-queue-item", secondVideo, { autoplay: true, id: 19 })
  h.point(item.button)
  for (const action of ["next", "end", "move"] satisfies ("next" | "end" | "move")[]) {
    expect(await h.items.resolve(action)).toMatchObject({ kind: "unsupported-item", item: { queueItemId: 19, autoplay: true },
      message: "Autoplay suggestions can't be moved. Use YouTube Music's ⋮ menu to add a copy." })
  }
  expect(h.reads.every(read => read.job === "itemInfo")).toBe(true)
})

test("the independent census rejects unknown queue markup and never falls back", async () => {
  const h = await fixture(); h.items.track(h.owner()); h.player()
  h.setMetadata({ title: "Song", artist: "Artist" })
  const panel = document.createElement("ytmusic-player-queue"), button = document.createElement("button")
  panel.append(button); document.body.append(panel); h.point(button)
  const before = h.reads.length
  expect(await h.items.resolve()).toMatchObject({ kind: "unrecognised-item" })
  expect(h.reads.length).toBe(before)
  expect(h.failures).toEqual([{ kind: "item-unrecognised", site: "music", source: "pointer", element: button }])
})

test("the census counts distinct links independently and stops before page containers", async () => {
  const h = await fixture(); h.items.track(h.owner())
  for (const href of [`/watch?v=${firstVideo}`, "/playlist?list=PLsynthetic", "/browse/MPREsynthetic", "/browse/VLPLsynthetic"]) {
    const item = unknownItem()
    item.anchor.href = href
    item.element.append(item.anchor.cloneNode(true))
    h.point(item.button)
    expect((await h.items.resolve()).kind).toBe("unrecognised-item")
    item.element.remove()
  }
  const main = document.createElement("main"), plain = document.createElement("button")
  main.append(plain); document.body.append(main); unknownItem(firstVideo, main)
  expect(recogniseMusicItem(plain)).toEqual({ kind: "no-pointed-item", reason: "ordinary" })
  const ambiguous = unknownItem()
  const other = document.createElement("a"); other.href = `/watch?v=${secondVideo}`; ambiguous.element.append(other)
  expect(recogniseMusicItem(ambiguous.button)).toEqual({ kind: "no-pointed-item", reason: "ordinary" })
})

test("the census examines at most six ancestors and cannot classify a whole page", () => {
  const root = document.createElement("section"), anchor = document.createElement("a")
  anchor.href = `/watch?v=${firstVideo}`; root.append(anchor); document.body.append(root)
  let at: Element = root
  for (let n = 0; n < 5; n++) { const next = document.createElement("div"); at.append(next); at = next }
  expect(recogniseMusicItem(at).kind).toBe("unrecognised-item")
  const sixth = document.createElement("div"); at.append(sixth)
  expect(recogniseMusicItem(sixth).kind).toBe("unrecognised-item")
  const seventh = document.createElement("button"); sixth.append(seventh)
  expect(recogniseMusicItem(seventh)).toEqual({ kind: "no-pointed-item", reason: "ordinary" })
  root.remove()
})

test("malformed ambiguous and foreign identities on recognized rows fail recognition", async () => {
  const h = await fixture(); h.items.track(h.owner())
  for (const href of ["/watch?v=bad", `/watch?v=${firstVideo}&v=${secondVideo}`, `https://example.invalid/watch?v=${firstVideo}`, `/playlist?list=bad!`, "/browse/MPRE%2Fbad"]) {
    const item = row(); item.anchor.href = href; h.point(item.button)
    const before = h.reads.length
    expect((await h.items.resolve()).kind).toBe("unrecognised-item")
    expect(h.reads.length).toBe(before)
    item.element.remove()
  }
  const item = row(), second = document.createElement("a")
  second.href = `/watch?v=${secondVideo}`; item.element.append(second); h.point(item.button)
  expect((await h.items.resolve()).kind).toBe("unrecognised-item")
})

test("link origin is retained in target identity", () => {
  const item = row(); item.anchor.href = `https://www.youtube.com/watch?v=${firstVideo}`
  expect(recogniseMusicItem(item.button)).toMatchObject({ kind: "pointed-item", target: { identity: { origin: "https://www.youtube.com", videoId: firstVideo } } })
  item.element.remove()
})

test("keyboard focus wins until the pointer moves and stationary scrolling reads fresh hits", async () => {
  const h = await fixture(); h.items.track(h.owner())
  const first = row(), second = row("ytmusic-two-row-item-renderer", secondVideo)
  h.point(first.button)
  const visible = focusVisibility(second.button); cleanups.push(visible.restore)
  second.button.focus()
  expect(await h.items.resolve()).toMatchObject({ kind: "pointed-item", item: { videoId: secondVideo } })
  h.stack.set([first.button]); move(first.button, 40, 50)
  expect(await h.items.resolve()).toMatchObject({ kind: "pointed-item", item: { videoId: firstVideo } })
  const before = h.stack.reads
  h.stack.set([second.button])
  expect(await h.items.resolve()).toMatchObject({ kind: "pointed-item", item: { videoId: secondVideo } })
  expect(h.stack.reads).toBeGreaterThan(before)
})

test("player bar fullscreen and outside pointer act on current playback without a player bar dependency", async () => {
  const h = await fixture(); h.items.track(h.owner()); const player = h.player()
  h.setMetadata({ title: "Song", artist: "Artist", artwork: [] })
  expect(document.querySelector("ytmusic-player-bar")).toBeNull()
  expect(await h.items.resolve()).toMatchObject({ kind: "current-song", song: { videoId: firstVideo }, queueDisposition: "insert-copy" })
  const bar = document.createElement("ytmusic-player-bar"); bar.innerHTML = "<button>Player</button>"; document.body.append(bar)
  h.point(requireButton(bar))
  expect((await h.items.resolve()).kind).toBe("current-song")
  const album = collection("album"); h.point(album.anchor)
  const restore = defineRaw(document, "fullscreenElement", player.root); cleanups.push(restore)
  expect((await h.items.resolve()).kind).toBe("current-song")
  restore(); document.dispatchEvent(new PointerEvent("pointerout", { relatedTarget: null, bubbles: true }))
  expect((await h.items.resolve()).kind).toBe("current-song")
})

test("confirmed nothing playing and generic unavailable remain distinct", async () => {
  const h = await fixture(); h.items.track(h.owner())
  expect(await h.items.resolve()).toEqual({ kind: "nothing-playing" })
  h.setMetadata(undefined)
  expect(await h.items.resolve()).toEqual({ kind: "unavailable", failure: { ok: false, reason: "unavailable" } })
})

test("the current queue song inserts a copy and another queue entry with the same video moves", async () => {
  const h = await fixture(); h.items.track(h.owner()); h.player()
  h.setMetadata({ title: "Song", artist: "Artist", artwork: [] })
  const current = row("ytmusic-player-queue-item", firstVideo, { selected: true, id: 7 }), other = row("ytmusic-player-queue-item", firstVideo, { id: 8 })
  h.setQueue([current.data, other.data]); h.point(current.button)
  expect(await h.items.resolve("next")).toMatchObject({ kind: "pointed-item", item: { selected: true, queueItemId: 7 }, queueDisposition: "insert-copy" })
  h.point(other.button)
  expect(await h.items.resolve("end")).toMatchObject({ kind: "pointed-item", item: { selected: false, queueItemId: 8 }, queueDisposition: "move-existing" })
})

test("explicit refresh re-reads queue facts after an actual unimplemented queue job", async () => {
  const h = await fixture(true); h.items.track(h.owner())
  const item = row("ytmusic-player-queue-item", firstVideo, { id: 8 }); h.point(item.button)
  const answer = await h.items.resolve()
  if (answer.kind !== "pointed-item" || answer.item.queueItemId === undefined) throw Error("Expected native queue target")
  expect(await h.link.run({ job: { kind: "queueMove", id: answer.item.queueItemId, to: "end" } })).toEqual({ ok: false, reason: "unavailable" })
  item.update({ ...rawSong(firstVideo, 12), selected: false })
  const before = h.reads.length
  expect(await h.items.refresh(answer.target)).toMatchObject({ kind: "pointed-item", item: { queueItemId: 12, selected: false } })
  expect(h.reads.slice(before)).toEqual([{ job: "itemInfo", target: item.element }, { job: "itemInfo", target: item.element }])
})

test("detached recycled DOM and recycled page data reject delayed serialized answers", async () => {
  for (const change of ["detach", "href", "raw"] satisfies ("detach" | "href" | "raw")[]) {
    const h = await fixture(true); h.items.track(h.owner())
    const item = row(); h.point(item.button); h.delayAnswers()
    const pending = h.items.resolve(); await flush()
    expect(h.heldAnswers).toBe(1)
    if (change === "detach") item.element.remove()
    if (change === "href") item.anchor.href = `/watch?v=${secondVideo}`
    if (change === "raw") item.update(rawSong(secondVideo, 9))
    h.releaseAnswers()
    expect(await pending).toMatchObject({ kind: "stale-target", reason: "identity" })
    h.dispose()
  }
})

test("transient recycling is rejected even when the original DOM identity returns", async () => {
  const h = await fixture(); h.items.track(h.owner())
  const item = row(); h.point(item.button); h.delayAnswers()
  const pending = h.items.resolve(); await flush()
  item.anchor.href = `/watch?v=${secondVideo}`; item.anchor.href = `/watch?v=${firstVideo}`
  await flush(); h.releaseAnswers()
  expect(await pending).toMatchObject({ kind: "stale-target", reason: "identity" })
})

test("navigation last release and disposal invalidate late answers", async () => {
  for (const change of ["navigation", "release", "dispose", "page-dispose"] satisfies ("navigation" | "release" | "dispose" | "page-dispose")[]) {
    const h = await fixture(); const release = h.items.track(h.owner())
    const item = row(); h.point(item.button); h.delayAnswers()
    const pending = h.items.resolve(); await flush()
    if (change === "navigation") h.navigate()
    if (change === "release") release()
    if (change === "dispose") h.items.dispose()
    if (change === "page-dispose") h.link.dispose()
    h.releaseAnswers()
    expect((await pending).kind).toBe("stale-target")
    h.dispose()
  }
})

test("two feature owners share subscriptions and last release removes native listeners", async () => {
  const h = await fixture(), first = h.owner(), second = h.owner(), player = h.player()
  const events = trackNativeEvents(player.root); cleanups.push(events.restore)
  const stopFirst = h.items.track(first), stopSecond = h.items.track(second)
  expect(h.navStarts).toBe(1)
  expect(events.records.filter(record => record.active && record.type === "onAdStart").length).toBe(1)
  stopFirst(); expect(h.navStops).toBe(0)
  stopSecond(); expect(h.navStops).toBe(2)
  expect(events.active()).toBe(0)
  expect((await h.items.resolve()).kind).toBe("inactive")
  const owner = h.owner(); h.items.track(owner); const item = row(); h.point(item.button)
  expect((await h.items.resolve()).kind).toBe("pointed-item")
  h.items.dispose(); expect(owner.resourceCount).toBe(0)
  expect(h.errors).toEqual([])
})

test("null or unready page authority cannot resolve or refresh targets", async () => {
  const h = await fixture(); h.items.track(h.owner())
  const item = row(); h.point(item.button); const answer = await h.items.resolve()
  if (answer.kind !== "pointed-item") throw Error("Expected target")
  h.link.dispose()
  expect((await h.items.resolve()).kind).toBe("unavailable")
  expect((await h.items.refresh(answer.target)).kind).toBe("stale-target")
})

test("targeted detail failure cannot use an available current song", async () => {
  const h = await fixture(); h.items.track(h.owner()); h.player(); h.setMetadata({ title: "Song", artist: "Artist" })
  const item = row(); item.update({ title: "Malformed native data" }); h.point(item.button)
  const before = h.reads.length
  expect((await h.items.resolve()).kind).toBe("detail-failed")
  expect(h.reads.slice(before)).toEqual([{ job: "itemInfo", target: item.element }])
})

test("linkless queue items use native IDs and conflicting declared IDs fail admission", async () => {
  const h = await fixture(); h.items.track(h.owner())
  const panel = document.createElement("ytmusic-player-queue"); document.body.append(panel)
  const item = row("ytmusic-player-queue-item", firstVideo, { id: 23, link: false, parent: panel })
  h.point(item.button)
  expect(await h.items.resolve()).toMatchObject({ kind: "pointed-item", item: { queueItemId: 23, videoId: firstVideo } })
  item.update({ ...rawSong(firstVideo, 23), videoId: secondVideo })
  expect((await h.items.resolve()).kind).toBe("detail-failed")
})

test("queue refresh survives a native queue notification and old acquisition authority does not", async () => {
  const h = await fixture(); const stop = h.items.track(h.owner())
  h.player(); h.setMetadata({ title: "Song", artist: "Artist" })
  const item = row("ytmusic-player-queue-item", firstVideo, { id: 8 }); h.point(item.button)
  const answer = await h.items.resolve()
  if (answer.kind !== "pointed-item") throw Error("Expected queue target")
  const updated = { ...rawSong(firstVideo, 24), selected: false }
  item.update(updated); h.setQueue([updated])
  expect(await h.items.refresh(answer.target)).toMatchObject({ kind: "pointed-item", item: { queueItemId: 24 } })
  stop(); h.items.track(h.owner())
  expect(await h.items.refresh(answer.target)).toMatchObject({ kind: "stale-target", reason: "lifetime" })
})

test("removing without a pointed queue item gives the specific hint without current fallback", async () => {
  const h = await fixture(); h.items.track(h.owner())
  const before = h.reads.length
  expect(await h.items.resolve("remove")).toEqual({ kind: "no-queue-target", message: "Point at a song in the queue to remove it." })
  expect(h.reads.length).toBe(before)
})

test("song bylines do not replace the primary watch identity", async () => {
  const h = await fixture(); h.items.track(h.owner()); const item = row()
  const album = document.createElement("a"); album.href = "/browse/MPREsyntheticAlbum"
  const artist = document.createElement("a"); artist.href = `https://music.youtube.com/browse/UC${"a".repeat(22)}`
  item.element.append(album, artist); h.point(item.button)
  expect(await h.items.resolve()).toMatchObject({ kind: "pointed-item", item: { videoId: firstVideo } })
})
