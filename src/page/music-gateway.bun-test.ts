import { expect, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { isJob } from "../shared/contracts"
import type { Job } from "../shared/contracts"
import { handlerWatches } from "./gateway/port"
import { syntheticVideo } from "./gateway.specimens"
import { albumId, albumTracks, insertEndpoint, musicWorld, queueEntry, settle } from "./music-gateway.specimens"

if (typeof document === "undefined") GlobalRegistrator.register({ url: "https://music.youtube.com" })

type World = ReturnType<typeof musicWorld>
const unavailable = { ok: false, reason: "unavailable" }
const failed = { ok: false, reason: "failed" }

function job(value: unknown): Job {
  if (!isJob(value)) throw new Error("Invalid synthetic job")
  return value
}
async function run(h: World, value: unknown, target?: Element) {
  let result: unknown
  let done = false
  void h.gateway.run(job(value), target ? { target } : undefined).then(answer => { result = answer; done = true })
  for (let step = 0; step < 80 && !done; step++) { await settle(); if (!done) h.clock.advance(250) }
  if (!done) throw new Error("Job never answered")
  return result
}
const kinds = (h: World) => h.signals.map(signal => `${signal.kind} ${signal.route}`)

test("Play next inserts right after the playing song through the menu item, with its toast stripped", async () => {
  const h = musicWorld(undefined, 1)
  expect(await run(h, { kind: "queueInsert", endpoint: insertEndpoint("next"), position: "next" }))
    .toEqual({ ok: true, data: { ids: [4] }, route: "music-menu-item.queueInsert" })
  expect(h.videos()[2]).toBe("inserted001")
  const command = h.calls.find(call => call.kind === "menuItem")?.args
  expect(JSON.stringify(command)).not.toContain("addToToastAction")
  expect(command).toMatchObject({ queueAddEndpoint: { queueInsertPosition: "INSERT_AFTER_CURRENT_VIDEO", queueTarget: { videoId: "inserted001" } } })
})

test("Add to queue on an album inserts the whole block at the end and answers every new ID", async () => {
  const h = musicWorld()
  expect(await run(h, { kind: "queueInsert", endpoint: insertEndpoint("end", { playlistId: albumId }), position: "end" }))
    .toEqual({ ok: true, data: { ids: [4, 5, 6] }, route: "music-menu-item.queueInsert" })
  expect(h.videos().slice(4)).toEqual(albumTracks)
})

test("without the menu item, queue replay inserts with the store's context and clears responsive radio", async () => {
  const h = musicWorld(undefined, 1)
  h.handlers.delete("menu-item")
  expect(await run(h, { kind: "queueInsert", endpoint: insertEndpoint("next"), position: "next" }))
    .toEqual({ ok: true, data: { ids: [4] }, route: "music-replay.queueInsert" })
  expect(h.calls.find(call => call.kind === "fetchQueue")?.args)
    .toEqual({ queueContextParams: "CTX-1", queueInsertPosition: "INSERT_AFTER_CURRENT_VIDEO", videoIds: ["inserted001"] })
  expect(h.calls.filter(call => call.kind === "dispatch").map(call => call.args)).toMatchObject([
    { type: "SET_QUEUE_CONTEXT_PARAMS", payload: "CTX-2" },
    { type: "ADD_ITEMS", payload: { nextQueueItemId: 4, index: 2, shouldAssignIds: true } },
    { type: "SET_IS_RAAR_ENABLED", payload: false }
  ])
  expect(h.videos()[2]).toBe("inserted001")
  expect(kinds(h)).toContain("missing music-menu-item.queueInsert")
})

test("a menu item that throws before sending falls back to replay once", async () => {
  const h = musicWorld()
  h.faults.add("menu-item-throws")
  expect(await run(h, { kind: "queueInsert", endpoint: insertEndpoint("end"), position: "end" }))
    .toMatchObject({ ok: true, route: "music-replay.queueInsert" })
  expect(h.videos().filter(video => video === "inserted001")).toHaveLength(1)
  expect(kinds(h)).toContain("threw music-menu-item.queueInsert")
})

test("an insert that never grows the queue fails after at most six backed-off re-reads", async () => {
  const h = musicWorld()
  h.faults.add("menu-item-noop")
  expect(await run(h, { kind: "queueInsert", endpoint: insertEndpoint("end"), position: "end" })).toEqual(failed)
  expect(kinds(h)).toContain("no-effect music-menu-item.queueInsert")
  expect(h.calls.filter(call => call.kind === "fetchQueue")).toHaveLength(0)
  expect(h.itemReads).toBe(1 + 1 + 6)
})

test("when the queue's changes can be heard, growth is confirmed on the change without timed re-reads", async () => {
  const h = musicWorld()
  h.page.setQueueChanges(true)
  let land = () => {}
  h.port.menuItem = () => { land = () => h.addItems([queueEntry("late0000001", undefined)], 4) }
  let result: unknown
  void h.gateway.run(job({ kind: "queueInsert", endpoint: insertEndpoint("end"), position: "end" })).then(value => { result = value })
  await settle()
  expect(result).toBeUndefined()
  land()
  await settle()
  expect(result).toEqual({ ok: true, data: { ids: [4] }, route: "music-menu-item.queueInsert" })
  expect(h.clock.now()).toBe(0)
  expect(h.itemReads).toBe(3)
})

test("while casting, every queue edit and Start mix is unavailable and nothing is fired; save-like jobs still run", async () => {
  const h = musicWorld()
  h.page.values.musicState = { castStatus: true }
  for (const value of [
    { kind: "queueInsert", endpoint: insertEndpoint("next"), position: "next" }, { kind: "queueRemove", id: 2 },
    { kind: "queueRemoveIds", ids: [2] }, { kind: "queueMove", id: 2, to: "next" }, { kind: "queueReinsert", videoId: syntheticVideo, index: 1 },
    { kind: "navigate", endpoint: { watchEndpoint: { videoId: syntheticVideo, playlistId: `RDAMVM${syntheticVideo}` } } }
  ]) expect(await run(h, value)).toEqual(unavailable)
  expect(h.calls).toEqual([])
  expect(await run(h, { kind: "like", endpoint: { likeEndpoint: { status: "LIKE", target: { videoId: syntheticVideo } } } }))
    .toEqual({ ok: true, data: null, route: "music-service.like" })
  expect(await run(h, { kind: "navigate", endpoint: { browseEndpoint: { browseId: "MPREb_synthetic" } } }))
    .toEqual({ ok: true, data: { navigated: true }, route: "music-navigation.navigate" })
})

test("an unreadable cast state leaves queue edits available", async () => {
  const h = musicWorld()
  h.page.values.musicState = undefined
  expect(await run(h, { kind: "queueInsert", endpoint: insertEndpoint("end"), position: "end" })).toMatchObject({ ok: true })
})

test("an empty queue starts playback through the item's own empty-queue endpoint", async () => {
  const h = musicWorld([])
  h.handlers.delete("menu-item")
  expect(await run(h, { kind: "queueInsert", endpoint: insertEndpoint("next"), position: "next" }))
    .toEqual({ ok: true, data: { ids: [0] }, route: "music-replay.queueInsert" })
  expect(h.calls.map(call => call.kind)).toEqual(["navigate"])
})

test("YouTube Music's own toast after an insert keeps the insert and records a noisy quiet route", async () => {
  const h = musicWorld()
  h.faults.add("toast")
  expect(await run(h, { kind: "queueInsert", endpoint: insertEndpoint("end"), position: "end" })).toMatchObject({ ok: true })
  expect(kinds(h)).toContain("quiet-route-noisy music-menu-item.queueInsert")
})

test("undo of an insert removes only the entries still waiting", async () => {
  const h = musicWorld(undefined, 2)
  expect(await run(h, { kind: "queueRemoveIds", ids: [1, 3, 99] })).toEqual({ ok: true, data: { removed: 1 }, route: "music-queue.queueRemoveIds" })
  expect(h.ids()).toEqual([0, 1, 2])
  expect(h.calls.map(call => call.args)).toEqual(["3"])
})

test("Remove from queue answers the old index for Undo and fails on a stale or stuck entry", async () => {
  const h = musicWorld()
  expect(await run(h, { kind: "queueRemove", id: 2 })).toEqual({ ok: true, data: { index: 2 }, route: "music-queue.queueRemove" })
  expect(h.ids()).toEqual([0, 1, 3])
  expect(await run(h, { kind: "queueRemove", id: 2 })).toEqual(failed)
  h.faults.add("remove-noop")
  expect(await run(h, { kind: "queueRemove", id: 3 })).toEqual(failed)
  expect(kinds(h)).toContain("no-effect music-queue.queueRemove")
})

test("Play next and Add to queue move a queued entry and answer where it came from", async () => {
  const h = musicWorld(undefined, 1)
  expect(await run(h, { kind: "queueMove", id: 3, to: "next" })).toEqual({ ok: true, data: { from: 3, moved: true }, route: "music-reorder.queueMove" })
  expect(h.ids()).toEqual([0, 1, 3, 2])
  expect(await run(h, { kind: "queueMove", id: 0, to: "end" })).toEqual({ ok: true, data: { from: 0, moved: true }, route: "music-reorder.queueMove" })
  expect(h.ids()).toEqual([1, 3, 2, 0])
  expect(await run(h, { kind: "queueMove", id: 0, to: 0 })).toEqual({ ok: true, data: { from: 3, moved: true }, route: "music-reorder.queueMove" })
  expect(h.ids()).toEqual([0, 1, 3, 2])
})

test("a move never fires on a stale panel, the playing song or an entry already in place", async () => {
  const h = musicWorld(undefined, 1)
  h.faults.add("stale-panel")
  expect(await run(h, { kind: "queueMove", id: 3, to: "next" })).toEqual(failed)
  h.faults.delete("stale-panel")
  expect(await run(h, { kind: "queueMove", id: 1, to: "end" })).toEqual(failed)
  expect(await run(h, { kind: "queueMove", id: 2, to: "next" })).toEqual({ ok: true, data: { from: 2, moved: false }, route: "music-reorder.queueMove" })
  expect(h.calls.filter(call => call.kind === "drop")).toEqual([])
})

test("a move that doesn't land fails with a no-effect signal", async () => {
  const h = musicWorld()
  h.faults.add("drop-noop")
  expect(await run(h, { kind: "queueMove", id: 3, to: "next" })).toEqual(failed)
  expect(kinds(h)).toContain("no-effect music-reorder.queueMove")
})

test("Undo of Remove puts the song back at its old position by replay, then a move", async () => {
  const h = musicWorld()
  expect(await run(h, { kind: "queueRemove", id: 1 })).toMatchObject({ ok: true, data: { index: 1 } })
  expect(await run(h, { kind: "queueReinsert", videoId: "queued00002", index: 1 }))
    .toEqual({ ok: true, data: { id: 4 }, route: "music-replay.queueReinsert" })
  expect(h.videos()).toEqual([syntheticVideo, "queued00002", "queued00003", "queued00004"])
})

test("a re-insert that can't be moved back is taken out again and fails", async () => {
  const h = musicWorld()
  h.faults.add("drop-noop")
  expect(await run(h, { kind: "queueReinsert", videoId: "queued00009", index: 1 })).toEqual(failed)
  expect(h.videos()).not.toContain("queued00009")
})

test("a missing reorder path makes moves and re-inserts unavailable", async () => {
  const h = musicWorld()
  h.handlers.delete("reorder")
  expect(await run(h, { kind: "queueMove", id: 2, to: "next" })).toEqual(unavailable)
  expect(await run(h, { kind: "queueReinsert", videoId: "queued00009", index: 1 })).toEqual(unavailable)
  expect(h.calls).toEqual([])
  expect((await h.gateway.probe()).entries.find(entry => entry.id === handlerWatches.reorder)).toEqual({ id: handlerWatches.reorder, present: false })
})

test("Like confirms through the app's like state, needs an account, and reports a like that didn't take", async () => {
  const h = musicWorld()
  const like = { kind: "like", endpoint: { likeEndpoint: { status: "LIKE", target: { videoId: syntheticVideo } } } }
  expect(await run(h, like)).toEqual({ ok: true, data: null, route: "music-service.like" })
  expect(h.state.likeStatus.videos[syntheticVideo]).toBe("LIKE")
  h.state.likeStatus.videos[syntheticVideo] = "LIKE"
  h.faults.add("service-noop")
  expect(await run(h, { kind: "like", endpoint: { likeEndpoint: { status: "INDIFFERENT", target: { videoId: syntheticVideo } } } })).toEqual(failed)
  expect(await run(musicWorld(undefined, 0, false), like)).toEqual({ ok: false, reason: "signedOut" })
  const fresh = musicWorld()
  fresh.page.config.LOGGED_IN = false
  expect(await run(fresh, like)).toEqual({ ok: false, reason: "accountChanged" })
})

test("Like with an unreadable like state still answers and records that it couldn't measure", async () => {
  const h = musicWorld()
  h.faults.add("service-noop")
  h.port.state = () => ({ queue: h.state.queue })
  expect(await run(h, { kind: "like", endpoint: { likeEndpoint: { status: "LIKE", target: { videoId: syntheticVideo } } } }))
    .toEqual({ ok: true, data: null, route: "music-service.like" })
  expect(kinds(h)).toContain("cannot-measure music-service.like")
})

test("Save to library answers the new library state from the endpoint or the item's own toggle", async () => {
  const h = musicWorld()
  expect(await run(h, { kind: "library", endpoint: { likeEndpoint: { status: "LIKE", target: { playlistId: albumId } } } }))
    .toEqual({ ok: true, data: { inLibrary: true }, route: "music-service.library" })
  const add = { feedbackEndpoint: { feedbackToken: "synthetic-add" } }, removal = { feedbackEndpoint: { feedbackToken: "synthetic-remove" } }
  h.page.values.targetData = { title: { runs: [{ text: "Song" }] }, musicVideoType: "MUSIC_VIDEO_TYPE_ATV",
    navigationEndpoint: { watchEndpoint: { videoId: syntheticVideo } },
    menu: { menuRenderer: { items: [{ toggleMenuServiceItemRenderer: { isToggled: false, defaultServiceEndpoint: add, toggledServiceEndpoint: removal } }] } } }
  const target = document.createElement("ytmusic-responsive-list-item-renderer")
  expect(await run(h, { kind: "library", endpoint: add }, target)).toEqual({ ok: true, data: { inLibrary: true }, route: "music-service.library" })
  expect(await run(h, { kind: "library", endpoint: add })).toEqual(unavailable)
  expect(h.calls.filter(call => call.kind === "service").map(call => call.args)).toEqual([
    { likeEndpoint: { status: "LIKE", target: { playlistId: albumId } } }, add
  ])
})

test("Go to album answers once the page changes, Start mix once the queue changes, and fails if neither does", async () => {
  const h = musicWorld()
  expect(await run(h, { kind: "navigate", endpoint: { browseEndpoint: { browseId: "MPREb_synthetic" } } }))
    .toEqual({ ok: true, data: { navigated: true }, route: "music-navigation.navigate" })
  expect(await run(h, { kind: "navigate", endpoint: { watchPlaylistEndpoint: { playlistId: `RDAMPL${albumId}` } } }))
    .toEqual({ ok: true, data: { navigated: true }, route: "music-navigation.navigate" })
  h.faults.add("navigate-noop")
  expect(await run(h, { kind: "navigate", endpoint: { browseEndpoint: { browseId: "UCsynthetic" } } })).toEqual(failed)
  expect(kinds(h)).toContain("no-effect music-navigation.navigate")
})

test("the probe reports each YouTube Music handler, and a gateway without the page port answers unavailable", async () => {
  const h = musicWorld()
  h.handlers.delete("service")
  const entries = (await h.gateway.probe()).entries
  expect(entries.filter(entry => Object.values(handlerWatches).includes(entry.id))).toEqual(
    Object.values(handlerWatches).map(id => ({ id, present: id !== handlerWatches.service })))
  expect(await run(h, { kind: "like", endpoint: { likeEndpoint: { status: "LIKE", target: { videoId: syntheticVideo } } } })).toEqual(unavailable)
  expect(kinds(h)).toContain("missing music-service.like")
})
