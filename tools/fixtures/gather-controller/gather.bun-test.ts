import { describe, expect, test } from "bun:test"
import { no } from "../add-flow/harness"
import { a } from "../tabs/harness"
import { gatherFixture, later, normalWindow, privateWindow, video, watch } from "./harness"

const v = [1, 2, 3, 4, 5].map(video)

describe("gather into YouTube's player", () => {
  test("opens one ordered list with each video once, confirms its address, then closes every source occurrence", async () => {
    const f = gatherFixture()
    f.window.open(10, watch(v[0]!), "First - YouTube")
    f.window.open(11, `${watch(v[1]!)}&list=PLx&t=30`, "Second - YouTube")
    f.window.open(12, watch(v[0]!), "First again - YouTube")
    f.window.open(13, `https://www.youtube.com/live/${v[2]}`, "Live - YouTube")
    f.window.open(14, "https://www.reddit.com/r/videos/watch?v=gat00000009", "Rick Astley - YouTube")
    f.window.open(15, "https://www.youtube.com/shorts/gat00000008", "Short - YouTube")
    const result = await f.drive(f.gather.now(normalWindow))
    expect(result).toMatchObject({ kind: "player", count: 3, confirmed: true, closed: 4, navigated: 0 })
    expect(f.window.created()).toEqual([{ kind: "create", windowId: 1, url: `https://www.youtube.com/watch_videos?video_ids=${v[0]},${v[1]},${v[2]}`, active: true }])
    expect(f.window.removed().sort()).toEqual([10, 11, 12, 13])
    expect([...f.window.rows.keys()]).toContain(14)
    expect(f.tabs.calls.some(call => "tabId" in call && [10, 11, 12, 13].includes(call.tabId))).toBe(false)
  })

  test("a created tab that never shows a list is no confirmation, closes nothing and signals no-effect", async () => {
    const f = gatherFixture()
    f.window.behaviour.listAfter = null
    f.window.open(10, watch(v[0]!), "First - YouTube")
    const result = await f.drive(f.gather.now(normalWindow))
    expect(result).toMatchObject({ kind: "player", confirmed: false, closed: 0 })
    expect(f.window.removed()).toEqual([])
    expect(f.events).toContainEqual({ kind: "signal", destination: "player", signal: "no-effect" })
  })

  test("more than 50 goes to the queue and says why; a health refusal closes nothing", async () => {
    const f = gatherFixture()
    for (let n = 0; n < 51; n++) f.window.open(30 + n, watch(video(100 + n)), `Video ${n}`)
    f.tabs.hooks.run = async (_tabId, invocation) => ({ ok: true, data: { confirmed: true, count: "videoIds" in invocation.job ? invocation.job.videoIds.length : 0 }, route: f.ok(null).route })
    expect(await f.drive(f.gather.now(normalWindow))).toMatchObject({ kind: "queue", why: "player-takes-50", count: 51, outcome: "confirmed", closed: 51 })
    const refused = gatherFixture({ health: { player: "not-working" } })
    refused.window.open(10, watch(v[0]!), "First")
    expect(await refused.drive(refused.gather.now(normalWindow))).toMatchObject({ kind: "unhealthy", to: "player" })
    expect(refused.window.created()).toEqual([])
    expect(refused.window.removed()).toEqual([])
  })
})

describe("gather into YouTube's queue", () => {
  test("sends 199 once after the first loads, keeps the 200 limit and leaves excess tabs open", async () => {
    const f = gatherFixture({ settings: { to: "queue" } })
    for (let n = 0; n < 203; n++) f.window.open(300 + n, watch(video(1000 + n)), `Video ${n}`)
    const sent: number[] = []
    f.tabs.hooks.run = async (_tabId, invocation) => {
      const count = invocation.job.kind === "queueAddList" ? invocation.job.videoIds.length : 0
      sent.push(count)
      return { ok: true, data: { confirmed: true, count }, route: f.ok(null).route }
    }
    expect(await f.drive(f.gather.now(normalWindow))).toMatchObject({ kind: "queue", why: "chosen", count: 200, left: 3, outcome: "confirmed", closed: 200 })
    expect(sent).toEqual([199])
    expect([...f.window.rows.keys()].filter(id => id >= 300 && id < 600).sort()).toEqual([500, 501, 502])
  })

  test("a partial queue confirmation or an unloaded tab closes nothing", async () => {
    const partial = gatherFixture({ settings: { to: "queue" } })
    for (const [n, id] of v.slice(0, 3).entries()) partial.window.open(10 + n, watch(id), `V${n}`)
    partial.tabs.hooks.run = async () => ({ ok: true, data: { confirmed: false, count: 1 }, route: partial.ok(null).route })
    expect(await partial.drive(partial.gather.now(normalWindow))).toMatchObject({ kind: "queue", outcome: "not-confirmed", closed: 0 })
    expect(partial.window.removed()).toEqual([])
    const slow = gatherFixture({ settings: { to: "queue" } })
    slow.window.behaviour.loadAfter = null
    for (const [n, id] of v.slice(0, 3).entries()) slow.window.open(10 + n, watch(id), `V${n}`)
    expect(await slow.drive(slow.gather.now(normalWindow))).toMatchObject({ kind: "queue", outcome: "not-loaded", closed: 0 })
    expect(slow.tabs.calls.filter(call => call.kind === "run")).toEqual([])
  })
})

