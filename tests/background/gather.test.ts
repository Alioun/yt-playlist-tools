import { afterEach, expect, test } from "bun:test"
import type { Background } from "../../src/background/boot"
import { acct, browser, DAY, eventually, video, watch } from "./world"

const running: Background[] = []
afterEach(async () => {
  for (const background of running.splice(0)) await background.dispose().catch(() => {})
})

test("Gather in the popup saves the window's video tabs to the gather playlist, closes them, and Undo removes them and reopens the tabs", async () => {
  const world = browser({})
  await world.seed()
  world.tabs.open(1, "https://www.youtube.com/", { active: true })
  for (const n of [1, 2, 3]) world.tabs.open(9 + n, watch(n))
  world.tabs.open(13, `${watch(1)}&t=42`)
  world.tabs.open(14, "https://www.youtube.com/shorts/gat00000009")
  const before = world.tabs.urls()
  const w = world.worker()
  running.push(w.background)
  await w.background.ready
  await w.hello(1)

  const saved = await w.line(w.popup.call("ui.gather", {}))
  expect(saved).toEqual({ text: "Saved 3 videos to Watch later and closed their tabs.", tone: "confirmation", action: { kind: "undo", id: expect.any(String) } })
  expect([...world.site.later.values()]).toEqual([video(1), video(2), video(3)])
  expect(world.tabs.urls()).toEqual(["https://www.youtube.com/", "https://www.youtube.com/shorts/gat00000009"])
  expect([10, 11, 12, 13].some(id => world.messagedTabs.has(id))).toBe(false)
  expect(world.pushes.some(push => push.running && push.line?.text === "Checking 1 of 3…")).toBe(true)
  expect(world.site.toasts).toEqual([])

  const idle = await w.line(w.popup.call("ui.gathers", {}))
  expect(idle).toEqual({ text: "Last gather: 3 videos into Watch later, this minute", tone: "muted", action: saved.action })
  const recent = await w.popup.call("ui.recentAdds", { acct: acct as never })
  expect(recent.kind === "answered" && recent.result.kind === "recent" && recent.result.entries.map(entry => [entry.gather, entry.videos.length])).toEqual([[true, 3]])

  if (saved.action?.kind !== "undo") throw new Error("No Undo")
  const undone = await w.line(w.popup.call("ui.gatherUndo", { id: saved.action.id }))
  expect(undone).toEqual({ text: "Removed 3 videos from Watch later and reopened their tabs.", tone: "confirmation", action: null })
  expect([...world.site.later.values()]).toEqual([])
  expect(world.tabs.urls()).toEqual(before)
  expect(await w.popup.call("ui.gathers", {})).toEqual({ kind: "answered", result: { kind: "gathers", running: false, line: null } })
})

test("a worker that stops after closing the tabs, before it read them back, still undoes the gather from the saved plan", async () => {
  const world = browser({})
  await world.seed()
  world.tabs.open(1, "https://www.youtube.com/", { active: true })
  world.tabs.open(20, watch(5))
  world.tabs.open(21, watch(6))
  const before = world.tabs.urls()
  const first = world.worker()
  running.push(first.background)
  await first.background.ready
  await first.hello(1)
  let stopped = false
  world.onRemove(async ids => {
    await world.tabs.native.remove(ids)
    stopped = true
    void first.background.dispose()
    return new Promise<void>(() => {})
  })
  void first.popup.call("ui.gather", {})
  await eventually(() => stopped, "the remove call")
  expect(world.tabs.urls()).toEqual(["https://www.youtube.com/"])
  world.onRemove(ids => world.tabs.native.remove(ids))

  const second = world.worker()
  running.push(second.background)
  await second.background.ready
  await second.hello(1)
  const idle = await second.line(second.popup.call("ui.gathers", {}))
  expect(idle).toMatchObject({ text: "Last gather: 2 videos into Watch later, this minute", action: { kind: "undo" } })
  if (idle.action?.kind !== "undo") throw new Error("No Undo after the restart")
  const undone = await second.line(second.popup.call("ui.gatherUndo", { id: idle.action.id }))
  expect(undone).toEqual({ text: "Removed 2 videos from Watch later and reopened their tabs.", tone: "confirmation", action: null })
  expect([...world.site.later.values()]).toEqual([])
  expect(world.tabs.urls()).toEqual(before)
})

