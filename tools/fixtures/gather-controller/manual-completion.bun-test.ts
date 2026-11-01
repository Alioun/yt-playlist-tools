import { describe, expect, test } from "bun:test"
import { createAddFlow, type Owner } from "../../../src/background/add-flow/add-flow"
import { createGatherBrowser, type GatherBrowser } from "../../../src/background/gather/browser"
import { createTabsExecution } from "../../../src/background/gather/execution"
import { createGather } from "../../../src/background/gather/gather"
import { a, nativeTab, signedIn } from "../tabs/harness"
import { gatherFixture, later, normalWindow, privateWindow, video, watch } from "./harness"

const v = [1, 2, 3, 4, 5].map(video)
// Everything the owner holds outside storage.session: local and sync.
const persistent = (f: ReturnType<typeof gatherFixture>) => {
  const { session: _session, ...rest } = f.tabs.removal.state()
  return JSON.stringify(rest)
}

describe("normal manual history in the canonical session record", () => {
  test("a player gather keeps its last result, paces its window and survives a worker restart", async () => {
    const f = gatherFixture()
    f.window.open(10, watch(v[0]!), "One")
    expect(await f.drive(f.gather.now(normalWindow))).toMatchObject({ kind: "player", confirmed: true, closed: 1 })
    const gather = JSON.stringify(f.tabs.stored().gather)
    expect(gather).toContain(`"to":"player","windowId":1,"count":1`)
    expect(gather).toContain(`"paced":{"1":`)
    f.gather.dispose()
    const next = f.restart()
    const state = await next.last("normal")
    expect(state.last).toEqual([])
    expect(state.history.map(record => [record.kind, record.to])).toEqual([["sent", "player"]])
    expect(state.undoable).toEqual([])
    expect(persistent(f)).not.toContain(v[0]!)
  })

  test("a check that gathers nothing writes nothing", async () => {
    const f = gatherFixture()
    const before = f.tabs.sessionWrites().length
    expect(await f.drive(f.gather.now(normalWindow))).toMatchObject({ kind: "no-videos" })
    expect(f.tabs.sessionWrites().length).toBe(before)
  })

  test("every video already in still closes, and Undo reopens those tabs without removing any playlist entry", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.yt.put(a, later, v[0]!)
    f.yt.put(a, later, v[1]!)
    f.window.open(10, watch(v[0]!), "One")
    f.window.open(11, watch(v[1]!), "Two")
    const gathered = await f.drive(f.gather.now(normalWindow))
    expect(gathered).toMatchObject({ kind: "playlist", saved: 0, already: 2, closed: 2, kept: true })
    if (gathered.kind !== "playlist" || !gathered.undo) throw new Error("expected a reopen record")
    expect(f.tabs.stored().recentAdds ?? []).toEqual([])
    const removals = f.yt.count("removeBatch") + f.yt.count("remove")
    const before = f.window.created().length
    expect(await f.drive(f.gather.undo(gathered.undo, normalWindow))).toEqual({ kind: "undone", reopened: 2 })
    expect(f.yt.count("removeBatch") + f.yt.count("remove")).toBe(removals)
    expect(f.yt.has(a, later, v[0]!) && f.yt.has(a, later, v[1]!)).toBe(true)
    expect(f.window.created().slice(before).map(call => call.kind === "create" ? call.url : null)).toEqual([watch(v[0]!), watch(v[1]!)])
    expect(await f.drive(f.gather.undo(gathered.undo, normalWindow))).toEqual({ kind: "expired" })
  })
})