describe("gather into the gather playlist", () => {
  test("one batch with per-video outcomes closes only added and already-in tabs that still show their video, in one canonical write", async () => {
    const f = gatherFixture()
    f.settings.to = "playlist"
    f.yt.put(a, later, v[1]!)
    f.window.open(10, watch(v[0]!), "Added - YouTube")
    f.window.open(11, watch(v[1]!), "Already - YouTube")
    f.window.open(12, watch(v[2]!), "Fails - YouTube")
    f.window.open(13, watch(v[3]!), "Navigates - YouTube")
    f.yt.script.membership.push(() => undefined, () => undefined, () => no<"membership">("failed", 403))
    f.yt.block("addBatch")
    const pending = f.gather.now(normalWindow)
    await f.drive(new Promise(resolve => setTimeout(resolve, 0)))
    f.window.navigate(13, "https://www.youtube.com/@channel")
    f.yt.open()
    const result = await f.drive(pending)
    expect(result).toMatchObject({ kind: "playlist", saved: 2, already: 1, closed: 2, navigated: 1, kept: true, retry: true })
    expect(result.kind === "playlist" && result.failed.map(({ video }) => video)).toEqual([v[2]])
    expect(f.window.removed().sort()).toEqual([10, 11])
    const stored = f.tabs.stored()
    expect(JSON.stringify(stored.gather)).toContain(`"closed":[{"url":"${watch(v[0]!)}","index":0,"title":"Added - YouTube"},{"url":"${watch(v[1]!)}","index":1,"title":"Already - YouTube"}]`)
    expect(Array.isArray(stored.recentAdds) && stored.recentAdds.length).toBe(1)
  })

  test("Undo removes exactly the added entries, then reopens in the background at old places, or in a new window", async () => {
    const f = gatherFixture()
    f.settings.to = "playlist"
    f.window.open(10, watch(v[0]!), "One")
    f.window.open(11, watch(v[1]!), "Two")
    f.window.open(12, "https://www.youtube.com/feed/subscriptions", "Feed")
    const gathered = await f.drive(f.gather.now(normalWindow))
    if (gathered.kind !== "playlist" || !gathered.undo) throw new Error("expected an undoable gather")
    f.yt.put(a, later, v[4]!)
    const before = f.window.created().length
    expect(await f.drive(f.gather.undo(gathered.undo, normalWindow))).toEqual({ kind: "undone", reopened: 2 })
    expect(f.yt.has(a, later, v[0]!) || f.yt.has(a, later, v[1]!)).toBe(false)
    expect(f.yt.has(a, later, v[4]!)).toBe(true)
    expect(f.window.created().slice(before)).toEqual([
      { kind: "create", windowId: 1, url: watch(v[0]!), active: false, index: 0 },
      { kind: "create", windowId: 1, url: watch(v[1]!), active: false, index: 1 }])
    expect((await f.gather.last("normal")).kept.length).toBe(2)

    const gone = gatherFixture({ settings: { to: "playlist" } })
    gone.window.open(10, watch(v[0]!), "One")
    const again = await gone.drive(gone.gather.now(normalWindow))
    if (again.kind !== "playlist" || !again.undo) throw new Error("expected an undoable gather")
    gone.window.closeWindow(1)
    expect(await gone.drive(gone.gather.undo(again.undo, normalWindow))).toEqual({ kind: "undone", reopened: 1 })
    expect(gone.window.calls.filter(call => call.kind === "create-window")).toEqual([{ kind: "create-window", urls: [watch(v[0]!)] }])
  })

  test("a failed or partial Undo reopens nothing", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.window.open(10, watch(v[0]!), "One")
    f.window.open(11, watch(v[1]!), "Two")
    const gathered = await f.drive(f.gather.now(normalWindow))
    if (gathered.kind !== "playlist" || !gathered.undo) throw new Error("expected an undoable gather")
    const before = f.window.created().length
    f.yt.script.removeBatch.push(() => ({ kind: "result", result: { ok: true, data: { removed: 1 }, route: f.ok(null).route } }))
    expect(await f.drive(f.gather.undo(gathered.undo, normalWindow))).toEqual({ kind: "undo-failed" })
    expect(f.window.created().length).toBe(before)
  })

  test("explicit Try again starts the failed videos from membership; nothing retries by itself", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.window.open(10, watch(v[0]!), "One")
    f.yt.script.membership.push(() => no<"membership">("failed", 403))
    const failed = await f.drive(f.gather.now(normalWindow))
    expect(failed).toMatchObject({ kind: "playlist", saved: 0, retry: true, closed: 0 })
    const reads = f.yt.count("membership")
    await f.drive(new Promise(resolve => setTimeout(resolve, 0)))
    expect(f.yt.count("membership")).toBe(reads)
    const retried = await f.drive(f.gather.retry(failed.id, normalWindow))
    expect(retried).toMatchObject({ kind: "playlist", saved: 1, closed: 1 })
    expect(f.yt.count("membership")).toBe(reads + 1)
  })

  test("a private window's gather stays in memory and out of Recent adds", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.window.open(20, watch(v[0]!), "Private", { windowId: 2 })
    f.window.open(10, watch(v[1]!), "Normal")
    const result = await f.drive(f.gather.now(privateWindow))
    expect(result).toMatchObject({ kind: "playlist", scope: "private", saved: 1 })
    expect(f.window.removed()).toEqual([20])
    expect(JSON.stringify(f.tabs.stored())).not.toContain(v[0]!)
    expect((await f.gather.last("normal")).last).toEqual([])
    expect((await f.gather.last("private")).last.length).toBe(1)
  })
})