test("opening the popup wakes automatic gathering, which saves a tab unvisited for a day from the signed-in tab, closes it and shows its toast there", async () => {
  const world = browser({ auto: { unvisited: true, after: "1d", background: false, count: false, n: 10 } })
  await world.seed()
  world.tabs.open(1, "https://www.youtube.com/", { active: true })
  world.tabs.open(30, watch(7), { lastAccessed: Date.now() - 2 * DAY })
  world.tabs.open(31, watch(8))
  const w = world.worker()
  running.push(w.background)
  await w.background.ready
  await w.hello(1)
  world.closePopup()

  await w.popup.call("ui.gathers", {})
  await eventually(() => world.site.toasts.length > 0, "the gather toast")
  expect([...world.site.later.values()]).toEqual([video(7)])
  expect(world.tabs.urls()).toEqual(["https://www.youtube.com/", watch(8)])
  expect(world.site.toasts).toEqual([{ text: "Gathered 1 video into Watch later by itself and closed its tab", tone: "confirmation", auto: true, undo: expect.any(String) }])
  expect(world.badges).toContainEqual(["title", { tabId: 1, title: "Gathered 1 video into Watch later by itself, this minute." }])
  expect(await w.line(w.popup.call("ui.gathers", {}))).toMatchObject({ text: "Gathered 1 video into Watch later by itself, this minute.", action: { kind: "undo" } })
})

test("two gathers in a row whose YouTube's player tab shows no list reach the Monitor, so Diagnostics lists them and the next player gather answers that the player isn't working", async () => {
  const world = browser({ to: "player" })
  await world.seed()
  world.tabs.windows.set(2, { id: 2, incognito: false, focused: false })
  world.tabs.open(1, "https://www.youtube.com/", { active: true })
  world.tabs.open(40, watch(1))
  world.tabs.open(41, watch(2), { windowId: 2 })
  const w = world.worker()
  running.push(w.background)
  await w.background.ready
  // The tab registry starts once the store reports consent; a hello before that is dropped, as a real tab's would be.
  await eventually(async () => {
    const status = await w.popup.call("ui.status", {})
    return status.kind === "answered" && status.result.kind === "status"
  }, "the popup's status")
  await w.hello(1)

  // YouTube never turns the new tabs' watch_videos address into a list, so neither 10 s check confirms it. Two windows wait out one 10 s together.
  const missed = await Promise.all([w.line(w.popup.call("ui.gather", {})), w.line(w.popupIn(2).call("ui.gather", {}))])
  for (const line of missed) expect(line.text).toContain("Couldn't confirm YouTube made the list, so all tabs stay open.")
  expect(world.tabs.urls(1)).toContain(watch(1))
  expect(world.tabs.urls(2)).toContain(watch(2))

  // Each miss reaches the Monitor just after the popup's answer.
  let signals: unknown[] = []
  await eventually(async () => {
    const diagnostics = await w.popup.call("ui.diagnostics", { check: false })
    signals = diagnostics.kind === "answered" && diagnostics.result.kind === "diagnostics" ? [...diagnostics.result.signals] : []
    return signals.some(row => (row as { count: number }).count === 2)
  }, "both misses in Diagnostics")
  expect(signals).toEqual([expect.objectContaining({ site: "www", feature: "gather", job: null, route: null, kind: "no-effect", count: 2 })])
  const opened = world.tabs.tabs.size
  expect(await w.line(w.popup.call("ui.gather", {}))).toMatchObject({ text: "Gathering into YouTube's player isn't working right now because YouTube changed something.", tone: "failure" })
  expect(world.tabs.tabs.size).toBe(opened)
}, 30_000)
