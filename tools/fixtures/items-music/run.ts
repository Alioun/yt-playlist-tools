import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { MusicResolution } from "../../../src/site/core/items-music"
import { rawMusicPlayer, rawSong } from "../../../src/page/gateway.specimens"
import { defineRaw } from "../../../src/page/live-read.specimens"
import { musicFixture } from "./harness"
import { row, collection, unknownItem, firstVideo, secondVideo } from "./specimens"

function check(value: unknown, message: string): asserts value { if (!value) throw Error(message) }
function nativeItem(answer: MusicResolution) {
  check(answer.kind === "pointed-item", "Expected a native pointed item")
  return answer
}
function current(answer: MusicResolution) {
  check(answer.kind === "current-song", "Expected confirmed current song")
  return answer
}

export async function runMusicConsumer(dom: boolean): Promise<string> {
  const h = await musicFixture(dom), records: Readonly<Record<string, unknown>>[] = []
  try {
    records.push({ step: "inactive", kind: (await h.items.resolve()).kind })
    const release = h.items.track(h.owner())
    const first = row(), second = row("ytmusic-two-row-item-renderer", secondVideo)
    h.point(first.button)
    let item = nativeItem(await h.items.resolve())
    records.push({ step: "row", kind: item.kind, videoId: item.item.videoId, target: h.reads.at(-1)?.target === first.element })
    h.point(second.button); item = nativeItem(await h.items.resolve())
    records.push({ step: "card", kind: item.kind, videoId: item.item.videoId })
    const album = collection("album"); h.point(album.button)
    const unsupported = await h.items.resolve("save")
    check(unsupported.kind === "unsupported-item", "Album must retain unsupported-action feedback")
    records.push({ step: "album", kind: unsupported.kind, reason: unsupported.reason })
    const player = h.player()
    h.setMetadata({ title: "Song", artist: "Artist", artwork: [] })
    const selected = row("ytmusic-player-queue-item", firstVideo, { selected: true, id: 7 })
    const other = row("ytmusic-player-queue-item", firstVideo, { id: 8 })
    h.setQueue([selected.data, other.data]); h.point(selected.button)
    item = nativeItem(await h.items.resolve("next"))
    records.push({ step: "queue-current", kind: item.kind, id: item.item.queueItemId, disposition: item.queueDisposition })
    h.point(other.button); item = nativeItem(await h.items.resolve("end"))
    records.push({ step: "queue-other-copy-of-song", kind: item.kind, id: item.item.queueItemId, disposition: item.queueDisposition })
    check(item.item.queueItemId !== undefined, "Missing queue identity")
    const job = await h.link.run({ job: { kind: "queueMove", id: item.item.queueItemId, to: "end" } })
    check(!job.ok && job.reason === "unavailable", "Later queue actions must remain unimplemented")
    other.update({ ...rawSong(firstVideo, 12), selected: false })
    item = nativeItem(await h.items.refresh(item.target))
    records.push({ step: "refresh", kind: item.kind, id: item.item.queueItemId, selected: item.item.selected })
    h.point(first.button); h.stack.set([second.button]); item = nativeItem(await h.items.resolve())
    records.push({ step: "stationary", kind: item.kind, videoId: item.item.videoId })
    const unknown = unknownItem(); h.point(unknown.button)
    const before = h.reads.length, unrecognised = await h.items.resolve()
    records.push({ step: "unrecognised", kind: unrecognised.kind, reports: h.failures.length, reads: h.reads.length - before })
    const bar = document.createElement("ytmusic-player-bar"); document.body.append(bar); h.point(bar)
    const playing = current(await h.items.resolve())
    records.push({ step: "player-bar", kind: playing.kind, videoId: playing.song.videoId, disposition: playing.queueDisposition })
    h.point(album.button)
    const restoreFullscreen = defineRaw(document, "fullscreenElement", player.root)
    records.push({ step: "fullscreen", kind: (await h.items.resolve()).kind }); restoreFullscreen()
    document.dispatchEvent(new PointerEvent("pointerout", { relatedTarget: null, bubbles: true }))
    player.root.remove(); h.setQueue([]); h.setMetadata(null)
    records.push({ step: "nothing", kind: (await h.items.resolve()).kind })
    h.setMetadata(undefined)
    records.push({ step: "unavailable", kind: (await h.items.resolve()).kind })
    const adPlayer = h.player(); h.setMetadata({ title: "Song", artist: "Artist" })
    adPlayer.root.classList.add("ad-showing")
    records.push({ step: "adShowing", kind: (await h.items.resolve()).kind })
    adPlayer.root.classList.remove("ad-showing")
    adPlayer.root.dispatchEvent(new Event("onAdStart"))
    records.push({ step: "adActive", kind: (await h.items.resolve()).kind })
    adPlayer.root.dispatchEvent(new Event("onAdEnd"))
    adPlayer.update({ ...rawMusicPlayer(), presentingPlayerType: 2 })
    records.push({ step: "presentingPlayerType", kind: (await h.items.resolve()).kind })
    adPlayer.update(rawMusicPlayer())
    release(); records.push({ step: "last-release", kind: (await h.items.resolve()).kind })
    h.items.track(h.owner()); h.point(first.button)
    records.push({ step: "reacquired", kind: (await h.items.resolve()).kind })
    h.items.dispose(); h.link.dispose()
    records.push({ step: "disposed", kind: (await h.items.resolve()).kind,
      owners: h.owners.reduce((count, owner) => count + owner.resourceCount, 0), deadlines: h.clock.count })
    check(h.errors.length === 0, "Scope cleanup failed")
    return records.map(record => JSON.stringify(record)).join("\n") + "\n"
  } finally { h.dispose() }
}

if (import.meta.main) {
  const adapter = process.argv[2]
  check(adapter === "direct" || adapter === "dom", "Expected direct or dom")
  GlobalRegistrator.register({ url: "https://music.youtube.com/" })
  try { process.stdout.write(await runMusicConsumer(adapter === "dom")) }
  finally { await GlobalRegistrator.unregister() }
}
