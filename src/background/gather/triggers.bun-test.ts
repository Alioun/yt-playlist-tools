import { afterEach, describe, expect, test } from "bun:test"
import { createGatherTriggers, type GatherTriggers } from "./triggers"
import type { AutomaticServing } from "./gather"
import { gatherFixture, later, video, watch } from "../../../tools/fixtures/gather-controller/harness"
import { a, fixtureView, nativeTab, settle, signedIn } from "../../../tools/fixtures/tabs/harness"
import type { Settings } from "../../shared/model"

const DAY = 86_400_000
const running: GatherTriggers[] = []
afterEach(() => { for (const triggers of running.splice(0)) triggers.dispose() })

function world(auto: Partial<Settings["gather"]["auto"]>, options: { serving?: AutomaticServing | null } = {}) {
  const f = gatherFixture({ settings: { to: "player", close: false, auto: { unvisited: false, after: "1d", background: false, count: false, n: 5, ...auto } } })
  const waits: boolean[] = []
  const servingAsked: number[][] = []
  const serving = options.serving === undefined ? { tabId: 1, acct: a, playlist: later, title: "Watch later" } : options.serving
  const triggers = createGatherTriggers({
    settings: async () => f.settings,
    access: async () => ({ www: true, music: false, musicSection: false }),
    native: f.window.native,
    session: f.tabs.session,
    async serving(_windowId, exclude) { servingAsked.push([...exclude].sort((x, y) => x - y)); return serving },
    gather: f.gather,
    clock: { now: () => f.tabs.clock.wallNow(), after: (ms, run) => f.tabs.clock.after(ms, run) },
    waiting: value => { waits.push(value) }
  })
  running.push(triggers)
  const wall = () => f.tabs.clock.wallNow()
  // The serving tab is the window's active youtube.com tab, on the home page, so it's never a video tab.
  f.window.open(1, "https://www.youtube.com/", "YouTube", { active: true, lastAccessed: wall() })
  // A real tab.hello through the Tabs engine, so the registry keeps how the page started.
  async function hello(tabId: number, start: { hidden: boolean; fresh: boolean }, windowId = 1) {
    f.tabs.seedTab(nativeTab(tabId, { windowId, active: false }), signedIn())
    await f.tabs.engine.seen(tabId, { ...signedIn(), ...start }, fixtureView)
    triggers.seen({ tabId, windowId, incognito: false, ...start })
    triggers.woke("hello")
  }
  async function advance(ms: number) {
    for (let step = 0; step < ms; step += 100) { f.tabs.clock.advance(100); await settle(); await new Promise(resolve => setTimeout(resolve, 0)); await settle() }
  }
  const saved = () => f.yt.entries(a, later).map(({ video }) => video)
  const batches = () => f.yt.calls.filter(call => call.job.kind === "addBatch").length
  return { f, triggers, waits, servingAsked, hello, advance, wall, saved, batches }
}