describe("closing is a plan until the browser shows the tab gone", () => {
  test("a partial native removal records only the tab that disappeared, and Undo reopens only that one", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.window.open(10, watch(v[0]!), "One")
    f.window.open(11, watch(v[1]!), "Two")
    f.window.behaviour.survives.add(11)
    const gathered = await f.drive(f.gather.now(normalWindow))
    expect(gathered).toMatchObject({ kind: "playlist", saved: 2, closed: 1, unconfirmed: 1 })
    expect(f.window.removeCalls()).toEqual([[10, 11]])
    const gather = JSON.stringify(f.tabs.stored().gather)
    expect(gather).toContain(`"closed":[{"url":"${watch(v[0]!)}","index":0,"title":"One"}]`)
    expect(gather).not.toContain(`"closing"`)
    if (gathered.kind !== "playlist" || !gathered.undo) throw new Error("expected an undoable gather")
    const before = f.window.created().length
    expect(await f.drive(f.gather.undo(gathered.undo, normalWindow))).toEqual({ kind: "undone", reopened: 1 })
    expect(f.window.created().slice(before).map(call => call.kind === "create" ? call.url : null)).toEqual([watch(v[0]!)])
  })

  test("a rejected remove call is never retried and nothing it may not have closed reopens", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.window.open(10, watch(v[0]!), "One")
    f.window.open(11, watch(v[1]!), "Two")
    f.window.behaviour.survives.add(10).add(11)
    f.window.behaviour.removeRejects = true
    const gathered = await f.drive(f.gather.now(normalWindow))
    expect(gathered).toMatchObject({ kind: "playlist", saved: 2, closed: 0, unconfirmed: 2 })
    expect(f.window.removeCalls().length).toBe(1)
    if (gathered.kind !== "playlist" || !gathered.undo) throw new Error("expected an undoable gather")
    const before = f.window.created().length
    expect(await f.drive(f.gather.undo(gathered.undo, normalWindow))).toEqual({ kind: "undone", reopened: 0 })
    expect(f.window.created().length).toBe(before)
  })

  test("an unreadable tab after the remove call is not proof of closure", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.window.open(10, watch(v[0]!), "One")
    const remove = f.window.native.remove
    f.window.native.remove = async ids => { const answer = await remove(ids); f.window.behaviour.unreadable.add(10); return answer }
    const gathered = await f.drive(f.gather.now(normalWindow))
    expect(gathered).toMatchObject({ kind: "playlist", saved: 1, closed: 0, unconfirmed: 1 })
    if (gathered.kind !== "playlist" || !gathered.undo) throw new Error("expected an undoable gather")
    const before = f.window.created().length
    expect(await f.drive(f.gather.undo(gathered.undo, normalWindow))).toEqual({ kind: "undone", reopened: 0 })
    expect(f.window.created().length).toBe(before)
  })

  test("a tab navigated after the record was planned is rechecked and left out of the remove call", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.window.open(10, watch(v[0]!), "One")
    f.window.open(11, watch(v[1]!), "Two")
    const read = f.window.native.read
    // The record's plan reads tab 11 once; it navigates before the read right before the remove call.
    f.window.native.read = async tabId => {
      if (tabId === 11 && f.window.calls.filter(call => call.kind === "read" && call.tabId === 11).length === 1) f.window.navigate(11, "https://www.youtube.com/@channel")
      return read(tabId)
    }
    const gathered = await f.drive(f.gather.now(normalWindow))
    expect(gathered).toMatchObject({ kind: "playlist", saved: 2, closed: 1, navigated: 1 })
    expect(f.window.removeCalls()).toEqual([[10]])
  })
})

describe("Undo reopening and kept tabs", () => {
  test("reopened tab IDs persist in the normal session's kept list across a restart, and activation removes them", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.window.open(10, watch(v[0]!), "One")
    const gathered = await f.drive(f.gather.now(normalWindow))
    if (gathered.kind !== "playlist" || !gathered.undo) throw new Error("expected an undoable gather")
    expect(await f.drive(f.gather.undo(gathered.undo, normalWindow))).toEqual({ kind: "undone", reopened: 1 })
    expect(f.window.reopenTitles).toEqual([{ url: watch(v[0]!), title: "One" }])
    const reopened = (await f.gather.last("normal")).kept
    expect(reopened.length).toBe(1)
    await f.yt.flow.quiesce()
    f.gather.dispose()
    const next = f.restart()
    expect((await next.last("normal")).kept).toEqual(reopened)
    await f.drive(next.activated(reopened[0]!, "normal"))
    expect((await next.last("normal")).kept).toEqual([])
    expect(persistent(f)).not.toContain(watch(v[0]!))
  })

  test("a private gather's history and reopened IDs never reach storage", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.window.open(20, watch(v[0]!), "Private", { windowId: 2 })
    const gathered = await f.drive(f.gather.now(privateWindow))
    if (gathered.kind !== "playlist" || !gathered.undo) throw new Error("expected an undoable private gather")
    expect(await f.drive(f.gather.undo(gathered.undo, privateWindow))).toEqual({ kind: "undone", reopened: 1 })
    expect((await f.gather.last("private")).kept.length).toBe(1)
    expect((await f.gather.last("normal")).kept).toEqual([])
    expect(JSON.stringify(f.tabs.removal.state())).not.toContain(v[0]!)
  })
})

describe("revocation during an awaited boundary", () => {
  test("account removal while the batch waits leaves no record for that account and closes nothing", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.window.open(10, watch(v[0]!), "One")
    f.yt.block("addBatch")
    const pending = f.gather.now(normalWindow)
    await f.drive(new Promise(resolve => setTimeout(resolve, 0)))
    const ui = { kind: "ui", windowId: 1, incognito: false } as const
    const prepared = await f.tabs.owner.prepareAccountRemoval(ui, a)
    if (prepared.kind !== "confirmation-required") throw new Error(`Removal not prepared: ${prepared.kind}`)
    expect((await f.tabs.owner.removeAccountSetup(ui, prepared.confirmation)).kind).toBe("committed")
    f.yt.open()
    const gathered = await f.drive(pending)
    expect(gathered).toMatchObject({ kind: "playlist", kept: false, undo: null, closed: 0 })
    expect(f.window.removeCalls()).toEqual([])
    expect(JSON.stringify(f.tabs.stored().gather ?? {})).not.toContain(a)
  })

  test("withdrawal while the batch waits stops the gather; nothing closes and nothing is recorded", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.window.open(10, watch(v[0]!), "One")
    f.yt.block("addBatch")
    const pending = f.gather.now(normalWindow)
    await f.drive(new Promise(resolve => setTimeout(resolve, 0)))
    f.yt.withdraw()
    f.yt.open()
    expect(await f.drive(pending)).toMatchObject({ kind: "stopped" })
    expect(f.window.removeCalls()).toEqual([])
    expect(JSON.stringify(f.tabs.stored().gather ?? {})).not.toContain(v[0]!)
  })
})

