import { expect, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { parseQueueCard, parseQueuePanel } from "../../../src/page/parsers/www-queue"
import {
  added, answer, card, cardCommand, deferred, listA, listB, menuAction, noisyToast, panelData, pending, queueWorld, scrubbed, settle,
  toastAction, videoA, videoB
} from "./specimens"
import type { QueueWorld } from "./specimens"

if (typeof document === "undefined") GlobalRegistrator.register({ url: "https://www.youtube.com" })

const target = () => document.createElement("ytd-rich-item-renderer")
const editEndpoint = (playlistId: string, action: Record<string, unknown>) => ({
  commandMetadata: { webCommandMetadata: { apiUrl: "/youtubei/v1/browse/edit_playlist", sendPost: true } },
  playlistEditEndpoint: { playlistId, actions: [action], params: "IAE%3D" }
})
const kinds = (world: QueueWorld) => world.signals.map(signal => signal.kind)
function released(world: QueueWorld) {
  world.gateway.dispose()
  expect(world.listeners).toBe(0)
  expect(world.timers).toBe(0)
}
const cardMenu = (videoId = videoA) => ({ kind: "openCardMenu", videoId }) as never
function queueAdd(world: QueueWorld, element: Element = target()) { return world.gateway.run({ kind: "queueAdd" }, { target: element }) }

test("signed-out first add resolves the card's own queue command and confirms a new panel entry", async () => {
  const w = queueWorld({ signedIn: false })
  w.scripts.push(pending(world => { world.add(videoA, listA) }))
  const result = await queueAdd(w)
  expect(result).toEqual({ ok: true, data: { confirmed: true, quiet: true, undo: { listId: listA, setVideoId: "entry-1" } }, route: "command.queueAdd" })
  expect(w.calls.map(call => call.endpoint)).toEqual([cardCommand(videoA)])
  expect(kinds(w)).toEqual([])
  released(w)
})

test("missing account keys still add through the quiet TLPQ edit with IAE%3D", async () => {
  const w = queueWorld({ signedIn: "missing" })
  w.replace(listA, [{ videoId: videoB, setVideoId: "entry-old" }])
  w.scripts.push(pending(world => answer(added(world.add(videoA)))))
  const result = await queueAdd(w)
  expect(result).toEqual({ ok: true, data: { confirmed: true, quiet: true, undo: { listId: listA, setVideoId: "entry-1" } }, route: "command.queueAdd" })
  expect(w.calls.map(call => call.endpoint)).toEqual([editEndpoint(listA, { action: "ACTION_ADD_VIDEO", addedVideoId: videoA })])
  expect(JSON.stringify(w.calls[0]?.endpoint)).not.toContain("clientActions")
  released(w)
})

test("duplicate video IDs confirm only the distinct new entry", async () => {
  const w = queueWorld()
  w.replace(listA, [{ videoId: videoA, setVideoId: "entry-old" }])
  w.scripts.push(pending(world => answer(added(world.add(videoA)))))
  const result = await queueAdd(w)
  expect(result).toEqual({ ok: true, data: { confirmed: true, quiet: true, undo: { listId: listA, setVideoId: "entry-1" } }, route: "command.queueAdd" })
  released(w)
})

test("two adds run one at a time in the app-state lane", async () => {
  const w = queueWorld()
  w.replace(listA, [])
  w.scripts.push(pending(() => undefined), pending(world => answer(added(world.add(videoA)))))
  const first = queueAdd(w), second = queueAdd(w)
  await settle(w, 0)
  expect(w.calls.length).toBe(1)
  await settle(w, 2_000)
  expect(await first).toEqual({ ok: true, data: { confirmed: false, quiet: true }, route: "command.queueAdd" })
  expect(w.calls.length).toBe(2)
  expect(await second).toEqual({ ok: true, data: { confirmed: true, quiet: true, undo: { listId: listA, setVideoId: "entry-1" } }, route: "command.queueAdd" })
  released(w)
})

test("callback success without a panel effect is confirmed false with no Undo", async () => {
  const w = queueWorld()
  w.replace(listA, [])
  w.scripts.push(pending(() => answer(added("entry-claimed"))))
  const result = queueAdd(w)
  await settle(w, 2_000)
  expect(await result).toEqual({ ok: true, data: { confirmed: false, quiet: true }, route: "command.queueAdd" })
  expect(w.calls.length).toBe(1)
  released(w)
})

test("an entry in a replaced queue list never confirms the add", async () => {
  const w = queueWorld()
  w.replace(listA, [{ videoId: videoB, setVideoId: "entry-old" }])
  w.scripts.push(pending(world => { world.replace(listB, [{ videoId: videoA, setVideoId: "entry-new" }]) }))
  const result = queueAdd(w)
  await settle(w, 2_000)
  expect(await result).toEqual({ ok: true, data: { confirmed: false, quiet: true }, route: "command.queueAdd" })
  released(w)
})

test("a noisy quiet route counts its real edit, records quiet-route-noisy once and never resends", async () => {
  const w = queueWorld()
  w.replace(listA, [])
  w.scripts.push(pending(world => answer(added(world.add(videoA), { actions: [noisyToast] }))))
  const result = await queueAdd(w)
  expect(result).toEqual({ ok: true, data: { confirmed: true, quiet: false, undo: { listId: listA, setVideoId: "entry-1" } }, route: "command.queueAdd" })
  expect(kinds(w)).toEqual(["quiet-route-noisy"])
  expect(w.calls.length).toBe(1)
  released(w)
})

test("YouTube's own toast seen during a quiet add marks it noisy", async () => {
  const w = queueWorld()
  w.replace(listA, [])
  w.scripts.push(pending(world => { world.add(videoA); world.emit(toastAction) }))
  const result = await queueAdd(w)
  expect(result).toEqual({ ok: true, data: { confirmed: true, quiet: false, undo: { listId: listA, setVideoId: "entry-1" } }, route: "command.queueAdd" })
  expect(kinds(w)).toEqual(["quiet-route-noisy"])
  released(w)
})

test("a late callback after confirmation is cancelled and changes nothing", async () => {
  const w = queueWorld()
  w.replace(listA, [])
  const late = deferred<ReturnType<typeof answer>>()
  w.scripts.push(pending(world => { world.add(videoA) }, late))
  const result = await queueAdd(w)
  expect(result).toEqual({ ok: true, data: { confirmed: true, quiet: true, undo: { listId: listA, setVideoId: "entry-1" } }, route: "command.queueAdd" })
  expect(w.state.cancels).toBe(1)
  late.resolve(answer({ status: "STATUS_FAILED" }, 409))
  await settle(w, 100)
  expect(kinds(w)).toEqual([])
  released(w)
})

test("stale targets and unrecognised cards send nothing", async () => {
  const stale = queueWorld()
  stale.state.connected = false
  expect(await queueAdd(stale)).toEqual({ ok: false, reason: "unavailable" })
  expect(stale.calls.length).toBe(0)
  released(stale)
  const plain = queueWorld({ card: { videoId: videoA, title: { simpleText: "No queue command" } } })
  expect(await queueAdd(plain)).toEqual({ ok: false, reason: "unavailable" })
  expect(plain.calls.length).toBe(0)
  expect(kinds(plain)).toEqual(["unrecognised"])
  released(plain)
})

test("the miniplayer fallback confirms only a first add whose miniplayer turns active", async () => {
  const first = queueWorld()
  first.state.readable = false
  first.scripts.push(pending(world => { world.state.miniplayer = true }))
  expect(await queueAdd(first)).toEqual({ ok: true, data: { confirmed: true, quiet: true }, route: "command.queueAdd" })
  released(first)
  const already = queueWorld()
  already.state.readable = false
  already.state.miniplayer = true
  already.scripts.push(pending(() => undefined))
  const open = queueAdd(already)
  await settle(already, 2_000)
  expect(await open).toEqual({ ok: true, data: { confirmed: false, quiet: true }, route: "command.queueAdd" })
  released(already)
  const later = queueWorld()
  later.replace(listA, [])
  later.scripts.push(pending(world => { world.state.readable = false; world.state.miniplayer = true }))
  const result = queueAdd(later)
  await settle(later, 2_000)
  expect(await result).toEqual({ ok: true, data: { confirmed: false, quiet: true }, route: "command.queueAdd" })
  released(later)
})

test("a missing resolver is unavailable and a thrown hook is never resent", async () => {
  const missing = queueWorld()
  missing.state.resolver = false
  expect(await queueAdd(missing)).toEqual({ ok: false, reason: "unavailable" })
  expect(kinds(missing)).toEqual(["missing"])
  released(missing)
  const thrown = queueWorld()
  thrown.replace(listA, [])
  thrown.state.faults.add("resolve")
  const result = queueAdd(thrown)
  await settle(thrown, 2_000)
  expect(await result).toEqual({ ok: true, data: { confirmed: false, quiet: true }, route: "command.queueAdd" })
  expect(kinds(thrown)).toEqual(["threw"])
  expect(scrubbed(thrown.signals)).toBe(true)
  released(thrown)
  const actions = queueWorld()
  actions.replace(listA, [])
  actions.state.faults.add("action")
  actions.scripts.push(pending(world => { world.add(videoA) }))
  expect(await queueAdd(actions)).toEqual({ ok: true, data: { confirmed: true, quiet: true, undo: { listId: listA, setVideoId: "entry-1" } }, route: "command.queueAdd" })
  released(actions)
})

test("Undo removes exactly its entry quietly, refreshes that list and confirms absence", async () => {
  const w = queueWorld()
  w.replace(listA, [{ videoId: videoA, setVideoId: "entry-1" }, { videoId: videoA, setVideoId: "entry-2" }])
  w.scripts.push(pending(world => { world.remove("entry-2"); return answer({ status: "STATUS_SUCCEEDED" }) }), pending(() => answer({})))
  const result = w.gateway.run({ kind: "queueUndo", listId: listA, setVideoId: "entry-2" } as never)
  await settle(w, 100)
  expect(await result).toEqual({ ok: true, data: null, route: "command.queueUndo" })
  expect(w.calls.map(call => call.endpoint)).toEqual([
    editEndpoint(listA, { action: "ACTION_REMOVE_VIDEO", setVideoId: "entry-2" }), { refreshPlaylistCommand: { listId: listA } }
  ])
  expect(JSON.stringify(w.calls)).not.toContain("removedVideoId")
  expect(JSON.stringify(w.calls)).not.toContain("clientActions")
  expect(w.state.entries).toEqual([{ videoId: videoA, setVideoId: "entry-1" }])
  released(w)
})

test("Undo retries the exact entry once after it stays present, then succeeds", async () => {
  const w = queueWorld()
  w.replace(listA, [{ videoId: videoA, setVideoId: "entry-1" }, { videoId: videoA, setVideoId: "entry-2" }])
  w.scripts.push(pending(() => answer({ status: "STATUS_FAILED" }, 409)), pending(() => answer({})),
    pending(world => { world.remove("entry-2"); return answer({ status: "STATUS_SUCCEEDED" }) }), pending(() => answer({})))
  const result = w.gateway.run({ kind: "queueUndo", listId: listA, setVideoId: "entry-2" } as never)
  await settle(w, 2_600)
  expect(await result).toEqual({ ok: true, data: null, route: "command.queueUndo" })
  expect(w.calls.length).toBe(4)
  expect(w.calls.map(call => JSON.stringify(call.endpoint)).every(text => !text.includes("removedVideoId"))).toBe(true)
  expect(w.state.entries).toEqual([{ videoId: videoA, setVideoId: "entry-1" }])
  released(w)
})

test("Undo that never takes effect fails after exactly one retry", async () => {
  const w = queueWorld()
  w.replace(listA, [{ videoId: videoA, setVideoId: "entry-2" }])
  for (let i = 0; i < 4; i++) w.scripts.push(pending(() => answer({})))
  const result = w.gateway.run({ kind: "queueUndo", listId: listA, setVideoId: "entry-2" } as never)
  await settle(w, 5_000)
  expect(await result).toEqual({ ok: false, reason: "failed" })
  expect(w.calls.length).toBe(4)
  released(w)
})

test("Undo sends nothing for an unreadable panel or the same entry ID under another list", async () => {
  const unreadable = queueWorld()
  unreadable.state.readable = false
  const first = unreadable.gateway.run({ kind: "queueUndo", listId: listA, setVideoId: "entry-1" } as never)
  await settle(unreadable, 2_000)
  expect(await first).toEqual({ ok: false, reason: "unavailable" })
  expect(unreadable.calls.length).toBe(0)
  released(unreadable)
  const other = queueWorld()
  other.replace(listB, [{ videoId: videoA, setVideoId: "entry-1" }])
  const second = other.gateway.run({ kind: "queueUndo", listId: listA, setVideoId: "entry-1" } as never)
  await settle(other, 2_000)
  expect(await second).toEqual({ ok: false, reason: "failed" })
  expect(other.calls.length).toBe(0)
  released(other)
})

test("queueAddList sends every ID in order and confirms every occurrence", async () => {
  const w = queueWorld({ signedIn: false })
  const ids = [videoA, videoB, videoA]
  w.scripts.push(pending(world => { for (const id of ids) world.add(id, listA) }))
  const result = w.gateway.run({ kind: "queueAddList", videoIds: ids } as never)
  await settle(w, 0)
  expect(await result).toEqual({ ok: true, data: { confirmed: true, count: 3 }, route: "command.queueAddList" })
  expect(w.calls.map(call => call.endpoint)).toEqual([{ signalServiceEndpoint: { signal: "CLIENT_SIGNAL", actions: [{ addToPlaylistCommand: {
    videoIds: ids, listType: "PLAYLIST_EDIT_LIST_TYPE_QUEUE", openMiniplayer: true,
    onCreateListCommand: { createPlaylistServiceEndpoint: { videoIds: ids, params: "CAQ%3D" } }
  } }] } }])
  released(w)
})

test("queueAddList reports a truthful partial count and never counts pre-existing duplicates", async () => {
  const w = queueWorld()
  w.replace(listA, [{ videoId: videoA, setVideoId: "entry-old" }])
  w.scripts.push(pending(world => { world.add(videoA); world.add(videoB) }))
  const result = w.gateway.run({ kind: "queueAddList", videoIds: [videoA, videoB, videoA] } as never)
  await settle(w, 10_000)
  expect(await result).toEqual({ ok: true, data: { confirmed: false, count: 2 }, route: "command.queueAddList" })
  expect(w.calls.length).toBe(1)
  released(w)
})

test("openCardMenu clicks the targeted card's own menu outside the lane", async () => {
  const w = queueWorld()
  w.replace(listA, [])
  w.scripts.push(pending(() => undefined))
  const held = queueAdd(w)
  await settle(w, 0)
  const element = target()
  const menu = w.gateway.run(cardMenu(), { target: element })
  await settle(w, 0)
  w.emit(menuAction)
  expect(await menu).toEqual({ ok: true, data: null, route: "page-ui.openCardMenu" })
  expect(w.menuTargets).toEqual([element])
  await settle(w, 2_000)
  await held
  w.state.menu = "missing"
  expect(await w.gateway.run(cardMenu(), { target: element })).toEqual({ ok: false, reason: "unavailable" })
  w.state.menu = "clicked"
  const quiet = w.gateway.run(cardMenu(), { target: element })
  await settle(w, 1_000)
  expect(await quiet).toEqual({ ok: false, reason: "unconfirmed" })
  w.state.connected = false
  expect(await w.gateway.run(cardMenu(), { target: element })).toEqual({ ok: false, reason: "unavailable" })
  expect(w.menuTargets.length).toBe(3)
  released(w)
})

test("openCardMenu refuses to click a recycled renderer that now shows another video", async () => {
  const w = queueWorld()
  const element = target()
  w.page.values.targetData = card(videoB)
  expect(await w.gateway.run(cardMenu(videoA), { target: element })).toEqual({ ok: false, reason: "unavailable" })
  expect(w.signals).toEqual([])
  w.page.values.targetData = { unrelated: true }
  expect(await w.gateway.run(cardMenu(videoA), { target: element })).toEqual({ ok: false, reason: "unavailable" })
  expect(w.signals.map(signal => signal.kind)).toEqual(["unrecognised"])
  expect(w.menuTargets).toEqual([])
  expect(w.listeners).toBe(0)
  w.page.values.targetData = card(videoA)
  const menu = w.gateway.run(cardMenu(videoA), { target: element })
  await settle(w, 0)
  w.emit(menuAction)
  expect<unknown>(await menu).toEqual({ ok: true, data: null, route: "page-ui.openCardMenu" })
  expect(w.menuTargets).toEqual([element])
  released(w)
})

test("disposal mid-observation answers and releases every listener, timer and pending callback", async () => {
  const w = queueWorld()
  w.replace(listA, [])
  w.scripts.push(pending(() => undefined))
  const result = queueAdd(w)
  await settle(w, 150)
  w.gateway.dispose()
  expect(await result).toEqual({ ok: false, reason: "unavailable" })
  await settle(w, 2_000)
  expect(w.state.cancels).toBe(1)
  expect(w.listeners).toBe(0)
  expect(w.timers).toBe(0)
})

test("lane deadlines bound queued adds with at most one send each", async () => {
  const w = queueWorld()
  w.replace(listA, [])
  for (let i = 0; i < 6; i++) w.scripts.push(pending(() => undefined))
  const results = Array.from({ length: 6 }, () => queueAdd(w))
  await settle(w, 10_050)
  const settled = await Promise.all(results)
  expect(settled.every(result => result.ok ? result.data.confirmed === false : result.reason === "unconfirmed")).toBe(true)
  expect(w.calls.length).toBeLessThanOrEqual(6)
  released(w)
})

test("queue jobs stay exempt after an account change while account jobs still trip", async () => {
  const w = queueWorld()
  w.replace(listA, [])
  w.page.config.DATASYNC_ID = "different-account"
  w.scripts.push(pending(world => { world.add(videoA) }))
  expect(await queueAdd(w)).toEqual({ ok: true, data: { confirmed: true, quiet: true, undo: { listId: listA, setVideoId: "entry-1" } }, route: "command.queueAdd" })
  expect(await w.gateway.run({ kind: "add", playlistId: "PLsynthetic", videoId: videoA } as never)).toEqual({ ok: false, reason: "accountChanged" })
  released(w)
})

test("panel and card parsers keep list identity, distinct entries and the card's own command", () => {
  expect(parseQueuePanel([{ playlistId: "PLnormal", contents: [] }, panelData(listA, [{ videoId: videoA, setVideoId: "entry-1" }])]))
    .toEqual({ listId: listA, entries: [{ videoId: videoA, setVideoId: "entry-1" }] })
  expect(parseQueuePanel([panelData(listA, [{ videoId: videoA, setVideoId: "entry-1" }, { videoId: videoB, setVideoId: "entry-1" }])])).toBeUndefined()
  expect(parseQueueCard(card(videoA))).toEqual({ videoId: videoA, command: cardCommand(videoA) })
  expect(parseQueueCard({ ...card(videoA), videoId: videoB })).toBeUndefined()
})