describe("opened in the background (trigger 2)", () => {
  test("a video tab that loads hidden is saved to the gather playlist a second after it loads, and its tab closes", async () => {
    const w = world({ background: true })
    w.f.window.open(20, watch(video(1)), "One - YouTube")
    await w.hello(20, { hidden: true, fresh: true })
    await w.advance(900)
    expect(w.saved()).toEqual([])
    await w.advance(400)
    expect(w.saved()).toEqual([video(1)])
    expect(w.f.window.removed()).toEqual([20])
    expect(w.servingAsked).toEqual([[20]])
    const stored = w.f.tabs.stored().gather as { accounts: Record<string, { last: { auto: boolean }[] }> }
    expect(stored.accounts[a]?.last[0]?.auto).toBe(true)
  })

  test("a reload, a tab shown when it loaded, and a tab switched to before the second passes are never taken", async () => {
    const w = world({ background: true })
    w.f.window.open(20, watch(video(1)), "Reloaded")
    w.f.window.open(21, watch(video(2)), "Shown")
    w.f.window.open(22, watch(video(3)), "Switched to")
    await w.hello(20, { hidden: true, fresh: false })
    await w.hello(21, { hidden: false, fresh: true })
    await w.hello(22, { hidden: true, fresh: true })
    const row = w.f.window.rows.get(22)
    if (row) row.lastAccessed = w.wall() + 1
    await w.advance(1500)
    expect(w.saved()).toEqual([])
    expect(w.f.window.removed()).toEqual([])
    expect(w.servingAsked).toEqual([])
  })

  test("tabs arriving together are one gather, a second after the last of them", async () => {
    const w = world({ background: true })
    for (const n of [1, 2, 3]) {
      w.f.window.open(20 + n, watch(video(n)), `Video ${n}`)
      await w.hello(20 + n, { hidden: true, fresh: true })
      await w.advance(600)
    }
    expect(w.batches()).toBe(0)
    await w.advance(600)
    expect(w.batches()).toBe(1)
    expect(w.saved()).toEqual([video(1), video(2), video(3)])
  })

  test("a burst that never goes quiet is gathered 10 s after its first tab", async () => {
    const w = world({ background: true })
    for (let n = 1; n <= 14; n++) {
      w.f.window.open(20 + n, watch(video(n)), `Video ${n}`)
      await w.hello(20 + n, { hidden: true, fresh: true })
      await w.advance(900)
    }
    expect(w.batches()).toBe(1)
    expect(w.saved()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(video))
  })

  test("a second burst within the minute waits for the next wake after it", async () => {
    const w = world({ background: true })
    w.f.window.open(20, watch(video(1)), "One")
    await w.hello(20, { hidden: true, fresh: true })
    await w.advance(1200)
    w.f.window.open(21, watch(video(2)), "Two")
    await w.hello(21, { hidden: true, fresh: true })
    await w.advance(1200)
    expect(w.saved()).toEqual([video(1)])
    w.f.tabs.clock.advance(60_000)
    w.triggers.woke("ui")
    await w.advance(200)
    expect(w.saved()).toEqual([video(1), video(2)])
  })

  test("with no signed-in tab to save from, nothing is saved or closed and the row says it's waiting", async () => {
    const w = world({ background: true }, { serving: null })
    w.f.window.open(20, watch(video(1)), "One")
    await w.hello(20, { hidden: true, fresh: true })
    await w.advance(1200)
    expect(w.f.window.removed()).toEqual([])
    expect(w.triggers.waiting()).toBe(true)
    expect(w.waits).toEqual([true])
  })
})

describe("a window reaching N video tabs (trigger 3)", () => {
  test("the load that brings a window to N gathers all of them but the active, pinned and audible tabs", async () => {
    const w = world({ count: true, n: 5 })
    for (let n = 1; n <= 4; n++) w.f.window.open(20 + n, watch(video(n)), `Video ${n}`)
    w.f.window.open(30, watch(video(10)), "Pinned", { pinned: true })
    w.f.window.open(31, watch(video(11)), "Playing", { audible: true })
    w.f.window.open(32, watch(video(12)), "Active", { active: true })
    await w.hello(24, { hidden: false, fresh: true })
    await w.advance(1200)
    expect(w.saved()).toEqual([])
    w.f.window.open(25, watch(video(5)), "Video 5")
    await w.hello(25, { hidden: false, fresh: true })
    await w.advance(1200)
    expect(w.saved().sort()).toEqual([1, 2, 3, 4, 5].map(video).sort())
    expect(w.f.window.removed().sort()).toEqual([21, 22, 23, 24, 25])
  })
})

describe("unvisited for a while (trigger 1)", () => {
  test("a wake checks every normal window for tabs unvisited a day, at most once a minute, and never a private window", async () => {
    const w = world({ unvisited: true })
    w.f.window.open(20, watch(video(1)), "Old", { lastAccessed: w.wall() - 2 * DAY })
    w.f.window.open(21, watch(video(2)), "Recent", { lastAccessed: w.wall() - 1_000 })
    w.f.window.open(40, watch(video(3)), "Private", { windowId: 2, lastAccessed: w.wall() - 2 * DAY })
    w.triggers.woke("ui")
    await w.advance(200)
    expect(w.saved()).toEqual([video(1)])
    expect(w.f.window.removed()).toEqual([20])
    w.f.window.open(22, watch(video(4)), "Old too", { lastAccessed: w.wall() - 2 * DAY })
    w.triggers.woke("ui")
    await w.advance(200)
    expect(w.saved()).toEqual([video(1)])
    w.f.tabs.clock.advance(61_000)
    w.triggers.woke("startup")
    await w.advance(200)
    expect(w.saved()).toEqual([video(1), video(4)])
    expect([...w.f.window.rows.keys()]).toContain(40)
  })

  test("off, or with no automatic option, a wake reads nothing but the settings", async () => {
    const w = world({})
    w.f.window.open(20, watch(video(1)), "Old", { lastAccessed: w.wall() - 2 * DAY })
    w.triggers.woke("ui")
    await w.advance(200)
    expect(w.f.window.calls).toEqual([])
  })
})