describe("the real AddFlow execution adapter over Tabs", () => {
  test("a popup gather serves from the account in view through Tabs.serve and closes the serving source tab last", async () => {
    const f = gatherFixture({ settings: { to: "playlist" } })
    f.tabs.seedTab(nativeTab(10, { windowId: 1, active: true }), signedIn(a))
    f.tabs.seedTab(nativeTab(11, { windowId: 1 }), signedIn(a))
    f.window.open(10, watch(v[0]!), "One", { index: 0 })
    f.window.open(11, watch(v[1]!), "Two", { index: 1 })
    const jobs: string[] = []
    f.tabs.hooks.run = async (tabId, invocation) => {
      jobs.push(`${tabId}:${invocation.job.kind}`)
      if (invocation.job.kind === "membership") return { ok: true, data: { rows: [] }, route: f.ok(null).route }
      if (invocation.job.kind === "addBatch") return { ok: true, data: { results: invocation.job.videoIds.map(videoId => ({ videoId, setVideoId: null })) }, route: f.ok(null).route }
      return { ok: false, reason: "unavailable" }
    }
    // The settings owner is the composition's Store port. Only the page-native job runner and the browser tab strip are fakes.
    const owner: Owner = { shared: () => ({ on: true, feedback: true }), account: () => ({ targets: [], created: {} }), writable: () => true, mark: () => {} }
    const flow = createAddFlow({
      execution: createTabsExecution(f.tabs.engine, async origin => ({ windowId: origin.windowId, incognito: origin.incognito, activeTabId: 10 })),
      owner, session: f.tabs.session, now: () => f.tabs.clock.now(), wait: async () => {}, generation: () => "adapter"
    })
    const gather = createGather({ ...f.ports(), addFlow: flow })
    const gathered = await f.drive(gather.now(normalWindow))
    expect(gathered).toMatchObject({ kind: "playlist", saved: 2, closed: 2 })
    expect(jobs.length > 0 && jobs.every(job => job.startsWith("10:"))).toBe(true)
    expect(f.window.removeCalls()).toEqual([[11, 10]])
  })
})

describe("Firefox reopening at the browser boundary", () => {
  test("passes discarded and title together, and opens the tab loaded when the unloaded tab is refused", async () => {
    const created: Record<string, unknown>[] = []
    let refuse = false
    const fake: GatherBrowser = {
      tabs: {
        query: async () => [], get: async () => { throw new Error("gone") }, remove: async () => {},
        create: async props => {
          created.push({ ...props })
          if (refuse && props.discarded) throw new Error("discarded refused")
          return { id: 77 + created.length, windowId: props.windowId, index: props.index ?? 0, url: props.url, incognito: false, active: props.active,
            pinned: false, highlighted: false, selected: false, discarded: props.discarded ?? false, autoDiscardable: true, groupId: -1, frozen: false }
        }
      },
      windows: { get: async () => ({}), create: async () => ({ tabs: [] }) }
    }
    const firefox = createGatherBrowser(fake, { unloadedReopen: true })
    expect(await firefox.create({ windowId: 1, url: watch(v[0]!), active: false, index: 3 }, { title: "One" })).toMatchObject({ kind: "created" })
    expect(created[0]).toEqual({ windowId: 1, url: watch(v[0]!), active: false, index: 3, discarded: true, title: "One" })
    refuse = true
    expect(await firefox.create({ windowId: 1, url: watch(v[1]!), active: false, index: 4 }, { title: "Two" })).toMatchObject({ kind: "created" })
    expect(created.slice(1)).toEqual([
      { windowId: 1, url: watch(v[1]!), active: false, index: 4, discarded: true, title: "Two" },
      { windowId: 1, url: watch(v[1]!), active: false, index: 4 }])
    const chrome = createGatherBrowser(fake, { unloadedReopen: false })
    created.length = 0
    await chrome.create({ windowId: 1, url: watch(v[2]!), active: false, index: 0 }, { title: "Three" })
    expect(created).toEqual([{ windowId: 1, url: watch(v[2]!), active: false, index: 0 }])
  })
})