describe("lifetime", () => {
  test("disposal during confirmation closes nothing and revokes retry", async () => {
    const f = gatherFixture()
    f.window.open(10, watch(v[0]!), "One")
    const pending = f.gather.now(normalWindow)
    await f.drive(new Promise(resolve => setTimeout(resolve, 0)))
    f.gather.dispose()
    expect(await f.drive(pending)).toMatchObject({ kind: "stopped" })
    expect(f.window.removed()).toEqual([])
    expect(await f.drive(f.gather.retry("any", normalWindow))).toMatchObject({ kind: "stopped" })
  })

  test("AddFlow quiescence during a batch stops the gather without closing", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.window.open(10, watch(v[0]!), "One")
    f.yt.block("addBatch")
    const pending = f.gather.now(normalWindow)
    await f.drive(new Promise(resolve => setTimeout(resolve, 0)))
    const drained = f.yt.flow.quiesce()
    f.yt.open()
    await drained
    expect(await f.drive(pending)).toMatchObject({ kind: "stopped" })
    expect(f.window.removed()).toEqual([])
  })

  test("a restarted worker recognises and undoes a normal gather from the canonical session record", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.window.open(10, watch(v[0]!), "One")
    const gathered = await f.drive(f.gather.now(normalWindow))
    if (gathered.kind !== "playlist" || !gathered.undo) throw new Error("expected an undoable gather")
    await f.yt.flow.quiesce()
    f.gather.dispose()
    const next = f.restart()
    expect((await next.last("normal")).undoable).toEqual([gathered.undo])
    expect(await f.drive(next.undo(gathered.undo, normalWindow))).toEqual({ kind: "undone", reopened: 1 })
  })
})

describe("orders", () => {
  test("language orders ask the browser's detector with YouTube's ending removed, never a character test", async () => {
    const f = gatherFixture({ settings: { order: "english" }, languages: { "Canción": "other", "Song": "english" } })
    f.window.open(10, watch(v[0]!), "(3) Canción - YouTube")
    f.window.open(11, watch(v[1]!), "Unknown - YouTube")
    f.window.open(12, watch(v[2]!), "Song - YouTube")
    await f.drive(f.gather.now(normalWindow))
    expect(f.window.created()[0]).toMatchObject({ url: `https://www.youtube.com/watch_videos?video_ids=${v[2]},${v[1]},${v[0]}` })
  })
})
